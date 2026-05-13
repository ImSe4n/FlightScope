"""
Name: FlightScope Web
Course Code: ICS3U-01
Author: Sean Nie
Description: FastAPI backend serving live flight and airport data via REST API.
"""
import math
import os
from datetime import datetime

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

# ----- Constants -----
AIRPORTS = {
    'CYOW': {'lat': 45.3225, 'lon': -75.6692},
    'CYND': {'lat': 45.5210, 'lon': -75.5630},
    'CYRO': {'lat': 45.4592, 'lon': -75.6522},
}

AIRPORT_API_TOKEN = '89e420818cba11453f8c0d69dd06e6a075288321eb34723d17fadf678cde51f575dd81b6245e01cf77f26831dd973895'

FLIGHT_COLUMNS = [
    'icao24', 'callsign', 'origin', 'timePos', 'lastContact',
    'lon', 'lat', 'alt', 'onGround', 'speed', 'heading',
    'vertRate', 'sensors', 'geoAlt', 'squawk', 'spi', 'source',
]


# ----- Routes -----
@app.get("/api/flights")
def get_flights():
    """Fetch all live aircraft states from OpenSky Network (global coverage)."""
    url = "https://opensky-network.org/api/states/all"
    try:
        resp = requests.get(url, timeout=15)
    except requests.RequestException as exc:
        return {"flights": [], "count": 0, "error": str(exc)}

    if resp.status_code != 200:
        return {"flights": [], "count": 0, "error": f"OpenSky returned {resp.status_code}"}

    data = resp.json()
    if not data.get("states"):
        return {"flights": [], "count": 0, "timestamp": datetime.now().isoformat()}

    df = pd.DataFrame(data["states"]).iloc[:, :17]
    df.columns = FLIGHT_COLUMNS
    df = df[df["lat"].notna() & df["lon"].notna()]

    # pandas keeps NaN as float NaN in numeric columns even after where(notnull, None),
    # so scrub after to_dict to ensure JSON compliance
    records = df.to_dict(orient="records")
    clean = [
        {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in row.items()}
        for row in records
    ]

    return {
        "flights": clean,
        "count": len(clean),
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/track/{icao24}")
def get_track(icao24: str):
    """Fetch recent flight track from OpenSky Network."""
    url = f"https://opensky-network.org/api/tracks/all?icao24={icao24.lower()}&time=0"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return {"icao24": icao24, "path": []}
    except requests.RequestException as exc:
        return {"icao24": icao24, "path": [], "error": str(exc)}


@app.get("/api/airports")
def get_airports():
    """Fetch airport info, weather, and METAR for the configured airports."""
    result = []
    for ident, coords in AIRPORTS.items():
        lat, lon = coords["lat"], coords["lon"]
        airport = {
            "ident": ident,
            "name": ident,
            "lat": lat,
            "lon": lon,
            "runways": [],
            "weather": None,
            "metar": "N/A",
        }

        # Airport data from airportdb.io
        try:
            resp = requests.get(
                f"https://airportdb.io/api/v1/airport/{ident}?apiToken={AIRPORT_API_TOKEN}",
                timeout=10,
            )
            if resp.status_code == 200:
                ad = resp.json()
                airport.update({
                    "name": ad.get("name", ident),
                    "lat": ad.get("latitude", lat),
                    "lon": ad.get("longitude", lon),
                    "runways": ad.get("runways", []),
                })
        except requests.RequestException:
            pass

        # Weather from Open-Meteo
        try:
            wresp = requests.get(
                f"https://api.open-meteo.com/v1/forecast"
                f"?latitude={airport['lat']}&longitude={airport['lon']}&current_weather=true",
                timeout=10,
            )
            if wresp.ok:
                cw = wresp.json().get("current_weather", {})
                airport["weather"] = {
                    "temperature": cw.get("temperature"),
                    "windspeed": cw.get("windspeed"),
                }
        except requests.RequestException:
            pass

        # METAR from NOAA
        try:
            mresp = requests.get(
                f"https://tgftp.nws.noaa.gov/data/observations/metar/stations/{ident}.TXT",
                timeout=10,
            )
            if mresp.ok:
                lines = mresp.text.splitlines()
                airport["metar"] = lines[1] if len(lines) > 1 else "N/A"
        except requests.RequestException:
            pass

        result.append(airport)

    return {"airports": result}


# ----- Serve React build in production -----
_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_react(full_path: str):
        return FileResponse(os.path.join(_dist, "index.html"))
