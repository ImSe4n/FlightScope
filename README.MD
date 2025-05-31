# FlightScope

A real-time flight tracking application that displays aircraft within a 100 NM radius of Ottawa on an interactive map.

## Features
- **Live Flight Tracking**: Shows positions of all aircraft in the Ottawa area using OpenSky Network API
- **Airport Information**: Displays details for Ottawa area airports (CYOW, CYND, CYRO) including runways and coordinates
- **Weather Integration**: Shows real-time weather conditions from Open-Meteo API at each airport location
- **METAR Reports**: Provides aviation weather reporting (METAR) from NOAA for each airport
- **Interactive Map**: Uses Folium to create an interactive map embedded in a PySide6 GUI
- **Aircraft Details**: Click on aircraft icons to view flight information (callsign, altitude, speed, heading)
- **Modern UI**: Clean interface with custom styling and status indicators

## Installation

To run FlightScope, you'll need Python 3.8+ and the following packages:

- **PySide6**: GUI framework
  ```powershell
  pip install PySide6==6.6.0
  ```
- **PySide6-QtWebEngineWidgets**: Web view component for displaying maps
  ```powershell
  pip install PySide6-QtWebEngineWidgets==6.6.0
  ```
- **pandas**: Data analysis and manipulation
  ```powershell
  pip install pandas==2.1.4
  ```
- **folium**: Interactive map creation
  ```powershell
  pip install folium==0.15.0
  ```
- **requests**: HTTP library for API calls
  ```powershell
  pip install requests==2.31.0
  ```
- **geopy**: Geolocation utilities
  ```powershell
  pip install geopy==2.4.1
  ```

Install all requirements at once:
```powershell
pip install -r requirements.txt
```

## Usage

1. Open a terminal and navigate to the project directory
2. Run the application:
   ```powershell
   python main.py
   ```
3. Click "Refresh Data" to fetch the latest flight information
4. Click on any aircraft or airport marker to view detailed information

## Known Bugs

- **Manual Refresh Required**: The map does not automatically update - user must click "Refresh Data" button
- **Airport API Failures**: Sometimes the AirportDB.io API fails to return data; application uses default coordinates in these cases
- **OpenSky API Limitations**: Without valid credentials, data may be limited or missing
- **Performance Issues**: Map rendering can be slow with many aircraft displayed

## Cheat Codes

Follow these steps to quickly evaluate all features of FlightScope:

1. **Setup and Launch (2 minutes)**
   - Install all dependencies: `pip install -r requirements.txt`
   - Launch the app: `python main.py`

2. **View Base Functionality (1 minute)**
   - Click "Refresh Data" to see flights and airports
   - The map will display with Ottawa at the center
   - You should see blue plane icons for aircraft and red info icons for airports

3. **Explore Airport Data**
   - Click on any red airport marker to view:
     - Airport name and ICAO code
     - Runway information
     - Current weather conditions
     - METAR aviation weather report

4. **Explore Flight Data**
   - Click on any blue aircraft marker to see:
     - Aircraft ICAO24 identifier and callsign
     - Current altitude, speed, and heading
     - Squawk code and vertical rate
     
## Support

For questions, bug reports, or feature requests, please contact:
- Sean Nie
- Email: snie1@ocdsb.ca

## Sources
Reference Tracker: [Click Me!](https://docs.google.com/document/d/1ggwyiWpPxQlxJMC85tNu_q6N7F8dK0O2MklQ_9OUHi8/edit?tab=t.0)