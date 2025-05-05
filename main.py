"""
Name: FlightScope
Course Code: ICS3U-01
Author: Sean Nie
Description: This program is a basic flight tracker that allows users to input flight information, including departure and arrival airports, flight number, and date.
History:
2025-04-29      Version 1 (fetches flight data from OpenSky Network API)
2025-05-05      Version 2 (added GUI using PySide6)

"""
import sys
import requests
import pandas as pd
from PySide6.QtWidgets import QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QTableView, QHeaderView, QFrame
from PySide6.QtCore import Qt, QTimer, QAbstractTableModel
from datetime import datetime

# ----- Constants -----
# Ottawa coordinates with 100 NM radius
MIN_LAT, MAX_LAT = 43.6665, 47.1765
MIN_LON, MAX_LON = -79.1972, -72.1972
REFRESH_TIME = 60000  # milliseconds
# TODO: make refresh time configurable later

# ----- Colours -----
BG_COLOR = "#263238"  # Dark blue-gray
HEADER_COLOR = "#37474F"  # Darker blue-gray
TEXT_COLOR = "#ECEFF1"  # Light gray


class FlightDataModel(QAbstractTableModel):
    """
    Model for displaying flight data in a table view.

    Attributes:
        _data (DataFrame): pandas DataFrame containing flight information
    """

    def __init__(self, data):
        """
        Initializes the flight data model
        Args:
            data (DataFrame): pandas DataFrame to display
        """
        super().__init__()
        self._data = data
        # self.sortColumn = 0  # not implemented yet

    def rowCount(self, parent=None):
        return self._data.shape[0]

    def columnCount(self, parent=None):
        return self._data.shape[1]

    def data(self, index, role=Qt.DisplayRole):
        """
        Provides data to display in each cell
        Args:
            index (QModelIndex): cell index
            role (Qt.ItemDataRole): data role
        Returns:
            (str or None): cell data or None if invalid
        """
        if not index.isValid():  # C6: Selection structure
            return None

        if role == Qt.DisplayRole:  # C5: Comparison operator
            return str(self._data.iloc[index.row(), index.column()])
        elif role == Qt.TextAlignmentRole:
            return Qt.AlignCenter

        return None

    def headerData(self, section, orientation, role):
        if role != Qt.DisplayRole:
            return None

        if orientation == Qt.Horizontal:
            # Let's make these column names look nice
            return str(self._data.columns[section]).replace('_', ' ').title()

        return str(section + 1)  # Row numbers start at 1


class FlightScopeApp(QMainWindow):
    """
    Main application for displaying flight data near Ottawa.

    Attributes:
        userName (str): OpenSky Network API username
        password (str): OpenSky Network API password
        tableView (QTableView): table widget for displaying flight data
        countLabel (QLabel): label showing number of flights
        updateLabel (QLabel): label showing last update time
        timer (QTimer): timer for auto-refresh functionality
    """

    def __init__(self):
        """Initializes the application"""
        super().__init__()
        self.setWindowTitle("FlightScope")
        self.setGeometry(100, 100, 1200, 700)
        self.setStyleSheet(
            f"background-color: {BG_COLOR}; color: {TEXT_COLOR};")

        # API credentials (C1: variables)
        self.userName = ''  # OpenSky username
        self.password = ''  # OpenSky password
        # self.debug_mode = False  # might add this later

        # Set up UI components
        self.setupUi()

        # Set up auto-refresh timer (C8: Repetition)
        self.timer = QTimer(self)
        self.timer.setInterval(REFRESH_TIME)
        self.timer.timeout.connect(self.fetchFlightData)
        self.timer.start()

        # Initial data load
        self.fetchFlightData()

    def setupUi(self):
        # Main widget and layout (C9: Nested structures)
        centralWidget = QWidget()
        mainLayout = QVBoxLayout(centralWidget)

        # Create header
        headerFrame = self.buildHeaderBar()
        mainLayout.addWidget(headerFrame)

        # Create controls
        controlFrame = self.createControls()
        mainLayout.addWidget(controlFrame)

        # Create table view
        self.tableView = self.createTableView()
        mainLayout.addWidget(self.tableView)

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

    def createTableView(self):
        tableView = QTableView()
        # Making the table look decent with alternating row colors
        tableView.setStyleSheet(
            "QTableView { background-color: #455A64; gridline-color: #78909C; color: white; }"
            "QTableView::item { border-color: #78909C; padding: 5px; }"
            "QHeaderView::section { background-color: #37474F; color: white; padding: 5px; }"
            "QTableView::item:alternate { background-color: #546E7A; }"
        )
        tableView.setAlternatingRowColors(True)
        tableView.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)

        return tableView

    def formatTimestamp(self, timestamp):
        try:
            if pd.isna(timestamp) or timestamp == 'No Data':
                return 'No Data'
            # C2: Arithmetic operation (implicit conversion)
            return datetime.fromtimestamp(float(timestamp)).strftime('%Y-%m-%d %H:%M:%S')
        except:
            # this is a bit lazy but it works
            return 'No Data'

    def fetchFlightData(self):
        """Fetches and displays flight data from OpenSky Network API"""
        # Construct API URL (C3: Processing input)
        urlData = (
            f'https://{self.userName}:{self.password}@opensky-network.org/api/states/all?'
            f'lamin={MIN_LAT}&lomin={MIN_LON}&lamax={MAX_LAT}&lomax={MAX_LON}'
        )

        try:  # H4: Exception handling
            # Make API request
            response = requests.get(urlData)
            # print(f"DEBUG: Got response code {response.status_code}")

            if response.status_code == 200:  # C5: Comparison operator
                data = response.json()

                # C7: Boolean operators (AND)
                if 'states' in data and data['states']:
                    # Define column names (C10: List initialization)
                    columns = [
                        'ICAO24', 'Callsign', 'Origin', 'TimePos',
                        'LastContact', 'Long', 'Lat', 'Alt',
                        'OnGround', 'Speed', 'Heading', 'VertRate',
                        'Sensors', 'GeoAlt', 'Squawk', 'SPI', 'Source'
                    ]

                    # Create DataFrame (C11: Using external libraries)
                    flightDf = pd.DataFrame(data['states'])
                    flightDf = flightDf.iloc[:, 0:17]  # First 17 columns
                    flightDf.columns = columns
                    flightDf = flightDf.fillna('No Data')
                    
                    # print(f"DEBUG: Flight count = {len(flightDf)}")

                    # Format timestamps (C8: Repetition through iteration)
                    for col in ['TimePos', 'LastContact']:
                        if col in flightDf.columns:
                            flightDf[col] = pd.to_numeric(
                                flightDf[col], errors='coerce')
                            flightDf[col] = flightDf[col].apply(
                                self.formatTimestamp)

                    # Format boolean column
                    # Convert boolean to string with lambda function
                    flightDf['OnGround'] = flightDf['OnGround'].apply(
                        lambda x: 'Yes' if x else 'No')

                    # Save to CSV (P3: File maintenance)
                    flightDf.to_csv('FlightScope.csv', index=False)
                    # Note: might need to optimize this if file gets too big

                    # Update table (C3: Screen output)
                    model = FlightDataModel(flightDf)
                    self.tableView.setModel(model)

                    # Update status
                    self.countLabel.setText(f"Flights: {len(flightDf)}")
                    self.updateLabel.setText(f"Updated: {datetime.now().strftime('%H:%M:%S')}")
                else:
                    # No flights found
                    self.countLabel.setText("Flights: 0")
                    self.updateLabel.setText(f"Updated: {datetime.now().strftime('%H:%M:%S')}")
            else:
                # Request failed
                self.countLabel.setText("Flights: --")
                self.updateLabel.setText("Update failed")
        except Exception as e:
            # H4: Exception handling
            # print(f"Error: {str(e)}")  # removing this for now
            self.countLabel.setText("Error")
            self.updateLabel.setText("Connection error")


# Main program entry point (P1: Project structure)
if __name__ == "__main__":
    # Create the application
    app = QApplication(sys.argv)
    window = FlightScopeApp()
    window.show()
    print("I'm burning hot")
    print("Hope this thing doesn't crash fr")
    # temp_var = "meant to delete this"
    sys.exit(app.exec())
