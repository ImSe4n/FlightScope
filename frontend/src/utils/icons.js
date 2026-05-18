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

export function altColor(alt) {
  const b = altBucket(alt)
  return ['#7c93af', '#4ade80', '#38bdf8', '#a78bfa', '#f0f4f8'][b]
}

// ── Aircraft silhouette SVGs ──────────────────────────────────────────────────
// All icons point RIGHT (→) by default, matching the ✈ emoji, so existing
// heading rotation (hb - 90) still works identically.
// Coordinate system: nose at +x, wings at ±y, tail at -x.

const _SVG = {
  // 4-engine heavy (A380 / 747): extra-wide wings, 4 engine pods
  heavy4: `<svg width="28" height="18" viewBox="-16 -9 32 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="0" cy="0" rx="13" ry="2.4"/>
    <path d="M0-2.4L-14-9L-16-9L-4 2.4Z"/>
    <path d="M0 2.4L-14 9L-16 9L-4-2.4Z"/>
    <ellipse cx="-5.5" cy="-6.5" rx="2.6" ry="1.1"/>
    <ellipse cx="-9.5" cy="-7.8" rx="2.2" ry="1"/>
    <ellipse cx="-5.5" cy="6.5" rx="2.6" ry="1.1"/>
    <ellipse cx="-9.5" cy="7.8" rx="2.2" ry="1"/>
    <path d="M-12-2.4L-15.5-5.5L-16-5.5L-13 2.4Z"/>
    <path d="M-12 2.4L-15.5 5.5L-16 5.5L-13-2.4Z"/>
  </svg>`,

  // Wide-body twin (777 / A330 / 787 / A350): wide wings, 2 large engines
  widebody: `<svg width="24" height="15" viewBox="-14 -7.5 28 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="0" cy="0" rx="12" ry="2"/>
    <path d="M0-2L-12-7.5L-14-7.5L-4 2Z"/>
    <path d="M0 2L-12 7.5L-14 7.5L-4-2Z"/>
    <ellipse cx="-8" cy="-5.8" rx="2.8" ry="1.2"/>
    <ellipse cx="-8" cy="5.8" rx="2.8" ry="1.2"/>
    <path d="M-11-2L-14-4.8L-14.5-4.8L-12 2Z"/>
    <path d="M-11 2L-14 4.8L-14.5 4.8L-12-2Z"/>
  </svg>`,

  // Narrow-body (737 / A320): standard swept wings, 2 engines
  narrowbody: `<svg width="20" height="13" viewBox="-13 -6.5 26 13" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="0" cy="0" rx="11" ry="1.8"/>
    <path d="M0-1.8L-10-6.5L-12-6.5L-3 1.8Z"/>
    <path d="M0 1.8L-10 6.5L-12 6.5L-3-1.8Z"/>
    <ellipse cx="-7" cy="-5" rx="2.3" ry="1"/>
    <ellipse cx="-7" cy="5" rx="2.3" ry="1"/>
    <path d="M-9-1.8L-12-4L-13-4L-10 1.8Z"/>
    <path d="M-9 1.8L-12 4L-13 4L-10-1.8Z"/>
  </svg>`,

  // Regional jet / turboprop (CRJ / E-jets / ATR): slim, shorter wingspan
  regional: `<svg width="16" height="10" viewBox="-11 -5 22 10" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="0" cy="0" rx="9" ry="1.5"/>
    <path d="M0-1.5L-8-5L-10-5L-3 1.5Z"/>
    <path d="M0 1.5L-8 5L-10 5L-3-1.5Z"/>
    <ellipse cx="-5.5" cy="-4" rx="1.8" ry="0.85"/>
    <ellipse cx="-5.5" cy="4" rx="1.8" ry="0.85"/>
    <path d="M-7-1.5L-10-3.3L-11-3.3L-8 1.5Z"/>
    <path d="M-7 1.5L-10 3.3L-11 3.3L-8-1.5Z"/>
  </svg>`,
}

const _SIZE = {
  heavy4:     { iconSize: [28, 18], iconAnchor: [14, 9]   },
  widebody:   { iconSize: [24, 15], iconAnchor: [12, 7.5] },
  narrowbody: { iconSize: [20, 13], iconAnchor: [10, 6.5] },
  regional:   { iconSize: [16, 10], iconAnchor: [8,  5]   },
  default:    { iconSize: [20, 20], iconAnchor: [10, 10]  },
}

// Cache keyed by heading-bucket × altitude-bucket × category.
// Cleared when it exceeds 1200 entries to prevent unbounded memory growth.
const _cache    = new Map()
const _CACHE_MAX = 1200

export function makePlaneIcon(heading, alt, category = 'default') {
  const hb  = Math.round((heading ?? 0) / 10) * 10
  const ab  = altBucket(alt)
  const cat = _SVG[category] ? category : 'default'
  const key = `${hb}_${ab}_${cat}`
  if (!_cache.has(key)) {
    if (_cache.size >= _CACHE_MAX) _cache.clear()
    const col = altColor(alt)
    const deg = hb - 90

    let icon
    if (cat === 'default') {
      icon = L.divIcon({
        html:        `<span class="plane-icon" style="--r:${deg}deg;color:${col}">✈</span>`,
        className:   '',
        iconSize:    [20, 20],
        iconAnchor:  [10, 10],
        popupAnchor: [0, -12],
      })
    } else {
      const [w, h] = _SIZE[cat].iconSize
      const box    = Math.max(w, h) + 4
      icon = L.divIcon({
        html: `<span class="plane-icon plane-icon--svg" style="display:flex;align-items:center;justify-content:center;width:${box}px;height:${box}px;--r:${deg}deg;color:${col}">${_SVG[cat]}</span>`,
        className:   '',
        iconSize:    [box, box],
        iconAnchor:  [box / 2, box / 2],
        popupAnchor: [0, -(box / 2 + 4)],
      })
    }
    _cache.set(key, icon)
  }
  return _cache.get(key)
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
  html: `<svg width="12" height="17" viewBox="0 0 12 17" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 0C2.69 0 0 2.69 0 6c0 4.25 6 11 6 11s6-6.75 6-11c0-3.31-2.69-6-6-6z"
          fill="#fbbf24" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
    <circle cx="6" cy="6" r="2.2" fill="rgba(0,0,0,0.22)"/>
  </svg>`,
  className: '',
  iconSize:   [12, 17],
  iconAnchor: [6, 17],
  popupAnchor:[0, -19],
})
