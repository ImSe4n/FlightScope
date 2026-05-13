import L from 'leaflet'
import { EMERGENCY_SQUAWKS } from './constants'

// Cache plane icons by heading bucket (nearest 10°) — avoids creating 8000+ objects per render
const _planeCache = {}
export function makePlaneIcon(heading) {
  const bucket = Math.round((heading ?? 0) / 10) * 10
  if (!_planeCache[bucket]) {
    _planeCache[bucket] = L.divIcon({
      html: `<span class="plane-icon" style="--r:${bucket - 90}deg">✈</span>`,
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -13],
    })
  }
  return _planeCache[bucket]
}

// Emergency flights get a colored, pulsing icon
export function makeEmergencyIcon(heading, squawk) {
  const info = EMERGENCY_SQUAWKS[String(squawk)] ?? { color: '#e53935' }
  const deg = (heading ?? 0) - 90
  return L.divIcon({
    html: `<span class="plane-icon plane-icon--emergency" style="--r:${deg}deg;--ec:${info.color}">✈</span>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  })
}

// Selected flight gets an orange pulsing icon (not cached — created once per selection)
export function makeSelectedIcon(heading) {
  return L.divIcon({
    html: `<span class="plane-icon plane-icon--sel" style="--r:${(heading ?? 0) - 90}deg">✈</span>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

export const AIRPORT_ICON = L.divIcon({
  html: '<span class="airport-icon">🛫</span>',
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
})
