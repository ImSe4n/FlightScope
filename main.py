"""
Name: FlightScope
Course Code: ICS3U-01
Author: Sean Nie
Description: This program is a basic flight tracker that allows users to input flight information, including departure and arrival airports, flight number, and date.
History:
2025-04-29      Version 1 (display table of flight information)
2025-04-29      Version 2 (added GUI for displaying flight data using PyQt6)
"""
# ----- Imports -----
import sys
import requests
import json
import pandas as pd
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QHBoxLayout, QPushButton, QLabel, QTableView, 
                            QHeaderView, QFrame, QMessageBox)
from PyQt6.QtCore import Qt, QTimer, QAbstractTableModel
from PyQt6.QtGui import QFont, QColor
from datetime import datetime
import time

# ----- Constants -----
LONGMIN, LATMIN = -180, -90
LONGMAX, LATMAX = 180, 90
BG_COLOR = "#f0f0f0"
HEADER_COLOR = "#4a7abc"
BUTTON_COLOR = "#3a5795"
REFRESH_TIME = 60000  # Refresh every 60 seconds

class PandasModel(QAbstractTableModel):
    """Model for pandas DataFrame to be displayed in QTableView"""
    def __init__(self, data):
        super().__init__()
        self._data = data

    def rowCount(self, parent=None):
        return self._data.shape[0]

    def columnCount(self, parent=None):
        return self._data.shape[1]

    def data(self, index, role=Qt.ItemDataRole.DisplayRole):
        if index.isValid():
            if role == Qt.ItemDataRole.DisplayRole:
                return str(self._data.iloc[index.row(), index.column()])
            if role == Qt.ItemDataRole.TextAlignmentRole:
                return Qt.AlignmentFlag.AlignCenter
        return None

    def headerData(self, section, orientation, role):
        if orientation == Qt.Orientation.Horizontal and role == Qt.ItemDataRole.DisplayRole:
            return str(self._data.columns[section]).replace('_', ' ').title()
        if orientation == Qt.Orientation.Vertical and role == Qt.ItemDataRole.DisplayRole:
            return str(section + 1)
        return None

class FlightScopeApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("✈️ FlightScope - Flight Tracking System")
        self.setGeometry(100, 100, 1200, 700)
        self.setStyleSheet(f"background-color: {BG_COLOR};")
        
        self.username = ''  # Replace with your actual username
        self.password = ''  # Replace with your actual password
        
        self.setup_ui()
        self.setup_timer()
        self.fetch_flight_data()
    
    def setup_ui(self):
        # Main central widget
        central_widget = QWidget()
        main_layout = QVBoxLayout(central_widget)
        
        # Header
        header_frame = QFrame()
        header_frame.setStyleSheet(f"background-color: {HEADER_COLOR}; border-radius: 5px;")
        header_layout = QVBoxLayout(header_frame)
        
        title_label = QLabel("FlightScope - Flight Tracking System")
        title_label.setFont(QFont("Arial", 18, QFont.Weight.Bold))
        title_label.setStyleSheet("color: white;")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        header_layout.addWidget(title_label)
        
        main_layout.addWidget(header_frame)
        
        # Controls
        control_frame = QFrame()
        control_layout = QHBoxLayout(control_frame)
        
        self.refresh_button = QPushButton("Refresh Data")
        self.refresh_button.setStyleSheet(f"background-color: {BUTTON_COLOR}; color: white; padding: 8px; font-size: 12px; border-radius: 4px;")
        self.refresh_button.clicked.connect(self.fetch_flight_data)
        control_layout.addWidget(self.refresh_button)
        
        self.status_label = QLabel("Ready")
        self.status_label.setFont(QFont("Arial", 12))
        control_layout.addStretch()
        control_layout.addWidget(self.status_label)
        
        main_layout.addWidget(control_frame)
        
        # Table view
        self.table_view = QTableView()
        self.table_view.setStyleSheet("QTableView { border: 1px solid #d0d0d0; alternate-background-color: #e9e9e9; }"
                                     "QHeaderView::section { background-color: #dcdcdc; padding: 4px; }")
        self.table_view.setAlternatingRowColors(True)
        self.table_view.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table_view.verticalHeader().setVisible(True)
        self.table_view.setSortingEnabled(True)
        
        main_layout.addWidget(self.table_view)
        
        # Status bar
        status_frame = QFrame()
        status_frame.setStyleSheet(f"background-color: {HEADER_COLOR}; border-radius: 5px;")
        status_layout = QHBoxLayout(status_frame)
        
        self.flights_count_label = QLabel("Total flights: 0")
        self.flights_count_label.setStyleSheet("color: white;")
        self.flights_count_label.setFont(QFont("Arial", 12))
        status_layout.addWidget(self.flights_count_label)
        
        status_layout.addStretch()
        
        self.last_update_label = QLabel("Last updated: Never")
        self.last_update_label.setStyleSheet("color: white;")
        self.last_update_label.setFont(QFont("Arial", 12))
        status_layout.addWidget(self.last_update_label)
        
        main_layout.addWidget(status_frame)
        
        # Set central widget
        self.setCentralWidget(central_widget)
        
    def setup_timer(self):
        # Create timer for auto-refresh
        self.timer = QTimer(self)
        self.timer.setInterval(REFRESH_TIME)  # 60 seconds
        self.timer.timeout.connect(self.fetch_flight_data)
        self.timer.start()
    
    def fetch_flight_data(self):
        self.status_label.setText("Fetching data...")
        QApplication.processEvents()
        
        urlData = f'https://{self.username}:{self.password}@opensky-network.org/api/states/all?' + \
            f'lamin={LATMIN}&lomin={LONGMIN}&lamax={LATMAX}&lomax={LONGMAX}'
        
        try:
            response = requests.get(urlData)
            if response.status_code == 200:
                response_data = response.json()
                
                if 'states' in response_data and response_data['states']:
                    # Create DataFrame
                    columns = ['icao24', 'callsign', 'origin_country', 'time_position', 'last_contact',
                            'long', 'lat', 'baro_altitude', 'on_ground', 'velocity', 
                            'true_track', 'vertical_rate', 'sensors', 'geo_altitude', 
                            'squawk', 'spi', 'position_source']
                    
                    flightDf = pd.DataFrame(response_data['states'])
                    flightDf = flightDf.iloc[:, 0:17]  # First 17 columns
                    flightDf.columns = columns
                    flightDf = flightDf.fillna('No Data')
                    
                    # Format timestamp columns
                    if 'time_position' in flightDf.columns:
                        flightDf['time_position'] = pd.to_numeric(flightDf['time_position'], errors='coerce')
                        flightDf['time_position'] = flightDf['time_position'].apply(
                            lambda x: datetime.fromtimestamp(x).strftime('%Y-%m-%d %H:%M:%S') if pd.notna(x) and x != 'No Data' else 'No Data'
                        )
                    
                    if 'last_contact' in flightDf.columns:
                        flightDf['last_contact'] = pd.to_numeric(flightDf['last_contact'], errors='coerce')
                        flightDf['last_contact'] = flightDf['last_contact'].apply(
                            lambda x: datetime.fromtimestamp(x).strftime('%Y-%m-%d %H:%M:%S') if pd.notna(x) and x != 'No Data' else 'No Data'
                        )
                    
                    # Save to CSV
                    flightDf.to_csv('FlightScope.csv', index=False)
                    
                    # Update table model
                    model = PandasModel(flightDf)
                    self.table_view.setModel(model)
                    
                    # Update status information
                    total_flights = len(flightDf)
                    self.flights_count_label.setText(f"Total flights detected: {total_flights}")
                    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    self.last_update_label.setText(f"Last updated: {current_time}")
                    self.status_label.setText("Data loaded successfully")
                else:
                    self.status_label.setText("No flight data available")
                    if 'states' not in response_data:
                        QMessageBox.information(
                            self, 
                            "API Response", 
                            f"'states' key not found in the response.\nKeys: {response_data.keys()}"
                        )
            else:
                self.status_label.setText(f"Error: API request failed (Code {response.status_code})")
                QMessageBox.critical(
                    self, 
                    "API Error", 
                    f"Status code: {response.status_code}\nResponse: {response.text}"
                )
        except Exception as e:
            self.status_label.setText(f"Error occurred")
            QMessageBox.critical(self, "Error", f"An error occurred: {str(e)}")

# ----- Main Program -----
if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle('Fusion')  # Use Fusion style for a modern look
    window = FlightScopeApp()
    window.show()
    sys.exit(app.exec())
