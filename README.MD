# FlightScope Web

**Course:** ICS3U-01  
**Author:** Sean Nie

A full-stack live flight tracking web app. Shows every airborne aircraft in real time on an interactive world map, with detailed flight, aircraft, and airport information.

---

## Features

**Live Flight Map**
- Real-time positions for thousands of aircraft worldwide, sourced from the OpenSky Network
- Aircraft icons coloured by altitude (green → low, blue → mid, purple → high, white → very high)
- Icons rotate to match the aircraft's heading
- Emergency squawk codes (7500 Hijack, 7600 Radio Failure, 7700 Emergency) highlighted with a blinking badge
- Clusters nearby aircraft at low zoom levels; unpacks at zoom 14+
- Flight path trail shown when an aircraft is selected

**Flight Detail Panel**
- Click any aircraft to open a sidebar panel with:
  - Callsign, ICAO24 hex code, airborne/ground status
  - Altitude (ft), speed (kt), heading, vertical rate
  - Departure → arrival route with times (from OpenSky route database + flight history)
  - Aircraft registration, ICAO type code, model, operator (from hexdb.io)
  - Aircraft photo (from Planespotters.net)
  - Squawk code, SPI flag, data source type, last contact time
  - Copy buttons for ICAO24, callsign, and coordinates

**Airports**
- ~500 large scheduled airports plotted as map pins (data from OurAirports)
- ~60 major global hubs visible at all zoom levels; remaining airports appear at zoom 4+
- Click an airport pin to load enriched details:
  - Wikipedia image and description
  - Runways (identifier, length, width, surface)
  - Current weather (temperature, wind speed/direction, condition)
  - Live METAR string
  - Elevation, country, city

**Search & Filters**
- Real-time search by callsign, ICAO24, origin country, or squawk
- Filters: hide ground traffic, emergency only, country, data source, altitude range, speed range

**Map Layers**
- Dark, Light, Satellite, Street (switchable from the header)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, react-leaflet, leaflet.markercluster |
| Backend | Python, FastAPI, uvicorn |
| Flight data | OpenSky Network (OAuth2) |
| Airport data | OurAirports CSV (cached daily) |
| Airport detail | airportdb.io, Wikipedia REST API, Open-Meteo, NOAA METAR |
| Aircraft info | hexdb.io |
| Aircraft photos | Planespotters.net |
| Route data | OpenSky route database |

---

## Setup

### Requirements

- Python 3.10+
- Node.js 18+

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure credentials

Create a `.env` file in the project root:

```
OPENSKY_CLIENT_ID=your_client_id
OPENSKY_CLIENT_SECRET=your_client_secret
```

Get these from [opensky-network.org](https://opensky-network.org) → Account → API Clients. Create a new API client and copy the `client_id` and `client_secret` — these are different from your account login username/password.

### 3. Build the frontend

```bash
cd frontend
npm install
npm run build
```

### 4. Run the server

```bash
uvicorn server:app
```

Open [http://localhost:8000](http://localhost:8000).

---

## Development

To run the frontend dev server with hot reload alongside the backend:

```bash
# Terminal 1 — backend
uvicorn server:app --reload

# Terminal 2 — frontend
cd frontend
npm run dev
```

The frontend dev server runs on `http://localhost:5173` and proxies API calls to the backend.

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/flights` | All live aircraft (cached 60 s) |
| `GET /api/airports` | All large scheduled airports |
| `GET /api/airport/{ident}` | Enriched airport detail (weather, runways, Wikipedia) |
| `GET /api/aircraft/{icao24}` | Aircraft registration and type info |
| `GET /api/route/{callsign}` | Scheduled route for a callsign |
| `GET /api/track/{icao24}` | Recent flight path points |
| `GET /api/flight-history/{icao24}` | Last 24 h of flights for an aircraft |

---

## Data Sources

| Source | Data | License |
|---|---|---|
| [OpenSky Network](https://opensky-network.org) | Live flight states | Free tier, requires account |
| [OurAirports](https://ourairports.com) | Airport database | Public domain |
| [airportdb.io](https://airportdb.io) | Runway details | Free |
| [Open-Meteo](https://open-meteo.com) | Airport weather | Free, no key required |
| [NOAA METAR](https://tgftp.nws.noaa.gov) | METAR strings | Public domain |
| [hexdb.io](https://hexdb.io) | Aircraft registration/type | Free |
| [Planespotters.net](https://www.planespotters.net) | Aircraft photos | Free |
| [Wikipedia](https://en.wikipedia.org) | Airport descriptions/images | CC BY-SA |
