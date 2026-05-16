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
- Smooth dead-reckoned movement between API refreshes (positions interpolated every 500 ms)
- Emergency squawk codes (7500 Hijack, 7600 Radio Failure, 7700 Emergency) highlighted with a blinking badge
- Clusters nearby aircraft at low zoom levels; unpacks at zoom 14+
- Flight path trail shown when an aircraft is selected, coloured by altitude
- Dashed extension line from last recorded point to current dead-reckoned position

**Map Styles & Overlays**
- Seven tile layers: Dark, Light, Satellite, Hybrid (satellite + labels), Terrain, Roadmap, Street
- Day/Night terminator — shades the nighttime half of the globe (updates every minute)
- ATC/FIR boundaries — worldwide Flight Information Region borders from VATSIM boundary data
- Weather radar — live precipitation overlay via RainViewer (free, no API key required)
- Layer panel accessible from the ☰ button on the map

**Flight Detail Panel**
- Click any aircraft to open a sidebar panel with:
  - Callsign, ICAO24 hex code, airborne/ground status pill
  - Altitude (ft), speed (kt), heading, vertical rate
  - **Action buttons:** Follow (auto-pan map), Route (toggle track), 3D (globe view), Share (copy to clipboard)
  - Departure → arrival route with scheduled/actual times, terminal and gate info
  - **Distance to destination** (great-circle, updated live)
  - **Flight progress bar** — position-based percentage, elapsed time, and ETA from current speed
  - Altitude history chart (SVG, drawn from track data)
  - Aircraft registration, ICAO type code, model, operator (from hexdb.io)
  - Aircraft photo (from Planespotters.net)
  - Squawk code, SPI flag, data source type, last contact time
  - Copy buttons for ICAO24, callsign, and coordinates

**3D Globe View**
- Opens when clicking the 3D button in the flight detail panel
- Renders a procedural 3D airplane model (fuselage, swept wings, winglets, stabiliser, fin, engines) oriented on the globe surface at the correct heading
- Shows the historical flight track path and an animated great-circle arc from departure to arrival
- Departure and arrival airports marked in amber
- Built with Three.js via react-globe.gl; lazy-loaded so it never blocks the main app

**Follow Mode**
- Activate from the Follow button in the flight detail panel
- Map continuously pans to keep the selected aircraft centred
- Cancelled automatically on deselect or Escape

**Airports**
- ~500 large scheduled airports plotted as map pins (data from OurAirports)
- ~60 major global hubs visible at all zoom levels; remaining airports appear at zoom 4+
- Click an airport pin to load enriched details:
  - Wikipedia image and description
  - Runways (identifier, length, width, surface) with active runway highlighted
  - Current weather (temperature, wind speed/direction, WMO condition)
  - Hourly weather forecast
  - Live METAR string
  - Elevation, country, city, airport type
- **Flights tab** — departures and arrivals for the last 24 h:
  - LIVE badge (green, pulsing) for currently airborne flights — click to track on map
  - TAXI badge (amber) for flights currently on the ground
  - REC badge (grey) for flights seen within the last 2 hours

**Search & Filters**
- Real-time search by callsign, ICAO24, origin country, or squawk
- Filters: hide ground traffic, emergency only, country, airline (ICAO prefix), data source, altitude range, speed range

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, react-leaflet, leaflet.markercluster, Three.js, react-globe.gl |
| Backend | Python, FastAPI, uvicorn |
| Flight data | OpenSky Network (OAuth2) |
| Airport data | OurAirports CSV (cached daily) |
| Airport detail | airportdb.io, Wikipedia REST API, Open-Meteo, NOAA METAR |
| Aircraft info | hexdb.io |
| Aircraft photos | Planespotters.net |
| Route / flight data | OpenSky route database, AeroDataBox |
| Weather radar | RainViewer |
| ATC boundaries | VATSIM vatspy-data-project |

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

## Project Structure

```
FlightScope/
├── server.py              # FastAPI app entry point
├── api/
│   ├── opensky.py         # Flight data polling and cache
│   └── airports.py        # Airport enrichment endpoints
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── MapView.jsx        # Leaflet map, overlays, cluster layer
│   │   │   ├── FlightDetail.jsx   # Selected flight sidebar panel
│   │   │   ├── Globe3DModal.jsx   # Three.js 3D globe view
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Header.jsx
│   │   │   ├── Popups.jsx         # Flight and airport map popups
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   └── useFlights.js      # Data fetching + dead reckoning
│   │   └── utils/
│   │       ├── constants.js       # Tile layers, squawk codes
│   │       └── icons.js           # Leaflet icon factories
│   └── dist/                      # Built frontend (served by FastAPI)
└── requirements.txt
```

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
| `GET /api/flight-status/{callsign}` | Departure/arrival times from AeroDataBox |
| `GET /api/airport-flights/{ident}` | Departures and arrivals for an airport |

---

## Data Sources

| Source | Data | License |
|---|---|---|
| [OpenSky Network](https://opensky-network.org) | Live flight states, tracks, routes, history | Free tier, requires account |
| [OurAirports](https://ourairports.com) | Airport database | Public domain |
| [airportdb.io](https://airportdb.io) | Runway details | Free |
| [Open-Meteo](https://open-meteo.com) | Airport weather forecast | Free, no key required |
| [NOAA METAR](https://tgftp.nws.noaa.gov) | METAR strings | Public domain |
| [hexdb.io](https://hexdb.io) | Aircraft registration/type | Free |
| [Planespotters.net](https://www.planespotters.net) | Aircraft photos | Free |
| [Wikipedia](https://en.wikipedia.org) | Airport descriptions/images | CC BY-SA |
| [AeroDataBox](https://aerodatabox.com) | Flight status and times | Free tier |
| [RainViewer](https://www.rainviewer.com/api.html) | Weather radar tiles | Free, no key required |
| [VATSIM vatspy-data-project](https://github.com/vatsimnetwork/vatspy-data-project) | ATC/FIR boundaries | MIT |
