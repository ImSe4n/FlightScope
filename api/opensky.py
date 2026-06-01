"""
OpenSky Network client — token management, flight data fetching, and all
flight-related API routes.
"""
import math
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import pandas as pd
import requests
from fastapi import APIRouter
from api.aeroapi import (
    get_flight as _aero_flight,
    format_route as _aero_route,
    format_status as _aero_status,
    configured as _aero_configured,
    get_airport_flights as _aero_airport_flights,
)

router = APIRouter()

# ── Column names for OpenSky states/all response ──────────────────────────────
FLIGHT_COLUMNS = [
    'icao24', 'callsign', 'origin', 'timePos', 'lastContact',
    'lon', 'lat', 'alt', 'onGround', 'speed', 'heading',
    'vertRate', 'sensors', 'geoAlt', 'squawk', 'spi', 'source',
]


# ── OAuth2 token manager ───────────────────────────────────────────────────────
_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)


class TokenManager:
    def __init__(self):
        self.token      = None
        self.expires_at = None

    def get(self):
        if self.token and self.expires_at and datetime.now() < self.expires_at:
            return self.token
        return self._refresh()

    def _refresh(self):
        cid  = os.getenv("OPENSKY_CLIENT_ID")
        csec = os.getenv("OPENSKY_CLIENT_SECRET")
        if not cid or not csec:
            return None
        try:
            r = requests.post(_TOKEN_URL, data={
                "grant_type":    "client_credentials",
                "client_id":     cid,
                "client_secret": csec,
            }, timeout=10)
            r.raise_for_status()
            d              = r.json()
            self.token     = d["access_token"]
            expires_in     = d.get("expires_in", 1800)
            self.expires_at = datetime.now() + timedelta(seconds=expires_in - 30)
            print(f"[opensky] token refreshed, expires in {expires_in}s")
            return self.token
        except Exception as exc:
            print(f"[opensky] token refresh failed: {exc}")
            self.token = None
            return None

    def headers(self):
        tok = self.get()
        return {"Authorization": f"Bearer {tok}"} if tok else {}


opensky = TokenManager()

# ── Flight cache (stale-while-revalidate) ─────────────────────────────────────
_flight_cache      = None   # last successful response dict
_flight_cache_ts   = 0.0
_flight_backoff_ts = 0.0

FLIGHT_CACHE_TTL = 90    # seconds — keeps OpenSky anonymous call rate under limit
FLIGHT_BACKOFF   = 120   # seconds to wait after a total failure


def get_flight_cache() -> dict | None:
    """Return the current cached flight snapshot (may be None)."""
    return _flight_cache


# ── Data helpers ───────────────────────────────────────────────────────────────
def _opensky_clean(data: dict) -> list:
    if not data.get("states"):
        return []
    df = pd.DataFrame(data["states"]).iloc[:, :17]
    df.columns = FLIGHT_COLUMNS
    df = df[df["lat"].notna() & df["lon"].notna()]
    rows = df.to_dict(orient="records")
    out = []
    for r in rows:
        clean = {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in r.items()}
        if isinstance(clean.get("callsign"), str):
            clean["callsign"] = clean["callsign"].strip() or None
        out.append(clean)
    return out


def _fetch_adsb(url: str, timeout: int = 8) -> list | None:
    """Parse a readsb/tar1090 ADS-B JSON feed and normalise to our schema."""
    try:
        r = requests.get(url, timeout=timeout, headers={"User-Agent": "FlightScope/1.0"})
        if not r.ok:
            print(f"[adsb] {url} -> HTTP {r.status_code}")
            return None
        ac_list = r.json().get("ac", [])
        print(f"[adsb] {url} -> {r.status_code}, {len(ac_list)} aircraft")
        out = []
        for ac in ac_list:
            try:
                lat = ac.get("lat")
                lon = ac.get("lon")
                if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
                    continue
                if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                    continue
                alt = ac.get("alt_baro")
                gnd = (alt == "ground") or not isinstance(alt, (int, float))
                gs  = ac.get("gs")
                br  = ac.get("baro_rate")
                trk = ac.get("track")
                out.append({
                    "icao24":      (ac.get("hex") or "").lower(),
                    "callsign":    (ac.get("flight") or "").strip(),
                    "origin":      None,
                    "timePos":     None,
                    "lastContact": ac.get("seen"),
                    "lon":         float(lon),
                    "lat":         float(lat),
                    "alt":         None if gnd else float(alt) * 0.3048,
                    "onGround":    gnd,
                    "speed":       float(gs)  * 0.514444 if isinstance(gs,  (int, float)) else None,
                    "heading":     float(trk)            if isinstance(trk, (int, float)) else None,
                    "vertRate":    float(br)  * 0.00508  if isinstance(br,  (int, float)) else None,
                    "sensors":     None,
                    "geoAlt":      None,
                    "squawk":      str(ac.get("squawk") or ""),
                    "spi":         False,
                    "source":      0,
                    "acType":      (ac.get("t") or "").strip(),
                })
            except Exception:
                continue
        return out or None
    except Exception as exc:
        print(f"[adsb] {url} -> exception: {exc}")
        return None


# Four large tiles covering major commercial-aviation regions.
# Sequential requests (not parallel) avoid triggering rate limits.
_GLOBAL_TILES = [
    (45, -95),   # North America
    (50,  15),   # Europe + North Africa
    (25,  90),   # Asia (India / China / SE Asia)
    (-20,  25),  # Africa + South Atlantic
]
_TILE_RADIUS = 1200   # nautical miles per tile


def _fetch_global_adsb() -> list | None:
    """Sequential 4-tile fetch from airplanes.live; accepts partial success."""
    seen, combined = set(), []
    for lat, lon in _GLOBAL_TILES:
        url   = f"https://api.airplanes.live/v2/point/{lat}/{lon}/{_TILE_RADIUS}"
        batch = _fetch_adsb(url, timeout=10)
        if batch:
            for f in batch:
                if f["icao24"] not in seen:
                    seen.add(f["icao24"])
                    combined.append(f)
        time.sleep(0.3)   # small gap to be polite
    print(f"[airplanes.live] {len(combined)} unique aircraft from {len(_GLOBAL_TILES)} tiles")
    return combined or None


# Cache of icao24 -> acType from airplanes.live — refreshed in background
_type_cache: dict[str, str] = {}
_type_cache_ts = 0.0
_TYPE_CACHE_TTL = 180   # seconds


def _refresh_type_cache():
    """Grab type codes from two high-traffic airplanes.live tiles, cache them."""
    global _type_cache, _type_cache_ts
    now = time.time()
    if now - _type_cache_ts < _TYPE_CACHE_TTL:
        return

    tiles = [(45, -95), (50, 15)]   # NA + Europe
    new_map: dict[str, str] = {}
    for lat, lon in tiles:
        url   = f"https://api.airplanes.live/v2/point/{lat}/{lon}/1200"
        batch = _fetch_adsb(url, timeout=8)
        if batch:
            for f in batch:
                if f["icao24"] and f.get("acType"):
                    new_map[f["icao24"]] = f["acType"]
        time.sleep(0.3)

    if new_map:
        _type_cache.update(new_map)
        _type_cache_ts = now
        print(f"[types] {len(new_map)} type codes cached from airplanes.live")


# ── Airport code matching (handles IATA ↔ ICAO conversion) ───────────────────
# IATA→ICAO map built lazily from OurAirports data.  Import is deferred inside
# the helper to avoid the circular dependency (airports.py imports opensky.py).
_iata_to_icao: dict[str, str] = {}
_airport_map_ready = False


def _ensure_airport_map():
    global _iata_to_icao, _airport_map_ready
    if _airport_map_ready:
        return
    try:
        from api.airports import _airports_get  # noqa: PLC0415 — deferred on purpose
        df = _airports_get()
        if df is not None:
            for _, row in df.iterrows():
                ident = str(row.get("ident", "")).strip().upper()
                iata  = str(row.get("iata_code", "")).strip().upper()
                if ident and iata and iata != "NAN":
                    _iata_to_icao[iata] = ident
        _airport_map_ready = True
    except Exception as exc:
        print(f"[airport-map] failed to build: {exc}")


def _airport_matches(cached_code: str | None, query: str) -> bool:
    """Return True if cached_code (ICAO) matches query (IATA or ICAO)."""
    if not cached_code:
        return False
    c, q = cached_code.upper(), query.upper()
    if c == q:
        return True
    _ensure_airport_map()
    # Exact IATA→ICAO match (e.g. "LHR" → "EGLL", "LAX" → "KLAX")
    if q in _iata_to_icao and _iata_to_icao[q] == c:
        return True
    # Fallback K-prefix heuristic for airports absent from dataset
    if len(q) == 3 and len(c) == 4 and c[1:] == q:
        return True
    if len(q) == 4 and len(c) == 3 and q[1:] == c:
        return True
    return False


# ── Routes ─────────────────────────────────────────────────────────────────────
@router.get("/api/route-search")
def search_by_route(dep: str = "", arr: str = ""):
    """Return icao24 codes of live flights on the given DEP→ARR route."""
    from_code = dep.strip().upper()
    to_code   = arr.strip().upper()
    if not from_code or not to_code:
        return {"icao24s": [], "from": from_code, "to": to_code}

    cache = get_flight_cache()
    if not cache:
        return {"icao24s": [], "from": from_code, "to": to_code}

    matching: list[str] = []
    uncached: list[tuple[str, str]] = []   # (callsign, icao24)

    for f in cache.get("flights", []):
        cs = (f.get("callsign") or "").strip().upper()
        if not cs:
            continue
        icao24 = f.get("icao24", "")
        if cs in _route_cache:
            c_dep, c_arr, _ = _route_cache[cs]
            if _airport_matches(c_dep, from_code) and _airport_matches(c_arr, to_code):
                matching.append(icao24)
        else:
            uncached.append((cs, icao24))

    # Batch-lookup uncached callsigns (rate-limited; first call may take a few seconds)
    if uncached:
        batch   = uncached[:50]
        cs_list = [cs for cs, _ in batch]
        id_map  = {cs: icao24 for cs, icao24 in batch}
        with ThreadPoolExecutor(max_workers=10) as ex:
            results = list(ex.map(_lookup_route, cs_list))
        for cs, rt in zip(cs_list, results):
            if rt and _airport_matches(rt[0], from_code) and _airport_matches(rt[1], to_code):
                matching.append(id_map[cs])

    print(f"[route-search] {from_code}->{to_code}: {len(matching)} matches")
    return {"icao24s": matching, "from": from_code, "to": to_code}


@router.get("/api/flights")
def get_flights():
    """Live aircraft positions — OpenSky primary, adsb.fi fallback."""
    global _flight_cache, _flight_cache_ts, _flight_backoff_ts
    now = time.time()

    if _flight_cache is not None and now - _flight_cache_ts < FLIGHT_CACHE_TTL:
        return _flight_cache

    # Kick off type-code refresh in the background — never blocks this request
    threading.Thread(target=_refresh_type_cache, daemon=True).start()

    # Primary: OpenSky — large global dataset
    if now >= _flight_backoff_ts:
        try:
            r = requests.get(
                "https://opensky-network.org/api/states/all",
                timeout=15, headers=opensky.headers())
            print(f"[flights] opensky: HTTP {r.status_code}")
            if r.status_code == 401:
                opensky.token = None
                r = requests.get(
                    "https://opensky-network.org/api/states/all",
                    timeout=15, headers=opensky.headers())
                print(f"[flights] opensky retry: HTTP {r.status_code}")
            if r.status_code == 429:
                _flight_backoff_ts = now + FLIGHT_BACKOFF
            elif r.ok:
                clean = _opensky_clean(r.json())
                if clean:
                    # Enrich with type codes from adsb.fi cache where available
                    for f in clean:
                        t = _type_cache.get(f["icao24"])
                        if t:
                            f["acType"] = t
                    typed = sum(1 for f in clean if f.get("acType"))
                    print(f"[flights] opensky: {len(clean)} flights, {typed} with type codes")
                    result = {
                        "flights":   clean,
                        "count":     len(clean),
                        "source":    "opensky",
                        "timestamp": datetime.now().isoformat(),
                    }
                    _flight_cache    = result
                    _flight_cache_ts = now
                    return result
        except Exception as exc:
            print(f"[flights] opensky exception: {exc}")

    # Fallback: adsb.fi — no auth required, includes type codes
    try:
        adsb = _fetch_global_adsb()
        if adsb:
            result = {
                "flights":   adsb,
                "count":     len(adsb),
                "source":    "adsb.fi",
                "timestamp": datetime.now().isoformat(),
            }
            _flight_cache    = result
            _flight_cache_ts = now
            return result
    except Exception as exc:
        print(f"[flights] adsb.fi exception: {exc}")

    if _flight_cache is not None:
        return {**_flight_cache, "stale": True}
    return {"flights": [], "count": 0, "error": "All flight data sources unavailable"}


_track_cache: dict = {}   # icao24 -> (result, timestamp)
_TRACK_CACHE_TTL = 300    # 5 minutes — tracks change slowly; longer TTL reduces OpenSky pressure


@router.get("/api/track/{icao24}")
def get_track(icao24: str):
    icao = icao24.lower()
    now  = time.time()

    # Return fresh cache immediately
    if icao in _track_cache:
        cached, ts = _track_cache[icao]
        if now - ts < _TRACK_CACHE_TTL:
            return cached

    # Try to refresh from OpenSky
    try:
        r = requests.get(
            f"https://opensky-network.org/api/tracks/all?icao24={icao}&time=0",
            timeout=10, headers=opensky.headers())
        if r.ok:
            result = r.json()
            _track_cache[icao] = (result, now)
            return result
    except Exception:
        pass

    # Refresh failed — serve stale cache rather than an empty path
    if icao in _track_cache:
        return _track_cache[icao][0]

    return {"icao24": icao24, "path": []}


@router.get("/api/aircraft/{icao24}")
def get_aircraft_info(icao24: str):
    try:
        r = requests.get(f"https://hexdb.io/api/v1/aircraft/{icao24.lower()}", timeout=8)
        return r.json() if r.ok else {}
    except Exception:
        return {}


_route_ep_cache: dict = {}   # callsign -> (result_dict, timestamp)
_ROUTE_EP_TTL_HIT  = 86_400  # 24 h for found routes (routes rarely change)
_ROUTE_EP_TTL_MISS = 3_600   # 1 h for not-found (retry later)


@router.get("/api/route/{callsign}")
def get_route(callsign: str):
    cs  = callsign.strip().upper()
    now = time.time()

    # Return cached result (hit or known miss) before hitting any external API
    if cs in _route_ep_cache:
        cached, ts = _route_ep_cache[cs]
        ttl = _ROUTE_EP_TTL_HIT if cached else _ROUTE_EP_TTL_MISS
        if now - ts < ttl:
            return cached

    result: dict = {}

    # 1. AeroAPI — real flight data, most accurate (replaces adsbdb + OpenSky schedule DB)
    if _aero_configured():
        fl = _aero_flight(cs)
        if fl:
            result = _aero_route(fl)

    # 2. OpenSky scheduled-route database (fallback when AeroAPI not configured)
    if not result:
        try:
            r = requests.get(
                f"https://opensky-network.org/api/routes?callsign={cs}",
                timeout=6, headers=opensky.headers())
            if r.ok:
                d = r.json()
                if d.get("route") and len(d["route"]) >= 2:
                    result = d
        except Exception:
            pass

    # 3. adsbdb.com (fallback when AeroAPI not configured)
    if not result:
        try:
            r = requests.get(
                f"https://api.adsbdb.com/v0/callsign/{cs}",
                timeout=6, headers={"User-Agent": "FlightScope/1.0"})
            if r.ok:
                fr  = r.json().get("response", {}).get("flightroute") or {}
                dep = (fr.get("origin")      or {}).get("icao_code")
                arr = (fr.get("destination") or {}).get("icao_code")
                if dep and arr:
                    result = {
                        "callsign":     cs,
                        "route":        [dep, arr],
                        "operatorCode": (fr.get("airline") or {}).get("icao"),
                    }
        except Exception:
            pass

    _route_ep_cache[cs] = (result, now)
    return result


_history_cache: dict = {}   # icao24 -> (result, timestamp)
HISTORY_CACHE_TTL = 300     # 5 minutes — OpenSky updates flight records slowly


@router.get("/api/flight-history/{icao24}")
def get_flight_history(icao24: str):
    icao = icao24.lower()
    now  = time.time()
    if icao in _history_cache:
        cached, ts = _history_cache[icao]
        if now - ts < HISTORY_CACHE_TTL:
            return cached
    end = int(now)
    try:
        r = requests.get(
            "https://opensky-network.org/api/flights/aircraft",
            params={"icao24": icao, "begin": end - 86_400, "end": end},
            timeout=10, headers=opensky.headers())
        if r.ok:
            data   = r.json() or []
            result = {"flights": data, "latest": data[-1] if data else None}
            _history_cache[icao] = (result, now)
            return result
    except Exception:
        pass
    return {"flights": [], "latest": None}


def _clean_flight(fl: dict) -> dict:
    """Normalise an OpenSky flight record: strip callsign whitespace, drop null partner airports."""
    return {
        "icao24":               fl.get("icao24", ""),
        "callsign":             (fl.get("callsign") or "").strip() or None,
        "firstSeen":            fl.get("firstSeen"),
        "lastSeen":             fl.get("lastSeen"),
        "estDepartureAirport":  fl.get("estDepartureAirport") or None,
        "estArrivalAirport":    fl.get("estArrivalAirport")   or None,
    }


# Route cache for airport-flights enrichment — routes are stable, keep for 24 h
# Miss entries expire sooner (1 h) so transient adsbdb failures don't block permanently.
_route_cache: dict = {}        # callsign -> (dep_icao | None, arr_icao | None, timestamp)
_ROUTE_TTL_HIT  = 86_400       # 24 h for successful lookups
_ROUTE_TTL_MISS = 3_600        # 1 h for failed lookups


def _lookup_route(cs: str) -> tuple[str, str] | None:
    """Return (dep_icao, arr_icao) from adsbdb for a callsign, or None on miss."""
    if not cs:
        return None
    now = time.time()
    if cs in _route_cache:
        dep, arr, ts = _route_cache[cs]
        ttl = _ROUTE_TTL_HIT if (dep and arr) else _ROUTE_TTL_MISS
        if now - ts < ttl:
            return (dep, arr) if dep and arr else None
    try:
        r = requests.get(
            f"https://api.adsbdb.com/v0/callsign/{cs}",
            timeout=3, headers={"User-Agent": "FlightScope/1.0"})
        if r.ok:
            fr  = r.json().get("response", {}).get("flightroute") or {}
            dep = (fr.get("origin")      or {}).get("icao_code")
            arr = (fr.get("destination") or {}).get("icao_code")
            _route_cache[cs] = (dep, arr, now)
            return (dep, arr) if dep and arr else None
    except Exception:
        pass
    _route_cache[cs] = (None, None, now)
    return None


# Cache the full airport-flights response for 10 minutes so the parallel
# route enrichment only runs once per airport per session.
_apf_cache: dict = {}     # ident -> (result, timestamp)
_APF_CACHE_TTL = 600


@router.get("/api/airport-flights/{ident}")
def get_airport_flights(ident: str):
    """Departures + arrivals for an airport over the past 24 h."""
    ident = ident.upper()
    now   = time.time()

    if ident in _apf_cache:
        cached, ts = _apf_cache[ident]
        if now - ts < _APF_CACHE_TTL:
            return cached

    end   = int(now)
    begin = end - 86_400

    def _fetch(kind):
        try:
            r = requests.get(
                f"https://opensky-network.org/api/flights/{kind}",
                params={"airport": ident, "begin": begin, "end": end},
                timeout=15, headers=opensky.headers())
            if not r.ok:
                return []
            raw = r.json() or []
            return [_clean_flight(f) for f in raw if isinstance(f, dict)]
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=2) as ex:
        deps_raw = ex.submit(_fetch, "departure").result() or []
        arrs_raw = ex.submit(_fetch, "arrival").result()   or []

    deps = sorted(deps_raw, key=lambda x: x.get("firstSeen", 0), reverse=True)[:60]
    arrs = sorted(arrs_raw, key=lambda x: x.get("lastSeen",  0), reverse=True)[:60]

    # Only call adsbdb for flights where OpenSky has no trajectory estimate.
    # OpenSky's est*Airport is specific to the actual flight; adsbdb is a scheduled-route
    # lookup that can map a callsign to a completely different city pair on different days.
    deps_no_arr = [f for f in deps if not f["estArrivalAirport"]]
    arrs_no_dep = [f for f in arrs if not f["estDepartureAirport"]]
    top_flights = deps_no_arr[:20] + arrs_no_dep[:20]
    unique_cs   = list({f["callsign"] for f in top_flights if f["callsign"]})
    if unique_cs:
        with ThreadPoolExecutor(max_workers=min(len(unique_cs), 20)) as ex:
            route_pairs = list(ex.map(_lookup_route, unique_cs))
        route_map = {cs: rt for cs, rt in zip(unique_cs, route_pairs) if rt}
        for f in deps + arrs:
            rt = route_map.get(f["callsign"])
            if rt:
                f["routeDep"], f["routeArr"] = rt

    result = {"departures": deps, "arrivals": arrs}
    _apf_cache[ident] = (result, now)
    return result


@router.get("/api/flight-status/{callsign}")
def get_flight_status(callsign: str):
    """Gate/terminal/scheduled+actual times from AeroAPI (personal plan)."""
    if not _aero_configured():
        return {"error": "no_key"}
    cs = callsign.strip().upper()
    fl = _aero_flight(cs)
    if not fl:
        return {}
    return _aero_status(fl)
