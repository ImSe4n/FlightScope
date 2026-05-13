export const REFRESH_MS = 10000

export const TILE_LAYERS = {
  dark: {
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
  },
  light: {
    label: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Source: Esri, USGS, NGA',
    subdomains: 'abc',
  },
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    subdomains: 'abc',
  },
}

// ICAO emergency squawk codes
export const EMERGENCY_SQUAWKS = {
  '7500': { label: 'Hijack',       color: '#e53935' },
  '7600': { label: 'Radio Failure', color: '#fb8c00' },
  '7700': { label: 'Emergency',    color: '#ff5722' },
}

// OpenSky positionSource field values
export const SOURCE_TYPES = {
  0: 'ADS-B',
  1: 'ASTERIX',
  2: 'MLAT',
  3: 'FLARM',
}
