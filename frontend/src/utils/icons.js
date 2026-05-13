import L from 'leaflet'
import { EMERGENCY_SQUAWKS } from './constants'

// Altitude → colour band (matches ATC convention roughly)
export function altBucket(alt) {
  if (alt == null || alt < 0) return 0
  if (alt < 1500)   return 1   // low
  if (alt < 6000)   return 2   // mid
  if (alt < 11000)  return 3   // high
  return 4                      // very high
}

function altColor(alt) {
  const b = altBucket(alt)
  return ['#7c93af', '#4ade80', '#38bdf8', '#a78bfa', '#f0f4f8'][b]
}

// Cache keyed by heading-bucket (10°) × altitude-bucket (5) = max 180 entries
const _cache = {}
export function makePlaneIcon(heading, alt) {
  const hb  = Math.round((heading ?? 0) / 10) * 10
  const ab  = altBucket(alt)
  const key = `${hb}_${ab}`
  if (!_cache[key]) {
    const col = altColor(alt)
    _cache[key] = L.divIcon({
      html: `<span class="plane-icon" style="--r:${hb - 90}deg;color:${col}">✈</span>`,
      className: '',
      iconSize:   [20, 20],
      iconAnchor: [10, 10],
      popupAnchor:[0, -12],
    })
  }
  return _cache[key]
}

export function makeEmergencyIcon(heading, squawk) {
  const info = EMERGENCY_SQUAWKS[String(squawk)] ?? { color: '#f87171' }
  const deg  = (heading ?? 0) - 90
  return L.divIcon({
    html: `<span class="plane-icon plane-icon--emergency" style="--r:${deg}deg;--ec:${info.color}">✈</span>`,
    className: '',
    iconSize:   [24, 24],
    iconAnchor: [12, 12],
  })
}

export function makeSelectedIcon(heading) {
  return L.divIcon({
    html: `<span class="plane-icon plane-icon--sel" style="--r:${(heading ?? 0) - 90}deg">✈</span>`,
    className: '',
    iconSize:   [26, 26],
    iconAnchor: [13, 13],
  })
}

export const AIRPORT_ICON = L.divIcon({
  html: '<span class="airport-icon">🛬</span>',
  className: '',
  iconSize:   [24, 24],
  iconAnchor: [12, 14],
  popupAnchor:[0, -16],
})
