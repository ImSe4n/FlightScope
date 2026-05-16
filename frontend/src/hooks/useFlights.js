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

function _drOne(f, dt) {
  if (f.onGround || !f.speed || f.heading == null || f.lat == null) return f
  const s      = Math.min(Math.max(0, dt), _MAX_DT) * f.speed
  const hdRad  = f.heading * (Math.PI / 180)
  const dLat   = (s * Math.cos(hdRad)) / _R
  const dLon   = (s * Math.sin(hdRad)) / (_R * Math.cos(f.lat * (Math.PI / 180)))
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

/**
 * Returns a smoothly-interpolated version of `flights` updated every 500 ms.
 * When fresh API data arrives, positions are immediately corrected using `timePos`
 * (the actual fix timestamp) so there is no blend-induced backwards movement.
 */
export function useDeadReckonedFlights(flights) {
  const sRef = useRef({ base: [], baseAt: Date.now() })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const nowMs  = Date.now()
    const nowSec = nowMs / 1000
    // Immediately advance each flight to "now" using its reported fix time,
    // so the starting point is already current — no backwards-blend needed.
    const corrected = flights.map(f => {
      if (f.onGround || !f.speed || f.heading == null || f.lat == null || !f.timePos) return f
      const stale = Math.max(0, Math.min(nowSec - f.timePos, _MAX_DT))
      return stale > 0 ? _drOne(f, stale) : f
    })
    sRef.current = { base: corrected, baseAt: nowMs }
    setTick(t => t + 1)
  }, [flights])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const { base, baseAt } = sRef.current
    const dt = (Date.now() - baseAt) / 1000
    return base.map(f => _drOne(f, dt))
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
