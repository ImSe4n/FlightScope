import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { REFRESH_MS } from '../utils/constants'

// Module-level caches — survive component unmount/remount so re-clicking the
// same flight is instant instead of re-fetching on every open.
const _routeCache   = new Map()  // callsign -> { data, ts }
const _historyCache = new Map()  // icao24   -> { data, ts }
const _acInfoCache  = new Map()  // icao24   -> data (no expiry — registration is static)
const _statusCache  = new Map()  // callsign -> { data, ts }
const _ROUTE_MS   = 86_400_000   // 24 h
const _HISTORY_MS =    300_000   // 5 min (matches backend TTL)
const _STATUS_MS  =    120_000   // 2 min

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

// Dead-reckons a single flight — lightweight, used for the selected-flight marker only.
export function useDrFlight(flight) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!flight) return
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [flight])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!flight) return null
    const dt = flight.timePos != null
      ? Math.min(Math.max(0, Date.now() / 1000 - flight.timePos), _MAX_DT)
      : 0
    return _drOne(flight, dt)
  }, [flight, tick])
}

export function useAirports() {
  const [airports, setAirports] = useState([])

  useEffect(() => {
    let cancelled = false
    let delay = 2000

    const attempt = () => {
      fetch('/api/airports')
        .then(r => r.json())
        .then(d => {
          if (cancelled) return
          if (d.airports?.length > 0) {
            setAirports(d.airports)
          } else {
            // Empty response — backend CSV may still be loading; retry
            setTimeout(attempt, delay)
            delay = Math.min(delay * 2, 30_000)
          }
        })
        .catch(() => {
          if (!cancelled) { setTimeout(attempt, delay); delay = Math.min(delay * 2, 30_000) }
        })
    }

    attempt()
    return () => { cancelled = true }
  }, [])

  return airports
}

export function useTrack(icao24) {
  const [track, setTrack]          = useState(null)
  const [trackLoading, setLoading] = useState(false)

  useEffect(() => {
    if (!icao24) { setTrack(null); return }

    let cancelled = false
    const doFetch = (showLoading = false) => {
      if (showLoading) setLoading(true)
      fetch(`/api/track/${icao24}`)
        .then(r => r.json())
        .then(data => { if (!cancelled) { setTrack(data.path ?? null); setLoading(false) } })
        .catch(() => { if (!cancelled) setLoading(false) })
    }

    doFetch(true)
    // Re-fetch every 60 s so the coloured path keeps growing as the aircraft flies
    const id = setInterval(() => doFetch(false), 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [icao24])

  return { track, trackLoading }
}

// Fetches aircraft registration / type / operator from hexdb.io (via backend proxy)
export function useAircraftInfo(icao24) {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!icao24) { setInfo(null); return }
    if (_acInfoCache.has(icao24)) { setInfo(_acInfoCache.get(icao24)); return }
    fetch(`/api/aircraft/${icao24}`)
      .then(r => r.json())
      .then(d => {
        const v = d && Object.keys(d).length > 0 ? d : null
        _acInfoCache.set(icao24, v)
        setInfo(v)
      })
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
    const hit = _routeCache.get(cs)
    if (hit && Date.now() - hit.ts < _ROUTE_MS) { setRoute(hit.data); return }
    fetch(`/api/route/${cs}`)
      .then(r => r.json())
      .then(d => {
        const data = d && d.route?.length >= 2 ? d : null
        _routeCache.set(cs, { data, ts: Date.now() })
        setRoute(data)
      })
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
    const hit = _statusCache.get(cs)
    if (hit && Date.now() - hit.ts < _STATUS_MS) { setStatus(hit.data); return }
    fetch(`/api/flight-status/${cs}`)
      .then(r => r.json())
      .then(d => {
        const data = d && !d.error && Object.keys(d).length > 0 ? d : null
        _statusCache.set(cs, { data, ts: Date.now() })
        setStatus(data)
      })
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
