"""
Name: FlightScope
Course Code: ICS3U-01
Author: Sean Nie
Description: This program is a basic flight tracker that allows users to input flight information, including departure and arrival airports, flight number, and date.
History:
2025-04-29      Version 1 (fetches flight data from OpenSky Network API)
2025-05-05      Version 2 (added GUI using PySide6)
2025-05-10      Version 3 (plot aircraft on map using Folium)
2025-05-26
"""
import sys
import os
import math
import requests
import pandas as pd
import folium
import io
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                               QPushButton, QLabel, QFrame)
from PySide6.QtWebEngineWidgets import QWebEngineView
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
BG_COLOR = "#263238"  # Dark blue-gray
HEADER_COLOR = "#37474F"  # Darker blue-gray
TEXT_COLOR = "#ECEFF1"  # Light gray
AIRCRAFT_COLOR = "#2196F3"  # Blue color for aircraft
GRID_COLOR = "#37474F"  # Grid line color
LAND_COLOR = "#455A64"    # Land color
WATER_COLOR = "#1A237E"   # Water color
BORDER_COLOR = "#78909C"  # Border lines color
TRACK_COLOR = "#4FC3F7"   # Aircraft track color


class FlightScopeApp(QMainWindow):
    """
    Represents the main application for displaying flight data near Ottawa.

    Attributes:
        userName (str): OpenSky Network API username
        password (str): OpenSky Network API password
        mapView (QWebEngineView): map widget for displaying flight data
        countLabel (QLabel): label showing number of flights
        updateLabel (QLabel): label showing last update time
    """

    def __init__(self):
        """
        Initializes instance attributes.

        Args:
            None
        """
        super().__init__()
        self.setWindowTitle("FlightScope")
        self.setGeometry(100, 100, 1200, 700)
        self.setStyleSheet(
            f"background-color: {BG_COLOR}; color: {TEXT_COLOR};")

        # API credentials
        self.userName = ''  # OpenSky username
        self.password = ''  # OpenSky password

        # Set up UI components
        self.setupUi()

        # Initial data load
        self.fetchFlightData()

    def setupUi(self):
        """
        Sets up the UI components.

        Args:
            None
        """
        # Main widget and layout
        centralWidget = QWidget()
        mainLayout = QVBoxLayout(centralWidget)

        # Create header
        headerFrame = self.buildHeaderBar()
        mainLayout.addWidget(headerFrame)

        # Create controls
        controlFrame = self.createControls()
        mainLayout.addWidget(controlFrame)

        # Create map view using QWebEngineView (to display the HTML content, may be removed later if the planes move dynamically)
        self.mapView = QWebEngineView()
        mainLayout.addWidget(self.mapView)

        self.setCentralWidget(centralWidget)

    def buildHeaderBar(self):
        """
        Creates the application header.

        Returns:
            QFrame: header frame widget
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
        Creates the control panel with buttons and status labels.

        Returns:
            QFrame: control frame widget
        """
        controlFrame = QFrame()
        controlLayout = QHBoxLayout(controlFrame)

        # Refresh button
        refreshButton = QPushButton("Refresh Data")
        refreshButton.setStyleSheet(
            "background-color: #546E7A; color: white; padding: 8px;")
        refreshButton.clicked.connect(self.fetchFlightData)
        controlLayout.addWidget(refreshButton)

        controlLayout.addStretch()

        # Status labels
        self.countLabel = QLabel("Flights: 0")
        self.countLabel.setStyleSheet(f"color: {TEXT_COLOR};")
        controlLayout.addWidget(self.countLabel)

        self.updateLabel = QLabel("Last Updated: Never")
        self.updateLabel.setStyleSheet(f"color: {TEXT_COLOR};")
        controlLayout.addWidget(self.updateLabel)

        return controlFrame

    def fetchFlightData(self):
        """
        Fetches and displays flight data from OpenSky Network API.

        Args:
            None
        """
        # Construct API URL
        urlData = (
            f'https://{self.userName}:{self.password}@opensky-network.org/api/states/all?'
            f'lamin={MIN_LAT}&lomin={MIN_LON}&lamax={MAX_LAT}&lomax={MAX_LON}'
        )

        # Make API request
        response = requests.get(urlData)

        if response.status_code == 200:
            data = response.json()

            if 'states' in data and data['states']:
                # Define column names
                columns = [
                    'ICAO24', 'Callsign', 'Origin', 'TimePos',
                    'LastContact', 'Long', 'Lat', 'Alt',
                    'OnGround', 'Speed', 'Heading', 'VertRate',
                    'Sensors', 'GeoAlt', 'Squawk', 'SPI', 'Source'
                ]

                # Create DataFrame
                flightDf = pd.DataFrame(data['states'])
                flightDf = flightDf.iloc[:, 0:17]  # First 17 columns
                flightDf.columns = columns
                flightDf = flightDf.fillna('No Data')

                # Only keep flights with valid lat/lon
                flightDf = flightDf[(flightDf['Lat'] != 'No Data') & (
                    flightDf['Long'] != 'No Data')]

                # Generate map
                m = folium.Map(location=[
                               (MIN_LAT+MAX_LAT)/2, (MIN_LON+MAX_LON)/2], zoom_start=7, tiles='cartodbpositron')
                # Add a marker for each flight in the DataFrame
                for _, row in flightDf.iterrows():  # go through each row
                    # Get the latitude and longitude
                    lat = float(row['Lat'])
                    lon = float(row['Long'])
                    icao = row['ICAO24']
                    callsign = row['Callsign']
                    altitude = row['Alt']
                    speed = row['Speed']
                    heading = row['Heading']
                    vertical_rate = row['VertRate']
                    squawk = row['Squawk']

                    # Create popup content
                    popupContent = f"""
                    <b>ICAO24:</b> {icao}<br>
                    <b>Callsign:</b> {callsign}<br>
                    <b>Altitude:</b> {altitude} m<br>
                    <b>Speed:</b> {speed} m/s<br>
                    <b>Heading:</b> {heading}°<br>
                    <b>Vertical Rate:</b> {vertical_rate} m/s<br>
                    <b>Squawk:</b> {squawk}<br>
                    """

                    # Add aircraft marker with popup
                    folium.Marker(
                        location=[lat, lon],
                        popup=folium.Popup(popupContent, max_width=300),
                        icon=folium.Icon(
                            color='blue', icon='plane', prefix='fa')
                    ).add_to(m)
                    # Fetch and draw historical path
                    tracksUrl = (
                        f'https://{self.userName}:{self.password}@opensky-network.org'
                        f'/api/tracks/all?icao24={icao}&time={int(row["LastContact"])}'
                    )
                    trResp = requests.get(tracksUrl)
                    if trResp.status_code == 200:
                        trData = trResp.json()
                        if 'path' in trData and trData['path']:
                            coords = [[pt[1], pt[0]] for pt in trData['path']]
                            folium.PolyLine(coords, color='green',
                                            weight=2, opacity=0.7).add_to(m)
                # save map to HTML - see reference tracker for chatgpt code reference
                # according to chatgpt, this is a better way to save the map instead of saving it to a file
                data = io.BytesIO()
                m.save(data, close_file=False)
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


# Main program entry point
if __name__ == "__main__":
    """
    Entry point for the application.

    Args:
        None
    """
    # Create the application
    app = QApplication(sys.argv)
    window = FlightScopeApp()
    window.show()

    sys.exit(app.exec())
