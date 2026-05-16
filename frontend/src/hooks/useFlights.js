import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { REFRESH_MS } from '../utils/constants'

export function useFlights() {
  const [flights, setFlights]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/flights')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setFlights(data.flights ?? [])
        setUpdatedAt(new Date().toLocaleTimeString())
      }
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  return { flights, loading, error, updatedAt, refresh }
}

// ── Dead-reckoning helpers ─────────────────────────────────────────────────────
const _R      = 6_371_000   // Earth radius, metres
const _MAX_DT = 300         // cap extrapolation at 5 minutes
const _TRANS  = 2_000       // blend duration (ms) when fresh API data arrives

// Dead-reckon a single flight by `dt` seconds.
function _drOne(f, dt) {
  if (f.onGround || !f.speed || f.heading == null || f.lat == null) return f
  const s     = Math.min(dt, _MAX_DT) * f.speed          // metres travelled
  const hdRad = f.heading * (Math.PI / 180)
  const dLat  = (s * Math.cos(hdRad)) / _R               // radians
  const dLon  = (s * Math.sin(hdRad)) / (_R * Math.cos(f.lat * (Math.PI / 180)))
  const newAlt = f.alt != null && f.vertRate != null
    ? Math.max(0, f.alt + f.vertRate * Math.min(dt, _MAX_DT))
    : f.alt
  return {
    ...f,
    lat: f.lat + dLat * (180 / Math.PI),
    lon: f.lon + dLon * (180 / Math.PI),
    alt: newAlt,
  }
}

// Quadratic ease-out so the transition from old→new feels natural.
function _easeOut(t) { return 1 - (1 - t) ** 2 }

/**
 * Returns a version of `flights` with positions smoothly interpolated every
 * 500 ms.  When fresh API data arrives, apparent positions (already DR'd) are
 * used as the blend-from point so there is no visible jump.
 */
export function useDeadReckonedFlights(flights) {
  // Ref holds the single source of truth; mutation is safe because useMemo
  // below reads it on every tick.
  const sRef = useRef({
    base:      flights,
    baseAt:    Date.now(),
    transFrom: null,   // Map<icao24, {lat,lon,alt}> — positions at blend start
    transAt:   null,
  })
  const [tick, setTick] = useState(0)

  // When fresh API data arrives, snapshot current apparent positions as the
  // blend-from state so the transition is seamless.
  useEffect(() => {
    const now = Date.now()
    const { base, baseAt, transFrom, transAt } = sRef.current
    const dt = (now - baseAt) / 1000

    const snap = new Map()
    for (const f of base) {
      const dr = _drOne(f, dt)
      if (transFrom && transAt) {
        const e = Math.min((now - transAt) / _TRANS, 1)
        const p = transFrom.get(f.icao24)
        if (p && e < 1) {
          snap.set(f.icao24, {
            lat: p.lat + (dr.lat - p.lat) * e,
            lon: p.lon + (dr.lon - p.lon) * e,
            alt: p.alt != null && dr.alt != null ? p.alt + (dr.alt - p.alt) * e : dr.alt,
          })
          continue
        }
      }
      snap.set(f.icao24, { lat: dr.lat, lon: dr.lon, alt: dr.alt })
    }

    sRef.current = { base: flights, baseAt: now, transFrom: snap, transAt: now }
    setTick(t => t + 1)
  }, [flights])

  // 500 ms animation tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const now = Date.now()
    const { base, baseAt, transFrom, transAt } = sRef.current
    const dt = (now - baseAt) / 1000

    return base.map(f => {
      const dr = _drOne(f, dt)
      if (transFrom && transAt) {
        const elapsed = (now - transAt) / _TRANS
        if (elapsed < 1) {
          const p = transFrom.get(f.icao24)
          if (p) {
            const t = _easeOut(elapsed)
            return {
              ...dr,
              lat: p.lat + (dr.lat - p.lat) * t,
              lon: p.lon + (dr.lon - p.lon) * t,
              alt: p.alt != null && dr.alt != null ? p.alt + (dr.alt - p.alt) * t : dr.alt,
            }
          }
        }
      }
      return dr
    })
  }, [tick])
}

export function useAirports() {
  const [airports, setAirports] = useState([])

  useEffect(() => {
    fetch('/api/airports')
      .then(r => r.json())
      .then(d => setAirports(d.airports ?? []))
      .catch(() => {})
  }, [])

  return airports
}

export function useTrack(icao24) {
  const [track, setTrack]           = useState(null)
  const [trackLoading, setLoading]  = useState(false)

  useEffect(() => {
    if (!icao24) { setTrack(null); return }
    setLoading(true)
    fetch(`/api/track/${icao24}`)
      .then(r => r.json())
      .then(data => { setTrack(data.path ?? null); setLoading(false) })
      .catch(() => { setTrack(null); setLoading(false) })
  }, [icao24])

  return { track, trackLoading }
}

// Fetches aircraft registration / type / operator from hexdb.io (via backend proxy)
export function useAircraftInfo(icao24) {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!icao24) { setInfo(null); return }
    fetch(`/api/aircraft/${icao24}`)
      .then(r => r.json())
      .then(d => setInfo(d && Object.keys(d).length > 0 ? d : null))
      .catch(() => setInfo(null))
  }, [icao24])

  return info
}

// Fetches scheduled route (FROM → TO airports) from OpenSky callsign DB
export function useRoute(callsign) {
  const [route, setRoute] = useState(null)

  useEffect(() => {
    const cs = callsign?.trim()
    if (!cs) { setRoute(null); return }
    fetch(`/api/route/${cs}`)
      .then(r => r.json())
      .then(d => setRoute(d && d.route?.length >= 2 ? d : null))
      .catch(() => setRoute(null))
  }, [callsign])

  return route
}

// Fetches gate, terminal, and live status from AeroDataBox (requires AERODATABOX_KEY in .env)
export function useFlightStatus(callsign) {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    const cs = callsign?.trim()
    if (!cs) { setStatus(null); return }
    fetch(`/api/flight-status/${cs}`)
      .then(r => r.json())
      .then(d => setStatus(d && !d.error && Object.keys(d).length > 0 ? d : null))
      .catch(() => setStatus(null))
  }, [callsign])

  return status
}

// Lazily loads departures + arrivals for an airport; call load() to trigger.
export function useAirportFlights(ident) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const triggered = useRef(false)

  const load = useCallback(() => {
    if (!ident || triggered.current) return
    triggered.current = true
    setLoading(true)
    fetch(`/api/airport-flights/${ident}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ident])

  return { data, loading, load }
}

// Fetches actual departure/arrival info from the last 24 h of OpenSky flight records
export function useFlightHistory(icao24) {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    if (!icao24) { setHistory(null); return }
    fetch(`/api/flight-history/${icao24}`)
      .then(r => r.json())
      .then(d => setHistory(d?.latest ? d : null))
      .catch(() => setHistory(null))
  }, [icao24])

  return history
}
