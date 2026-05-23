import json, os, sqlite3, time
from contextlib import contextmanager
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from .auth import verify_token

router = APIRouter(prefix="/api/user", tags=["user"])

_DB = os.path.join(os.path.dirname(__file__), "..", "flightscope_users.db")

@contextmanager
def _db():
    con = sqlite3.connect(_DB)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()

def _init_db():
    with _db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS saved_flights(
            user_id TEXT, icao24 TEXT, callsign TEXT, saved_at REAL,
            PRIMARY KEY(user_id, icao24))""")
        c.execute("""CREATE TABLE IF NOT EXISTS saved_airports(
            user_id TEXT, ident TEXT, name TEXT, city TEXT,
            country TEXT, iata TEXT, lat REAL, lon REAL, saved_at REAL,
            PRIMARY KEY(user_id, ident))""")
        c.execute("""CREATE TABLE IF NOT EXISTS saved_routes(
            user_id TEXT, dep TEXT, arr TEXT, label TEXT, saved_at REAL,
            PRIMARY KEY(user_id, dep, arr))""")
        c.execute("""CREATE TABLE IF NOT EXISTS user_settings(
            user_id TEXT PRIMARY KEY, settings_json TEXT, updated_at REAL)""")

_init_db()

# ── Saved Flights ─────────────────────────────────────────────────────────────
@router.get("/saved-flights")
def get_saved_flights(user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        rows = c.execute(
            "SELECT icao24, callsign, saved_at FROM saved_flights WHERE user_id=? ORDER BY saved_at DESC",
            (uid,)).fetchall()
    return [dict(r) for r in rows]

class FlightIn(BaseModel):
    icao24:   str
    callsign: str | None = None

@router.post("/saved-flights")
def save_flight(body: FlightIn, user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        c.execute("INSERT OR REPLACE INTO saved_flights VALUES(?,?,?,?)",
                  (uid, body.icao24.lower(), body.callsign, time.time()))
    return {"ok": True}

@router.delete("/saved-flights/{icao24}")
def unsave_flight(icao24: str, user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        c.execute("DELETE FROM saved_flights WHERE user_id=? AND icao24=?",
                  (uid, icao24.lower()))
    return {"ok": True}

# ── Saved Airports ────────────────────────────────────────────────────────────
@router.get("/saved-airports")
def get_saved_airports(user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        rows = c.execute(
            "SELECT ident, name, city, country, iata, lat, lon, saved_at FROM saved_airports WHERE user_id=? ORDER BY saved_at DESC",
            (uid,)).fetchall()
    return [dict(r) for r in rows]

class AirportIn(BaseModel):
    ident:   str
    name:    str | None = None
    city:    str | None = None
    country: str | None = None
    iata:    str | None = None
    lat:     float | None = None
    lon:     float | None = None

@router.post("/saved-airports")
def save_airport(body: AirportIn, user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        c.execute("INSERT OR REPLACE INTO saved_airports VALUES(?,?,?,?,?,?,?,?,?)",
                  (uid, body.ident, body.name, body.city, body.country,
                   body.iata, body.lat, body.lon, time.time()))
    return {"ok": True}

@router.delete("/saved-airports/{ident}")
def unsave_airport(ident: str, user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        c.execute("DELETE FROM saved_airports WHERE user_id=? AND ident=?", (uid, ident))
    return {"ok": True}

# ── Saved Routes ──────────────────────────────────────────────────────────────
@router.get("/saved-routes")
def get_saved_routes(user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        rows = c.execute(
            "SELECT dep, arr, label, saved_at FROM saved_routes WHERE user_id=? ORDER BY saved_at DESC",
            (uid,)).fetchall()
    return [dict(r) for r in rows]

class RouteIn(BaseModel):
    dep:   str
    arr:   str
    label: str | None = None

@router.post("/saved-routes")
def save_route(body: RouteIn, user: dict = Depends(verify_token)):
    uid = user["sub"]
    dep, arr = body.dep.upper(), body.arr.upper()
    label = body.label or f"{dep}→{arr}"
    with _db() as c:
        c.execute("INSERT OR REPLACE INTO saved_routes VALUES(?,?,?,?,?)",
                  (uid, dep, arr, label, time.time()))
    return {"ok": True}

@router.delete("/saved-routes/{dep}/{arr}")
def unsave_route(dep: str, arr: str, user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        c.execute("DELETE FROM saved_routes WHERE user_id=? AND dep=? AND arr=?",
                  (uid, dep.upper(), arr.upper()))
    return {"ok": True}

# ── Settings ──────────────────────────────────────────────────────────────────
@router.get("/settings")
def get_settings(user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        row = c.execute("SELECT settings_json FROM user_settings WHERE user_id=?", (uid,)).fetchone()
    return json.loads(row["settings_json"]) if row else {}

class SettingsIn(BaseModel):
    settings: dict

@router.put("/settings")
def put_settings(body: SettingsIn, user: dict = Depends(verify_token)):
    uid = user["sub"]
    with _db() as c:
        c.execute("INSERT OR REPLACE INTO user_settings VALUES(?,?,?)",
                  (uid, json.dumps(body.settings), time.time()))
    return {"ok": True}
