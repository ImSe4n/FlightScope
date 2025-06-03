"""
Name: FlightScope
Course Code: ICS3U-01
Author: Sean Nie
Description: This program is a basic flight tracker that allows users to input flight information, including departure and arrival airports, flight number, and date.
History:
2025-04-29      Version 1 (fetches flight data from OpenSky Network API)
2025-05-05      Version 2 (added GUI using PySide6)
2025-05-10      Version 3 (plot aircraft on map using Folium)
2025-05-26      Version 4 (added airport data from airportdb.io API, weather from Open-Meteo API, and METAR from NOAA)
2025-05-30      Version 5 (finalize code, added comments, cleaned up code)
"""
import sys
import os
import math
import requests
import pandas as pd
import folium
import io
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,QPushButton, QLabel, QFrame)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtCore import Qt, QTimer
from datetime import datetime

# ----- Constants -----
# Ottawa coordinates with 100 NM radius
MIN_LAT, MAX_LAT = 43.6665, 47.1765
MIN_LON, MAX_LON = -79.1972, -72.1972
CENTER_LAT = (MIN_LAT + MAX_LAT) / 2
CENTER_LON = (MIN_LON + MAX_LON) / 2

# Graphics settings
MAP_WIDTH = 1000   # Width of the map view in pixels
MAP_HEIGHT = 700   # Height of the map view in pixels
AIRCRAFT_SIZE = 20  # Size of aircraft icon in pixels

# ----- Colours -----
BG_COLOR = "#263238"
HEADER_COLOR = "#37474F"
TEXT_COLOR = "#ECEFF1"
AIRCRAFT_COLOR = "#2196F3"
GRID_COLOR = "#37474F"
LAND_COLOR = "#455A64"
WATER_COLOR = "#1A237E"
BORDER_COLOR = "#78909C"
TRACK_COLOR = "#4FC3F7"

# ----- Class -----
class FlightScopeApp(QMainWindow):
    """
    Main application for displaying flight data near Ottawa.

    Attributes:
        userName (str): OpenSky Network API username
        password (str): OpenSky Network API password
        mapView (QWebEngineView): map widget for displaying flight data
        countLabel (QLabel): label showing number of flights
        updateLabel (QLabel): label showing last update time
    """

    # ----- Functions -----
    def __init__(self):
        """Initializes the application"""
        super().__init__()
        self.setWindowTitle("FlightScope")
        self.setGeometry(100, 100, 1200, 700)
        self.setStyleSheet(
            f"background-color: {BG_COLOR}; color: {TEXT_COLOR};")

        # API credentials
        self.userName = ''  # OpenSky username
        self.password = ''  # OpenSky password

        # Config parameters
        self.minLat = MIN_LAT
        self.maxLat = MAX_LAT
        self.minLon = MIN_LON
        self.maxLon = MAX_LON
        self.centerLat = CENTER_LAT
        self.centerLon = CENTER_LON

        # AirportDB and weather/METAR API settings
        self.airportApiToken = '89e420818cba11453f8c0d69dd06e6a075288321eb34723d17fadf678cde51f575dd81b6245e01cf77f26831dd973895'
        self.airports = {
            'CYOW': {'lat': 45.3225, 'lon': -75.6692},
            'CYND': {'lat': 45.5210, 'lon': -75.5630},
            'CYRO': {'lat': 45.4592, 'lon': -75.6522}
        }
        self.mapTiles = 'cartodbpositron' # Folium tile layer
        self.zoomStart = 7

        # Set up UI components
        self.setupUi()

        # Initial data load
        self.fetchFlightData()

    def setupUi(self):
        """Sets up the user interface components"""
        # Main widget and layout
        centralWidget = QWidget()
        mainLayout = QVBoxLayout(centralWidget)

        # Create header
        headerFrame = self.buildHeaderBar()
        mainLayout.addWidget(headerFrame)

        # Create controls
        controlFrame = self.createControls()
        mainLayout.addWidget(controlFrame)

        # Create map view using QWebEngineView (to display the HTML content, may be removed later if the planes move dynamically - couldnt get this to work in the timeframe :()
        self.mapView = QWebEngineView()
        mainLayout.addWidget(self.mapView)

        self.setCentralWidget(centralWidget)

    def buildHeaderBar(self):
        """
        Creates the application header
        Returns:
            (QFrame): header frame widget
        """
        headerFrame = QFrame()
        headerFrame.setStyleSheet(f"background-color: {HEADER_COLOR};")
        headerLayout = QHBoxLayout(headerFrame)

        titleLabel = QLabel("FlightScope")
        titleLabel.setStyleSheet(
            f"color: {TEXT_COLOR}; font-size: 16pt; font-weight: bold;")
        headerLayout.addWidget(titleLabel)

        return headerFrame

    def createControls(self):
        """
        Creates the control panel with buttons and status labels
        Returns:
            (QFrame): control frame widget containing buttons and labels
        """
        controlFrame = QFrame()
        controlLayout = QHBoxLayout(controlFrame)

        # Refresh button
        refreshButton = QPushButton("Refresh Data")
        refreshButton.setStyleSheet(
            "background-color: #546E7A; color: white; padding: 8px;")
        refreshButton.clicked.connect(self.fetchFlightData)
        controlLayout.addWidget(refreshButton)

        controlLayout.addStretch() # Add stretch to push controls to the left

        # Status labels
        self.countLabel = QLabel("Flights: 0")
        self.countLabel.setStyleSheet(f"color: {TEXT_COLOR};")
        controlLayout.addWidget(self.countLabel)

        self.updateLabel = QLabel("Last Updated: Never")
        self.updateLabel.setStyleSheet(f"color: {TEXT_COLOR};")
        controlLayout.addWidget(self.updateLabel)

        return controlFrame

    def getAirportData(self, airports=None, apiToken=None):
        """
        Fetch airport info (coordinates, runways, weather, METAR) and return list of data dicts
        Args:
            airports (dict): Dictionary of airport identifiers and their coordinates
            apiToken (str): API token for airportdb.io API
        Returns:
            (list): List of dictionaries containing airport data
        """
        apiToken = apiToken or self.airportApiToken
        airports = airports or self.airports
        airportList = [] # list to store airport data dictionaries
        
        # Default airports with coordinates
        for ident, default in airports.items(): # iterating through the airports dictionary
            # Fetch airport data from API
            lat, lon = default['lat'], default['lon']
            resp = requests.get(f'https://airportdb.io/api/v1/airport/{ident}?apiToken={apiToken}')
            data = {'ident': ident, 'name': ident, 'lat': lat, 'lon': lon} # default data structure
            # If the API request was successful, update data with the response
            if resp.status_code == 200:
                ad = resp.json() # get the JSON response from the API
                data.update({
                    'name': ad.get('name', ident),
                    'lat': ad.get('latitude', lat),
                    'lon': ad.get('longitude', lon),
                    'runways': ad.get('runways', [])
                })
            # weather
            wresp = requests.get(f"https://api.open-meteo.com/v1/forecast?latitude={data['lat']}&longitude={data['lon']}&current_weather=true")
            # check if the weather API request was successful
            if wresp.ok:
                cw = wresp.json().get('current_weather', {}) # get current weather data
                data['weather'] = f"{cw.get('temperature','?')}°C, wind {cw.get('windspeed','?')} m/s" # format weather data from the API response, cpi.get comes from the current weather data dictionary
            # METAR
            mresp = requests.get(f"https://tgftp.nws.noaa.gov/data/observations/metar/stations/{ident}.TXT") # get METAR data from NOAA
            # check if the METAR API request was successful
            if mresp.ok:
                lines = mresp.text.splitlines() # split the response text into lines
                # if there are multiple lines, take the second line as the METAR report
                # otherwise, set METAR to 'N/A', this is because the first line is usually a header, second line is the actual METAR report
                if len(lines) > 1:
                    data['metar'] = lines[1]
                else:
                    data['metar'] = 'N/A'
            data['atis'] = 'N/A' #
            airportList.append(data) # # append the airport data to the list
        # Return list of airport data dictionaries
        return airportList

    def fetchAirportData(self, airports=None, apiToken=None):
        """
        Plot airport markers on the map
        Args:
            airports (dict): Dictionary of airport identifiers and their coordinates
            apiToken (str): API token for airportdb.io API
        Returns:
            None
        """
        # Plot each airport entry from structured data
        for ad in self.getAirportData(airports, apiToken): # get airport data from API, run through each airport in the list
            # Format runway HTML
            # Build runway descriptions
            runwayDescriptions = [] # list to store runway descriptions
            # Check if runways exist in the airport data
            for rw in ad.get('runways', []): # go through each runway in the airport data
                # get runway details, if not available, use '?'
                le = rw.get('le_ident', '?')
                he = rw.get('he_ident', '?')
                length = rw.get('length_ft', '?')
                width = rw.get('width_ft', '?')
                surface = rw.get('surface', '?')
                desc = f"{le}/{he} - {length}ft x {width}ft ({surface})"
                runwayDescriptions.append(desc)

            # if runwayDescriptions is not empty, join them with <br> for HTML formatting otherwise, set formattedRunways to 'No runway data'
            if runwayDescriptions:
                formattedRunways = "<br>".join(runwayDescriptions)
            else:
                formattedRunways = "No runway data"
            # Create popup content with airport details
            popup = f"""
            <div style='font-family:Arial;font-size:12px;'>
                <b>Airport:</b> {ad['name']}<br>
                <b>Runways:</b><br>{formattedRunways}<br>
                <b>Weather:</b> {ad.get('weather','N/A')}<br>
                <b>ATIS:</b> {ad.get('atis','N/A')}<br>
                <b>METAR:</b> {ad.get('metar','N/A')}<br>
            </div>
            """
            # Add marker to the map
            folium.Marker(
                location=[ad['lat'], ad['lon']],
                popup=folium.Popup(popup, max_width=300),
                icon=folium.Icon(color='red', icon='info-sign')
            ).add_to(self.map)

    def fetchFlightData(self):
        """Fetches and displays flight data from OpenSky Network API."""
        # Construct API URL using instance configuration
        urlData = (
            f'https://{self.userName}:{self.password}@opensky-network.org/api/states/all?'
            f'lamin={self.minLat}&lomin={self.minLon}&lamax={self.maxLat}&lomax={self.maxLon}'
        )
        # Fetch flight data from OpenSky Network API
        response = requests.get(urlData)
        # Check if the request was successful
        if response.status_code == 200:
            data = response.json()

            if 'states' in data and data['states']: # Check if there are any flights
                # Process flight data
                # Define column names
                columns = [
                    'ICAO24', 'Callsign', 'Origin', 'TimePos',
                    'LastContact', 'Long', 'Lat', 'Alt',
                    'OnGround', 'Speed', 'Heading', 'VertRate',
                    'Sensors', 'GeoAlt', 'Squawk', 'SPI', 'Source'
                ]

                # Create DataFrame
                flightDf = pd.DataFrame(data['states'])
                flightDf = flightDf.iloc[:, 0:17]  # First 17 columns, .iloc is used to select rows and columns by index
                flightDf.columns = columns
                flightDf = flightDf.fillna('No Data')

                # Only keep flights with valid lat/lon
                flightDf = flightDf[(flightDf['Lat'] != 'No Data') & (
                    flightDf['Long'] != 'No Data')]

                # Generate map
                # Initialize map with instance-configured parameters
                self.map = folium.Map(
                    location=[self.centerLat, self.centerLon],
                    zoom_start=self.zoomStart,
                    tiles=self.mapTiles
                )

                # Add airport markers (explicitly pass configuration)
                self.fetchAirportData(airports=self.airports, apiToken=self.airportApiToken)

                # Add a marker for each flight in the DataFrame
                for _, row in flightDf.iterrows():  # go through each row in the DataFrame
                    # Skip if lat/lon are not valid
                    lat = float(row['Lat'])
                    lon = float(row['Long'])
                    icao = row['ICAO24']
                    callsign = row['Callsign']
                    altitude = row['Alt']
                    speed = row['Speed']
                    heading = row['Heading']
                    verticalRate = row['VertRate']
                    squawk = row['Squawk']

                    # Create popup content
                    popupContent = f"""
                    <b>ICAO24:</b> {icao}<br>
                    <b>Callsign:</b> {callsign}<br>
                    <b>Altitude:</b> {altitude} m<br>
                    <b>Speed:</b> {speed} m/s<br>
                    <b>Heading:</b> {heading}°<br>
                    <b>Vertical Rate:</b> {verticalRate} m/s<br>
                    <b>Squawk:</b> {squawk}<br>
                    """
                    # Add marker to the map
                    folium.Marker(
                        location=[lat, lon],
                        popup=folium.Popup(popupContent, max_width=300),
                        icon=folium.Icon(
                            color='blue', icon='plane', prefix='fa')
                    ).add_to(self.map)

                # Save map to HTML
                #according to chatgpt, this is a better way to save the map rather than saving it to a file as utilizing BytesIO allows us to keep it in memory rather than writing to disk - check reference tracker
                data = io.BytesIO()
                self.map.save(data, close_file=False)
                self.mapView.setHtml(data.getvalue().decode())

                # Update status
                self.countLabel.setText(f"Flights: {len(flightDf)}")
                self.updateLabel.setText(
                    f"Updated: {datetime.now().strftime('%H:%M:%S')}")
            else:
                # No flights found
                self.countLabel.setText("Flights: 0")
                self.updateLabel.setText(
                    f"Updated: {datetime.now().strftime('%H:%M:%S')}")
        else:
            # Request failed
            self.countLabel.setText("Flights: --")
            self.updateLabel.setText("Update failed")

    # def validateCoordinates(self, lat, lon):
    #    """
    #    Validate latitude and longitude values
    #    Args:
    #        lat (str): Latitude value
    #        lon (str): Longitude value
    #    Returns:
    #        (tuple): Validated latitude and longitude as floats, or (None, None) if invalid
    #    """
    #     # Ensure lat/lon are valid floats within range, else return None
    #     try:
    #         latVal = float(lat)
    #         lonVal = float(lon)
    #         if -90 <= latVal <= 90 and -180 <= lonVal <= 180:
    #             return latVal, lonVal
    #         else:
    #             raise ValueError("Coordinates out of range")
    #     except (ValueError, TypeError):
    #         return None, None

    # def exportFlightData(self):
    #     """Export current flight data to CSV"""
    #     # Check if flight data exists
    #     if hasattr(self, 'flightDf'): # ensure flightDf is defined
    #         filename = f"flights_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    #         self.flightDf.to_csv(filename, index=False)
    #         # Could show success message

# Main program entry point
if __name__ == "__main__":
    # Create the application
    app = QApplication(sys.argv)
    window = FlightScopeApp()
    window.show()

    sys.exit(app.exec())
