"""
Airport data — OurAirports CSV cache, enrichment helpers, and airport API routes.
"""
import cmath
import io
import math
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from urllib.parse import quote as urlquote

import pandas as pd
import requests
from fastapi import APIRouter

from api.opensky import get_flight_cache

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────
AIRPORT_API_TOKEN = os.getenv("AIRPORTDB_TOKEN", "")

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

# ── OurAirports CSV cache ─────────────────────────────────────────────────────
_airports_df    = None
_airports_df_ts = 0.0
_AIRPORTS_CSV   = "https://davidmegginson.github.io/ourairports-data/airports.csv"
_AIRPORTS_TTL   = 86_400   # re-fetch once per day


def _airports_get():
    """Return cached DataFrame of large scheduled airports, refreshing daily."""
    global _airports_df, _airports_df_ts
    if _airports_df is not None and time.time() - _airports_df_ts < _AIRPORTS_TTL:
        return _airports_df
    try:
        r = requests.get(_AIRPORTS_CSV, timeout=20, headers={"User-Agent": "FlightScope/1.0"})
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
    return _airports_df


# ── Enrichment helpers ────────────────────────────────────────────────────────
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

        times   = hrly.get("time",               [])
        temps   = hrly.get("temperature_2m",     [])
        wspeeds = hrly.get("wind_speed_10m",     [])
        wdirs   = hrly.get("wind_direction_10m", [])
        wxcodes = hrly.get("weather_code",       [])

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
    """Guess the active runway from low-altitude climbing aircraft in the live cache
    within 30 km of the airport.  Returns the best-matching runway ident, or None."""
    cache = get_flight_cache()
    if not cache or not runways:
        return None

    headings = []
    for f in cache.get("flights", []):
        if f.get("onGround") or f.get("lat") is None or f.get("lon") is None:
            continue
        alt = f.get("alt")
        if alt is None or alt > 3_000:
            continue
        vr = f.get("vertRate")
        if vr is None or vr < 1.5:
            continue
        dlat   = f["lat"] - ap_lat
        dlon   = f["lon"] - ap_lon
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

    avg     = sum(cmath.exp(1j * math.radians(h)) for h in headings) / len(headings)
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
    """Predict active runway from METAR wind direction (aircraft land into the wind)."""
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


def _build_detail(ident, lat, lon, name):
    """Fetch all enrichment sources in parallel and return merged dict."""
    with ThreadPoolExecutor(max_workers=4) as ex:
        f_adb     = ex.submit(_adb_fetch, ident)
        f_wiki    = ex.submit(_wiki_fetch, name)
        f_weather = ex.submit(_weather_fetch, lat, lon)
        f_metar   = ex.submit(_metar_fetch, ident)
        adb, wiki, weather, metar = (
            f_adb.result(), f_wiki.result(), f_weather.result(), f_metar.result()
        )

    runways             = adb.get("runways", [])
    wind_dir, wind_spd  = _parse_metar_wind(metar)
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
@router.get("/api/airports")
def get_airports():
    """All large scheduled airports from OurAirports — basic info, no external calls."""
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


@router.get("/api/airport/{ident}")
def get_airport_detail(ident: str):
    """Enriched airport data (runways, weather, Wikipedia, METAR) — fetched lazily on popup open."""
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
