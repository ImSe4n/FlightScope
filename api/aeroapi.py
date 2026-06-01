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
import requests

AEROAPI_KEY = os.getenv("AEROAPI_KEY", "")
_BASE       = "https://aeroapi.flightaware.com/aeroapi"
_TTL_HIT    = 120     # 2 min — status/gate changes during flight
_TTL_MISS   = 3_600   # 1 h  — unknown callsigns unlikely to appear soon

_cache: dict = {}   # callsign -> (result | None, timestamp)


def _lookup(callsign: str) -> dict | None:
    """Fetch /flights/{ident} and return the most recent flight record."""
    if not AEROAPI_KEY:
        return None
    try:
        r = requests.get(
            f"{_BASE}/flights/{callsign}",
            headers={"x-apikey": AEROAPI_KEY, "Accept": "application/json"},
            timeout=8,
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
