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
// Top-down silhouettes, all pointing RIGHT (→). Nose at +x, tail at -x, wings ±y.
// Draw order per SVG: tail stabilizers → wings → fuselage (covers roots) → engines.

const _SVG = {
  // 4-engine heavy (B747 / A380): very wide wings, 4 engine pods
  heavy4: `<svg width="36" height="30" viewBox="-18 -15 36 30" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-12,-2 L-17,-9 L-18,-9 L-14,2Z"/>
    <path d="M-12,2 L-17,9 L-18,9 L-14,-2Z"/>
    <path d="M5,0 L-3,-14 L-9,-14 L-2,0Z"/>
    <path d="M5,0 L-3,14 L-9,14 L-2,0Z"/>
    <ellipse cx="0" cy="0" rx="16" ry="3.2"/>
    <ellipse cx="-0.5" cy="-8.5" rx="4" ry="1.4"/>
    <ellipse cx="-0.5" cy="8.5" rx="4" ry="1.4"/>
    <ellipse cx="-3" cy="-12" rx="3.5" ry="1.3"/>
    <ellipse cx="-3" cy="12" rx="3.5" ry="1.3"/>
  </svg>`,

  // Wide-body twin (B777 / A330 / B787 / A350): wide wings, 2 large engines
  widebody: `<svg width="32" height="26" viewBox="-16 -13 32 26" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-11,-1.5 L-15,-7 L-16,-7 L-12,1.5Z"/>
    <path d="M-11,1.5 L-15,7 L-16,7 L-12,-1.5Z"/>
    <path d="M4,0 L-3,-12 L-8,-12 L-2,0Z"/>
    <path d="M4,0 L-3,12 L-8,12 L-2,0Z"/>
    <ellipse cx="0" cy="0" rx="14" ry="2.8"/>
    <ellipse cx="-1.5" cy="-8.5" rx="3.5" ry="1.2"/>
    <ellipse cx="-1.5" cy="8.5" rx="3.5" ry="1.2"/>
  </svg>`,

  // Narrow-body (B737 / A320): swept wings, 2 underwing engines
  narrowbody: `<svg width="28" height="22" viewBox="-14 -11 28 22" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-9,-1.2 L-13,-5.5 L-14,-5.5 L-10,1.2Z"/>
    <path d="M-9,1.2 L-13,5.5 L-14,5.5 L-10,-1.2Z"/>
    <path d="M3,0 L-3,-10 L-7,-10 L-2,0Z"/>
    <path d="M3,0 L-3,10 L-7,10 L-2,0Z"/>
    <ellipse cx="0" cy="0" rx="12" ry="2.2"/>
    <ellipse cx="-1" cy="-7" rx="3" ry="1"/>
    <ellipse cx="-1" cy="7" rx="3" ry="1"/>
  </svg>`,

  // Regional jet (CRJ / E-jets / ATR): slim fuselage, shorter wingspan
  regional: `<svg width="22" height="18" viewBox="-11 -9 22 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-7,-0.8 L-10,-3.5 L-10.5,-3.5 L-8,0.8Z"/>
    <path d="M-7,0.8 L-10,3.5 L-10.5,3.5 L-8,-0.8Z"/>
    <path d="M2.5,0 L-2,-8 L-5.5,-8 L-1.5,0Z"/>
    <path d="M2.5,0 L-2,8 L-5.5,8 L-1.5,0Z"/>
    <ellipse cx="0" cy="0" rx="9.5" ry="1.8"/>
    <ellipse cx="-0.5" cy="-5.5" rx="2.2" ry="0.8"/>
    <ellipse cx="-0.5" cy="5.5" rx="2.2" ry="0.8"/>
  </svg>`,
}

const _SIZE = {
  heavy4:     { iconSize: [36, 30], iconAnchor: [18, 15] },
  widebody:   { iconSize: [32, 26], iconAnchor: [16, 13] },
  narrowbody: { iconSize: [28, 22], iconAnchor: [14, 11] },
  regional:   { iconSize: [22, 18], iconAnchor: [11, 9]  },
  default:    { iconSize: [20, 20], iconAnchor: [10, 10] },
}

// Cache keyed by heading-bucket × altitude-bucket × category.
// Cleared when it exceeds 1200 entries to prevent unbounded memory growth.
const _cache    = new Map()
const _CACHE_MAX = 1200

export function makePlaneIcon(heading, alt, category = 'default', callsign = '') {
  const hb  = Math.round((heading ?? 0) / 10) * 10
  const ab  = altBucket(alt)
  const cat = _SVG[category] ? category : 'default'
  const cs  = callsign || ''
  const key = `${hb}_${ab}_${cat}_${cs}`
  if (!_cache.has(key)) {
    if (_cache.size >= _CACHE_MAX) _cache.clear()
    const col   = altColor(alt)
    const deg   = hb - 90
    const label = cs ? `<span class="plane-label">${cs}</span>` : ''

    let icon
    if (cat === 'default') {
      icon = L.divIcon({
        html:        `<div class="plane-marker"><span class="plane-icon" style="--r:${deg}deg;color:${col}">✈</span>${label}</div>`,
        className:   '',
        iconSize:    [20, 20],
        iconAnchor:  [10, 10],
        popupAnchor: [0, -12],
      })
    } else {
      const [w, h] = _SIZE[cat].iconSize
      const box    = Math.max(w, h) + 4
      icon = L.divIcon({
        html: `<div class="plane-marker"><span class="plane-icon plane-icon--svg" style="display:flex;align-items:center;justify-content:center;width:${box}px;height:${box}px;--r:${deg}deg;color:${col}">${_SVG[cat]}</span>${label}</div>`,
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
