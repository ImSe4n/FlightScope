"""
Name: FlightScope Web
Course Code: ICS3U-01
Author: Sean Nie
Description: FastAPI entry point — wires up routers and serves the React build.
"""
import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.opensky  import router as flights_router
from api.airports import router as airports_router

app = FastAPI(title="FlightScope API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(flights_router)
app.include_router(airports_router)

# ── Serve React build in production ───────────────────────────────────────────
_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_react(full_path: str):
        return FileResponse(os.path.join(_dist, "index.html"))
