"""
FlightAware AeroAPI v4 client — personal plan.
https://aeroapi.flightaware.com/aeroapi

Personal plan: 10 requests/minute.
One call to /flights/{ident} covers both route (origin/destination) and
flight status (gates, terminals, scheduled/actual times), so the cache
is shared between the /api/route/ and /api/flight-status/ endpoints.

Add AEROAPI_KEY to your .env file.
"""
import os
import time
import threading
import requests

AEROAPI_KEY = os.getenv("AEROAPI_KEY", "")
_BASE       = "https://aeroapi.flightaware.com/aeroapi"
# Personal plan: ~$0.005–0.01/call, $5 free/month ≈ 500–1000 calls.
# Keep TTLs long so repeated lookups of the same flight are free.
_TTL_HIT    = 600     # 10 min — gate/delay rarely changes faster than this
_TTL_MISS   = 3_600   # 1 h   — unknown callsigns unlikely to appear soon

_cache: dict    = {}   # callsign -> (result | None, timestamp)
_inflight: dict = {}   # callsign -> threading.Event (dedup concurrent requests)
_lock = threading.Lock()


def _lookup(callsign: str) -> dict | None:
    """Fetch /flights/{ident}, deduplicating concurrent calls for the same callsign."""
    if not AEROAPI_KEY:
        return None

    # If another thread is already fetching this callsign, wait for it and reuse its result
    with _lock:
        if callsign in _inflight:
            ev = _inflight[callsign]
        else:
            ev = threading.Event()
            _inflight[callsign] = ev
            ev = None  # signal: we are the fetcher

    if ev is not None:  # waiter path
        ev.wait(timeout=6)
        cached = _cache.get(callsign)
        return cached[0] if cached else None

    # Fetcher path
    try:
        r = requests.get(
            f"{_BASE}/flights/{callsign}",
            headers={"x-apikey": AEROAPI_KEY, "Accept": "application/json"},
            timeout=5,
        )
        if r.status_code == 429:
            print(f"[aeroapi] rate limited — {callsign}")
            return None
        if not r.ok:
            print(f"[aeroapi] {callsign} → HTTP {r.status_code}")
            return None
        flights = r.json().get("flights") or []
        result  = flights[0] if flights else None
        print(f"[aeroapi] {callsign} → {'found' if result else 'not found'}")
        return result
    except Exception as exc:
        print(f"[aeroapi] {callsign} → {exc}")
        return None
    finally:
        with _lock:
            ev = _inflight.pop(callsign, None)
        if ev:
            ev.set()


def get_flight(callsign: str) -> dict | None:
    """Return cached AeroAPI flight record for a callsign. TTL 2 min hit / 1 h miss."""
    cs  = callsign.strip().upper()
    now = time.time()
    if cs in _cache:
        cached, ts = _cache[cs]
        ttl = _TTL_HIT if cached is not None else _TTL_MISS
        if now - ts < ttl:
            return cached
    result = _lookup(cs)
    _cache[cs] = (result, now)
    return result


def configured() -> bool:
    return bool(AEROAPI_KEY)


# ── Response formatters ────────────────────────────────────────────────────────

def format_route(flight: dict) -> dict:
    """Convert AeroAPI flight record → /api/route/ compatible response."""
    dep  = (flight.get("origin")      or {}).get("code")        # ICAO e.g. "KLAX"
    arr  = (flight.get("destination") or {}).get("code")        # ICAO e.g. "KJFK"
    if not dep or not arr:
        return {}
    return {
        "callsign":     flight.get("ident"),
        "route":        [dep, arr],
        "operatorCode": flight.get("operator_icao") or flight.get("operator_iata"),
        "flightNumber": flight.get("flight_number") or flight.get("ident"),
    }


# ── Airport flights ────────────────────────────────────────────────────────────

_apf_cache: dict = {}   # airport_ident -> (result, timestamp)
_APF_TTL = 900          # 15 min — schedules don't change faster than this; 2 calls/airport


def _iso_to_unix(iso: str | None) -> int | None:
    if not iso:
        return None
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int(dt.timestamp())
    except Exception:
        return None


def _iso_to_hhmm(iso: str | None) -> str | None:
    if not iso:
        return None
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%H:%M")
    except Exception:
        return None


def _fmt_apf(f: dict, direction: str) -> dict:
    if direction == "dep":
        partner   = f.get("destination") or {}
        sched_iso = f.get("scheduled_out")
        act_iso   = f.get("actual_out") or f.get("estimated_out")
        gate      = f.get("gate_origin")
        terminal  = f.get("terminal_origin")
    else:
        partner   = f.get("origin") or {}
        sched_iso = f.get("scheduled_on")
        act_iso   = f.get("actual_on") or f.get("estimated_on")
        gate      = f.get("gate_destination")
        terminal  = f.get("terminal_destination")

    sched_unix = _iso_to_unix(sched_iso)
    act_unix   = _iso_to_unix(act_iso)
    sched_hhmm = _iso_to_hhmm(sched_iso)
    act_hhmm   = _iso_to_hhmm(act_iso)

    # Compute delay in minutes (positive = late)
    delay_min = None
    if sched_unix and act_unix:
        delay_min = round((act_unix - sched_unix) / 60)

    return {
        "callsign":      (f.get("ident") or "").strip(),
        "partner":       partner.get("code"),
        "partnerIata":   partner.get("code_iata"),
        "scheduledTime": sched_hhmm,
        "actualTime":    act_hhmm if act_hhmm != sched_hhmm else None,
        "delayMin":      delay_min if delay_min and abs(delay_min) >= 5 else None,
        "firstSeen":     sched_unix,
        "lastSeen":      (act_unix or sched_unix),
        "gate":          gate,
        "terminal":      terminal,
        "status":        f.get("status"),
        "aircraft":      f.get("aircraft_type"),
    }


def get_airport_flights(ident: str) -> dict | None:
    """Return departures + arrivals from AeroAPI. 2 calls/airport, cached 15 min."""
    ap  = ident.strip().upper()
    now = time.time()
    if ap in _apf_cache:
        cached, ts = _apf_cache[ap]
        if now - ts < _APF_TTL:
            return cached
    if not AEROAPI_KEY:
        return None

    from datetime import datetime, timezone, timedelta
    start = (datetime.now(timezone.utc) - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%MZ")
    end   = (datetime.now(timezone.utc) + timedelta(hours=6)).strftime("%Y-%m-%dT%H:%MZ")
    params = {"start": start, "end": end, "max_pages": 1}

    deps_raw = _get(f"/airports/{ap}/flights/scheduled_departures", params) or {}
    arrs_raw = _get(f"/airports/{ap}/flights/scheduled_arrivals",   params) or {}

    deps = [_fmt_apf(f, "dep") for f in (deps_raw.get("departures") or deps_raw.get("scheduled_departures") or [])]
    arrs = [_fmt_apf(f, "arr") for f in (arrs_raw.get("arrivals")   or arrs_raw.get("scheduled_arrivals")   or [])]

    if not deps and not arrs:
        _apf_cache[ap] = (None, now)
        print(f"[aeroapi] airport-flights {ap} → no data")
        return None

    result = {"departures": deps[:40], "arrivals": arrs[:40], "source": "aeroapi"}
    _apf_cache[ap] = (result, now)
    print(f"[aeroapi] airport-flights {ap} → {len(deps)} deps, {len(arrs)} arrs")
    return result


def format_status(flight: dict) -> dict:
    """Convert AeroAPI flight record → /api/flight-status/ compatible response."""
    return {
        "status": flight.get("status"),
        "number": flight.get("ident"),
        "departure": {
            "airport":   (flight.get("origin")      or {}).get("code"),
            "terminal":  flight.get("terminal_origin"),
            "gate":      flight.get("gate_origin"),
            "runway":    None,
            "scheduled": flight.get("scheduled_out"),
            "actual":    flight.get("actual_out") or flight.get("estimated_out"),
        },
        "arrival": {
            "airport":   (flight.get("destination") or {}).get("code"),
            "terminal":  flight.get("terminal_destination"),
            "gate":      flight.get("gate_destination"),
            "scheduled": flight.get("scheduled_on"),
            "estimated": flight.get("estimated_on"),
        },
    }
