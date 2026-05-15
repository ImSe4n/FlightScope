"""
Name: FlightScope Web
Course Code: ICS3U-01
Author: Sean Nie
Description: FastAPI backend – live flights, global airports, aircraft & route data.
"""
import io
import math
import os
import re
import time
from datetime import datetime, timedelta
from urllib.parse import quote as urlquote
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
load_dotenv()

import pandas as pd
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="FlightScope API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── Constants ─────────────────────────────────────────────────────────────────
FLIGHT_COLUMNS = [
    'icao24', 'callsign', 'origin', 'timePos', 'lastContact',
    'lon', 'lat', 'alt', 'onGround', 'speed', 'heading',
    'vertRate', 'sensors', 'geoAlt', 'squawk', 'spi', 'source',
]

AIRPORT_API_TOKEN  = '89e420818cba11453f8c0d69dd06e6a075288321eb34723d17fadf678cde51f575dd81b6245e01cf77f26831dd973895'
AERODATABOX_KEY    = os.getenv("AERODATABOX_KEY", "")

# Tier-1 airports shown at all zoom levels — the ~60 most recognisable global hubs
TIER1_IATA = {
    # North America
    'JFK','LAX','ORD','ATL','DFW','DEN','SFO','MIA','SEA','BOS','EWR','YYZ','YVR','MEX',
    # South America
    'GRU','EZE','BOG','SCL','LIM','GIG',
    # Europe
    'LHR','CDG','FRA','AMS','MAD','FCO','IST','MUC','ZRH','VIE','BCN','BRU','CPH',
    'HEL','ARN','LIS','ATH','WAW',
    # Middle East
    'DXB','DOH','AUH','RUH',
    # Asia-Pacific
    'SIN','HKG','NRT','HND','PEK','PVG','ICN','BKK','KUL','SYD','MEL','CGK',
    # South Asia
    'DEL','BOM','BLR',
    # Africa
    'JNB','CAI','NBO','ADD','CMN','LOS',
}

# ── OpenSky OAuth2 token manager ─────────────────────────────────────────────
_OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)

class _TokenManager:
    def __init__(self):
        self.token      = None
        self.expires_at = None

    def get_token(self):
        if self.token and self.expires_at and datetime.now() < self.expires_at:
            return self.token
        return self._refresh()

    def _refresh(self):
        cid  = os.getenv("OPENSKY_CLIENT_ID")
        csec = os.getenv("OPENSKY_CLIENT_SECRET")
        if not cid or not csec:
            return None
        try:
            r = requests.post(_OPENSKY_TOKEN_URL, data={
                "grant_type":    "client_credentials",
                "client_id":     cid,
                "client_secret": csec,
            }, timeout=10)
            r.raise_for_status()
            data = r.json()
            self.token      = data["access_token"]
            expires_in      = data.get("expires_in", 1800)
            self.expires_at = datetime.now() + timedelta(seconds=expires_in - 30)
            print(f"[opensky] token refreshed, expires in {expires_in}s")
            return self.token
        except Exception as exc:
            print(f"[opensky] token refresh failed: {exc}")
            self.token = None
            return None

    def headers(self):
        tok = self.get_token()
        return {"Authorization": f"Bearer {tok}"} if tok else {}

_opensky_tokens = _TokenManager()

# ── Airport CSV cache (OurAirports — free, global) ────────────────────────────
_airports_df    = None
_airports_df_ts = 0.0
AIRPORTS_CSV    = "https://davidmegginson.github.io/ourairports-data/airports.csv"
AIRPORTS_TTL    = 86_400   # re-fetch once per day


def _airports_get():
    """Return cached DataFrame of large scheduled airports, refreshing daily."""
    global _airports_df, _airports_df_ts
    if _airports_df is not None and time.time() - _airports_df_ts < AIRPORTS_TTL:
        return _airports_df
    try:
        r = requests.get(AIRPORTS_CSV, timeout=20, headers={"User-Agent": "FlightScope/1.0"})
        if r.ok:
            df = pd.read_csv(io.StringIO(r.text), low_memory=False)
            df = df[
                (df["type"] == "large_airport") &
                (df["scheduled_service"] == "yes") &
                df["iata_code"].notna() &
                (df["iata_code"].str.strip() != "")
            ].copy()
            df["latitude_deg"]  = pd.to_numeric(df["latitude_deg"],  errors="coerce")
            df["longitude_deg"] = pd.to_numeric(df["longitude_deg"], errors="coerce")
            df = df.dropna(subset=["latitude_deg", "longitude_deg"])
            _airports_df    = df
            _airports_df_ts = time.time()
    except Exception:
        pass
    return _airports_df  # may be stale or None


# ── Flight cache (stale-while-revalidate) ─────────────────────────────────────
_flight_cache      = None   # last successful response dict
_flight_cache_ts   = 0.0
_flight_backoff_ts = 0.0    # don't retry sources until this time
FLIGHT_CACHE_TTL   = 60     # seconds before re-fetching from a live source
FLIGHT_BACKOFF     = 90     # seconds to wait after all sources fail

# ── Flight helpers ─────────────────────────────────────────────────────────────
def _opensky_clean(data):
    if not data.get("states"):
        return []
    df = pd.DataFrame(data["states"]).iloc[:, :17]
    df.columns = FLIGHT_COLUMNS
    df = df[df["lat"].notna() & df["lon"].notna()]
    rows = df.to_dict(orient="records")
    return [
        {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in r.items()}
        for r in rows
    ]


def _fetch_adsb(url):
    """Parse readsb/tar1090-format ADS-B feed (adsb.fi / adsb.lol)."""
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "FlightScope/1.0"})
        if not r.ok:
            print(f"[adsb] {url} → HTTP {r.status_code}")
            return None
        raw = r.json()
        ac_list = raw.get("ac", [])
        print(f"[adsb] {url} → {r.status_code}, {len(ac_list)} aircraft in payload")
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
                alt_m = None if gnd else float(alt) * 0.3048
                gs    = ac.get("gs")
                br    = ac.get("baro_rate")
                trk   = ac.get("track")
                out.append({
                    "icao24":      (ac.get("hex") or "").lower(),
                    "callsign":    (ac.get("flight") or "").strip(),
                    "origin":      None,
                    "timePos":     None,
                    "lastContact": ac.get("seen"),
                    "lon":         float(lon),
                    "lat":         float(lat),
                    "alt":         alt_m,
                    "onGround":    gnd,
                    "speed":       float(gs)  * 0.514444 if isinstance(gs,  (int, float)) else None,
                    "heading":     float(trk)            if isinstance(trk, (int, float)) else None,
                    "vertRate":    float(br)  * 0.00508  if isinstance(br,  (int, float)) else None,
                    "sensors":     None,
                    "geoAlt":      None,
                    "squawk":      str(ac.get("squawk") or ""),
                    "spi":         False,
                    "source":      0,
                })
            except Exception:
                continue
        return out or None
    except Exception as exc:
        print(f"[adsb] {url} → exception: {exc}")
        return None


# Strategic lat/lon centres — 250 NM radius each covers all major air corridors
_TILE_CENTRES = [
    (51,  -30),  # North Atlantic
    (51,   10),  # Europe
    (40,  -85),  # Eastern North America
    (37, -115),  # Western North America
    (35,  140),  # Japan / East Asia
    (10,  110),  # Southeast Asia
    (25,   55),  # Gulf / Middle East
    (20,   80),  # South Asia
    (-15, -55),  # South America
    (-28, 133),  # Australia
]

def _fetch_global_adsb():
    """Tile the globe with regional adsb.fi v3 queries; deduplicate by icao24."""
    def _region(lat, lon):
        return _fetch_adsb(
            f"https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/250"
        )

    with ThreadPoolExecutor(max_workers=len(_TILE_CENTRES)) as ex:
        batches = list(ex.map(lambda c: _region(*c), _TILE_CENTRES))

    seen, combined = set(), []
    for batch in batches:
        if not batch:
            continue
        for f in batch:
            if f["icao24"] not in seen:
                seen.add(f["icao24"])
                combined.append(f)

    print(f"[adsb.fi] tiled: {len(combined)} unique aircraft across {len(_TILE_CENTRES)} regions")
    return combined or None


# ── Airport enrichment helpers (each runs in its own thread) ──────────────────
def _adb_fetch(ident):
    try:
        r = requests.get(
            f"https://airportdb.io/api/v1/airport/{ident}?apiToken={AIRPORT_API_TOKEN}",
            timeout=8)
        return r.json() if r.ok else {}
    except Exception:
        return {}


def _wiki_fetch(name):
    try:
        r = requests.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{urlquote(name, safe='')}",
            timeout=5, headers={"User-Agent": "FlightScope/1.0"})
        if not r.ok:
            return {}
        d = r.json()
        return {
            "image":       d.get("thumbnail", {}).get("source"),
            "description": d.get("extract", "")[:400],
            "wiki_url":    d.get("content_urls", {}).get("desktop", {}).get("page"),
        }
    except Exception:
        return {}


def _weather_fetch(lat, lon):
    try:
        r = requests.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude":        lat,
            "longitude":       lon,
            "current_weather": "true",
            "hourly":          "temperature_2m,wind_speed_10m,wind_direction_10m,weather_code",
            "wind_speed_unit": "kn",
            "timezone":        "UTC",
            "forecast_days":   1,
        }, timeout=6)
        if not r.ok:
            return None
        d    = r.json()
        cw   = d.get("current_weather", {})
        hrly = d.get("hourly", {})

        times   = hrly.get("time",                [])
        temps   = hrly.get("temperature_2m",      [])
        wspeeds = hrly.get("wind_speed_10m",      [])
        wdirs   = hrly.get("wind_direction_10m",  [])
        wxcodes = hrly.get("weather_code",        [])

        # 6-hour window centred on now (UTC)
        now_h   = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        start_s = (now_h - timedelta(hours=2)).strftime("%Y-%m-%dT%H:00")
        end_s   = (now_h + timedelta(hours=3)).strftime("%Y-%m-%dT%H:00")

        hourly = []
        for i, t in enumerate(times):
            if start_s <= t <= end_s:
                hourly.append({
                    "time":      t,
                    "temp":      temps[i]   if i < len(temps)   else None,
                    "windspeed": wspeeds[i] if i < len(wspeeds) else None,
                    "winddir":   wdirs[i]   if i < len(wdirs)   else None,
                    "wxcode":    wxcodes[i] if i < len(wxcodes) else None,
                })

        return {
            "temperature":   cw.get("temperature"),
            "windspeed":     cw.get("windspeed"),
            "winddirection": cw.get("winddirection"),
            "weathercode":   cw.get("weathercode"),
            "hourly":        hourly,
        }
    except Exception:
        return None


def _parse_metar_wind(metar: str | None):
    """Return (wind_dir_deg, speed_kt) from raw METAR string, or (None, None)."""
    if not metar:
        return None, None
    m = re.search(r'\b(VRB|\d{3})(\d{2,3})(?:G\d{2,3})?KT\b', metar)
    if not m:
        return None, None
    dir_s, spd_s = m.group(1), m.group(2)
    return (None, int(spd_s)) if dir_s == "VRB" else (int(dir_s), int(spd_s))


def _infer_runway_from_traffic(ap_lat: float, ap_lon: float, runways: list) -> str | None:
    """Guess the active runway by looking at low-altitude climbing aircraft in the
    live cache that are within 30 km of the airport.  Returns the runway whose
    magnetic heading best matches the median departure heading, or None."""
    global _flight_cache
    if not _flight_cache or not runways:
        return None

    headings = []
    for f in _flight_cache.get("flights", []):
        if f.get("onGround") or f.get("lat") is None or f.get("lon") is None:
            continue
        alt = f.get("alt")
        if alt is None or alt > 3_000:          # below ~10 000 ft
            continue
        vr = f.get("vertRate")
        if vr is None or vr < 1.5:              # climbing ≥ ~300 fpm
            continue
        dlat = f["lat"] - ap_lat
        dlon = f["lon"] - ap_lon
        dist_km = math.sqrt(
            (dlat * 111) ** 2 +
            (dlon * 111 * math.cos(math.radians(ap_lat))) ** 2
        )
        if dist_km > 30:
            continue
        hdg = f.get("heading")
        if hdg is not None:
            headings.append(float(hdg))

    if not headings:
        return None

    # Circular median: convert to unit vectors, average, back to angle
    import cmath
    avg = sum(cmath.exp(1j * math.radians(h)) for h in headings) / len(headings)
    med_hdg = math.degrees(cmath.phase(avg)) % 360

    best_ident, best_diff = None, 360
    for rw in runways:
        for hdg_key, id_key in [("le_heading_degT", "le_ident"), ("he_heading_degT", "he_ident")]:
            try:
                hdg  = float(rw[hdg_key])
                diff = abs((hdg - med_hdg + 180) % 360 - 180)
                if diff < best_diff:
                    best_diff, best_ident = diff, rw.get(id_key)
            except (KeyError, TypeError, ValueError):
                pass
    return best_ident


def _predict_runway(runways: list, wind_dir) -> str | None:
    """Return the predicted active-runway ident (e.g. '27L') from wind direction.
    Aircraft land into the wind, so active runway heading ≈ wind direction."""
    if wind_dir is None or not runways:
        return None
    best_ident, best_diff = None, 360
    for rw in runways:
        for hdg_key, id_key in [("le_heading_degT", "le_ident"), ("he_heading_degT", "he_ident")]:
            try:
                hdg  = float(rw[hdg_key])
                diff = abs((hdg - wind_dir + 180) % 360 - 180)
                if diff < best_diff:
                    best_diff, best_ident = diff, rw.get(id_key)
            except (KeyError, TypeError, ValueError):
                pass
    return best_ident


def _metar_fetch(ident):
    try:
        r = requests.get(
            f"https://tgftp.nws.noaa.gov/data/observations/metar/stations/{ident}.TXT",
            timeout=5)
        if not r.ok:
            return None
        lines = r.text.splitlines()
        return lines[1] if len(lines) > 1 else None
    except Exception:
        return None


def _build_detail(ident, lat, lon, name):
    """Fetch all 4 enrichment sources in parallel; return merged dict."""
    with ThreadPoolExecutor(max_workers=4) as ex:
        f_adb     = ex.submit(_adb_fetch, ident)
        f_wiki    = ex.submit(_wiki_fetch, name)
        f_weather = ex.submit(_weather_fetch, lat, lon)
        f_metar   = ex.submit(_metar_fetch, ident)
        adb, wiki, weather, metar = (
            f_adb.result(), f_wiki.result(), f_weather.result(), f_metar.result()
        )

    runways            = adb.get("runways", [])
    wind_dir, wind_spd = _parse_metar_wind(metar)
    # Prefer live-traffic inference (actual departures); fall back to METAR wind
    pred_rw = _infer_runway_from_traffic(lat, lon, runways) or _predict_runway(runways, wind_dir)

    detail = {
        "ident":           ident,
        "name":            adb.get("name") or name,
        "lat":             lat,
        "lon":             lon,
        "runways":         runways,
        "iata":            adb.get("iata_code") or None,
        "type":            adb.get("type") or None,
        "city":            adb.get("municipality") or None,
        "country":         adb.get("iso_country") or None,
        "elevation_ft":    adb.get("elevation_ft"),
        "weather":         weather,
        "metar":           metar or "N/A",
        "metarWindDir":    wind_dir,
        "metarWindSpd":    wind_spd,
        "predictedRunway": pred_rw,
    }
    detail.update(wiki)   # image, description, wiki_url
    return detail


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/flights")
def get_flights():
    """Live aircraft from OpenSky (OAuth2, cached 60 s). Serves stale on failure."""
    global _flight_cache, _flight_cache_ts, _flight_backoff_ts
    now = time.time()

    if _flight_cache is not None and now - _flight_cache_ts < FLIGHT_CACHE_TTL:
        return _flight_cache

    if now < _flight_backoff_ts:
        if _flight_cache is not None:
            return {**_flight_cache, "stale": True}
        return {"flights": [], "count": 0, "error": "Sources temporarily unavailable"}

    try:
        r = requests.get("https://opensky-network.org/api/states/all", timeout=15,
                         headers=_opensky_tokens.headers())
        print(f"[flights] opensky: HTTP {r.status_code}")
        if r.status_code == 401:
            _opensky_tokens.token = None
            r = requests.get("https://opensky-network.org/api/states/all", timeout=15,
                             headers=_opensky_tokens.headers())
            print(f"[flights] opensky retry: HTTP {r.status_code}")
        if r.status_code == 429:
            _flight_backoff_ts = now + FLIGHT_BACKOFF
            if _flight_cache is not None:
                return {**_flight_cache, "stale": True}
        elif r.ok:
            clean = _opensky_clean(r.json())
            if clean:
                result = {"flights": clean, "count": len(clean), "source": "opensky",
                          "timestamp": datetime.now().isoformat()}
                _flight_cache    = result
                _flight_cache_ts = now
                return result
    except Exception as exc:
        print(f"[flights] opensky: exception: {exc}")

    _flight_backoff_ts = now + FLIGHT_BACKOFF
    if _flight_cache is not None:
        return {**_flight_cache, "stale": True}
    return {"flights": [], "count": 0, "error": "All flight data sources unavailable"}


@app.get("/api/track/{icao24}")
def get_track(icao24: str):
    try:
        r = requests.get(
            f"https://opensky-network.org/api/tracks/all?icao24={icao24.lower()}&time=0",
            timeout=10)
        return r.json() if r.ok else {"icao24": icao24, "path": []}
    except Exception:
        return {"icao24": icao24, "path": []}


@app.get("/api/aircraft/{icao24}")
def get_aircraft_info(icao24: str):
    try:
        r = requests.get(f"https://hexdb.io/api/v1/aircraft/{icao24.lower()}", timeout=8)
        return r.json() if r.ok else {}
    except Exception:
        return {}


@app.get("/api/route/{callsign}")
def get_route(callsign: str):
    cs = callsign.strip().upper()

    # 1. OpenSky scheduled-route database
    try:
        r = requests.get(
            f"https://opensky-network.org/api/routes?callsign={cs}",
            timeout=8, headers=_opensky_tokens.headers())
        if r.ok:
            data = r.json()
            if data.get("route") and len(data["route"]) >= 2:
                return data
    except Exception:
        pass

    # 2. adsbdb.com — free, good coverage of scheduled routes
    try:
        r = requests.get(
            f"https://api.adsbdb.com/v0/callsign/{cs}",
            timeout=8, headers={"User-Agent": "FlightScope/1.0"})
        if r.ok:
            fr = r.json().get("response", {}).get("flightroute") or {}
            dep = (fr.get("origin")      or {}).get("icao_code")
            arr = (fr.get("destination") or {}).get("icao_code")
            if dep and arr:
                return {
                    "callsign":    cs,
                    "route":       [dep, arr],
                    "operatorCode": (fr.get("airline") or {}).get("icao"),
                }
    except Exception:
        pass

    return {}


@app.get("/api/flight-history/{icao24}")
def get_flight_history(icao24: str):
    end = int(time.time())
    try:
        r = requests.get(
            "https://opensky-network.org/api/flights/aircraft",
            params={"icao24": icao24.lower(), "begin": end - 86400, "end": end},
            timeout=10, headers=_opensky_tokens.headers())
        if r.ok:
            data = r.json() or []
            return {"flights": data, "latest": data[-1] if data else None}
    except Exception:
        pass
    return {"flights": [], "latest": None}


@app.get("/api/airports")
def get_airports():
    """All large scheduled airports from OurAirports CSV — basic info, no external calls."""
    df = _airports_get()
    if df is None:
        return {"airports": []}

    def sv(row, col):
        v = row.get(col)
        return str(v) if pd.notna(v) and v != "" else None

    airports = []
    for _, row in df.iterrows():
        airports.append({
            "ident":        str(row["ident"]),
            "name":         sv(row, "name") or str(row["ident"]),
            "lat":          float(row["latitude_deg"]),
            "lon":          float(row["longitude_deg"]),
            "iata":         sv(row, "iata_code"),
            "country":      sv(row, "iso_country"),
            "type":         sv(row, "type"),
            "city":         sv(row, "municipality"),
            "elevation_ft": sv(row, "elevation_ft"),
            "tier": 1 if sv(row, "iata_code") in TIER1_IATA else 2,
        })
    return {"airports": airports}


@app.get("/api/airport/{ident}")
def get_airport_detail(ident: str):
    """Enriched data for one airport (runways, weather, Wikipedia image, METAR).
    Called lazily when the user opens an airport popup."""
    ident = ident.upper()
    df = _airports_get()
    if df is None:
        return {}
    rows = df[df["ident"] == ident]
    if rows.empty:
        return {}
    row  = rows.iloc[0]
    lat  = float(row["latitude_deg"])
    lon  = float(row["longitude_deg"])
    name = str(row.get("name", ident))
    return _build_detail(ident, lat, lon, name)


@app.get("/api/flight-status/{callsign}")
def get_flight_status(callsign: str):
    """Gate, terminal, and live status from AeroDataBox (optional).
    Set AERODATABOX_KEY in .env to enable — free tier available at rapidapi.com."""
    if not AERODATABOX_KEY:
        return {"error": "no_key"}
    cs = callsign.strip().upper()
    try:
        r = requests.get(
            f"https://aerodatabox.p.rapidapi.com/flights/callsign/{cs}",
            headers={
                "X-RapidAPI-Key":  AERODATABOX_KEY,
                "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
            },
            timeout=8,
        )
        if not r.ok:
            print(f"[aerodatabox] {cs}: HTTP {r.status_code}")
            return {}
        items = r.json()
        if not isinstance(items, list):
            items = [items]
        if not items:
            return {}
        fl  = items[0]
        dep = fl.get("departure") or {}
        arr = fl.get("arrival")   or {}
        return {
            "status": fl.get("status"),
            "number": fl.get("number"),
            "departure": {
                "airport":   (dep.get("airport") or {}).get("icao"),
                "terminal":  dep.get("terminal"),
                "gate":      dep.get("gate"),
                "runway":    dep.get("runway"),
                "scheduled": (dep.get("scheduledTime") or {}).get("local"),
                "actual":    (dep.get("actualTime")    or {}).get("local"),
            },
            "arrival": {
                "airport":   (arr.get("airport") or {}).get("icao"),
                "terminal":  arr.get("terminal"),
                "gate":      arr.get("gate"),
                "scheduled": (arr.get("scheduledTime")  or {}).get("local"),
                "estimated": (arr.get("predictedTime")  or {}).get("local"),
            },
        }
    except Exception as exc:
        print(f"[aerodatabox] {cs}: {exc}")
        return {}


# ── Serve React build in production ───────────────────────────────────────────
_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_react(full_path: str):
        return FileResponse(os.path.join(_dist, "index.html"))
