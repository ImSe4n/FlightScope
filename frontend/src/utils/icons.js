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
// Draw order: tail stabs → wings → [rear engine pods] → fuselage → [underwing engines]

const _SVG = {
  // 4-engine heavy (A380 / B747): massive wings, 4 pods, wide fuselage
  heavy4: `<svg width="40" height="34" viewBox="-20 -17 40 34" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-13,-2.5 L-17,-9 L-19,-9 L-15,2.5Z"/>
    <path d="M-13,2.5 L-17,9 L-19,9 L-15,-2.5Z"/>
    <path d="M6,0 L-1,-16 L-9,-16 L0,0Z"/>
    <path d="M6,0 L-1,16 L-9,16 L0,0Z"/>
    <ellipse cx="0" cy="0" rx="18" ry="4"/>
    <ellipse cx="1" cy="-7" rx="4.5" ry="1.6"/>
    <ellipse cx="1" cy="7" rx="4.5" ry="1.6"/>
    <ellipse cx="-1" cy="-11.5" rx="4" ry="1.4"/>
    <ellipse cx="-1" cy="11.5" rx="4" ry="1.4"/>
  </svg>`,

  // Wide-body twin (B777 / B787 / A330 / A350): long swept wings, 2 large engines
  widebody: `<svg width="34" height="28" viewBox="-17 -14 34 28" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-12,-1.8 L-16,-8 L-17,-8 L-13.5,1.8Z"/>
    <path d="M-12,1.8 L-16,8 L-17,8 L-13.5,-1.8Z"/>
    <path d="M5,0 L-3,-13 L-8,-13 L-1,0Z"/>
    <path d="M5,0 L-3,13 L-8,13 L-1,0Z"/>
    <ellipse cx="0" cy="0" rx="15" ry="3"/>
    <ellipse cx="-1.5" cy="-8.5" rx="4" ry="1.5"/>
    <ellipse cx="-1.5" cy="8.5" rx="4" ry="1.5"/>
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

  // Regional jet (CRJ / E-jet): slim fuselage, clean wings, rear-mounted engine pods
  regional: `<svg width="26" height="18" viewBox="-13 -9 26 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-9,-0.8 L-12,-5 L-13,-5 L-10,0.8Z"/>
    <path d="M-9,0.8 L-12,5 L-13,5 L-10,-0.8Z"/>
    <path d="M3,0 L-1,-8 L-4,-8 L-1,0Z"/>
    <path d="M3,0 L-1,8 L-4,8 L-1,0Z"/>
    <ellipse cx="-7.5" cy="-3" rx="3" ry="1.2"/>
    <ellipse cx="-7.5" cy="3" rx="3" ry="1.2"/>
    <ellipse cx="0" cy="0" rx="11" ry="1.9"/>
  </svg>`,

  // Turboprop (ATR-72 / Dash-8): nearly straight wings, fat nacelles, T-tail
  turboprop: `<svg width="24" height="20" viewBox="-12 -10 24 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-8,-0.8 L-10.5,-5 L-11,-5 L-9,0.8Z"/>
    <path d="M-8,0.8 L-10.5,5 L-11,5 L-9,-0.8Z"/>
    <path d="M2,0 L0,-9 L-3,-9 L-1,0Z"/>
    <path d="M2,0 L0,9 L-3,9 L-1,0Z"/>
    <ellipse cx="0" cy="0" rx="9.5" ry="1.8"/>
    <ellipse cx="0" cy="-5.5" rx="3" ry="1.6"/>
    <ellipse cx="0" cy="5.5" rx="3" ry="1.6"/>
  </svg>`,

  // Business jet (Gulfstream / Learjet): highly swept wings, rear engine pods, slim
  bizjet: `<svg width="24" height="16" viewBox="-12 -8 24 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M-9,-0.5 L-11,-5.5 L-11.5,-5.5 L-10,0.5Z"/>
    <path d="M-9,0.5 L-11,5.5 L-11.5,5.5 L-10,-0.5Z"/>
    <path d="M4,0 L-3,-7 L-6,-7 L-1,0Z"/>
    <path d="M4,0 L-3,7 L-6,7 L-1,0Z"/>
    <ellipse cx="-7.5" cy="-2.5" rx="2.5" ry="1"/>
    <ellipse cx="-7.5" cy="2.5" rx="2.5" ry="1"/>
    <ellipse cx="0" cy="0" rx="10" ry="1.5"/>
  </svg>`,
}

const _SIZE = {
  heavy4:     { iconSize: [40, 34], iconAnchor: [20, 17] },
  widebody:   { iconSize: [34, 28], iconAnchor: [17, 14] },
  narrowbody: { iconSize: [28, 22], iconAnchor: [14, 11] },
  regional:   { iconSize: [26, 18], iconAnchor: [13, 9]  },
  turboprop:  { iconSize: [24, 20], iconAnchor: [12, 10] },
  bizjet:     { iconSize: [24, 16], iconAnchor: [12, 8]  },
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
