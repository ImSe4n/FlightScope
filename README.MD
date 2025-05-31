# FlightScope - Flight Tracking Application

## Description
FlightScope is a real-time flight tracking application centered on Ottawa, Canada. It displays aircraft within a 100 NM radius of Ottawa on an interactive map and provides detailed airport information (runways, weather, METAR) alongside flight data fetched from multiple APIs.

## Features
- Live flight positions via OpenSky Network API
- Airport details from AirportDB.io (runways, coordinates)
- Current weather from Open-Meteo and METAR reports from NOAA
- Interactive map visualization with Folium embedded in a PySide6 GUI
- Configurable refresh intervals and data export to CSV

## Requirements
- Python 3.8+
- PySide6
- pandas
- folium
- requests

Install dependencies:  
```powershell
pip install -r requirements.txt
```

## Configuration
- **OpenSky Credentials:** Set `userName` and `password` in `main.py` or via environment variables.
- **API Tokens:** Replace `airportApiToken` in the application with your AirportDB.io token.
- **Map Settings:** Adjust map bounds, tile style, and zoom level in the app constructor.

## Running the Application
```powershell
python main.py
```

## Usage
1. Launch the GUI.  
2. Click **Refresh Data** to fetch the latest flights and airports.  
3. Click an aircraft or airport icon to view details in a popup.  
4. (Future) Use the search box or altitude slider to filter flights.  
5. (Future) Export flight data to CSV via the **Export** button.

## APIs Used
- **OpenSky Network** – Flight state vectors (positions, callsigns, speed, altitude)
- **AirportDB.io** – Airport metadata (name, location, runways)
- **Open-Meteo** – Current weather by geolocation
- **NOAA METAR** – Aviation weather reports (METAR)

## Version History
- **v1.0 (2025-04-29):** OpenSky integration
- **v2.0 (2025-05-05):** GUI with PySide6
- **v3.0 (2025-05-10):** Folium map visualization
- **v4.0 (2025-05-26):** Airport, weather, METAR data sources
- **v5.0 (2025-05-30):** Code refactor, documentation, modular design

## Author
Sean Nie
