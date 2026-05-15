import { useState, useEffect, useCallback, useRef } from 'react'
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

// Dead-reckoning: smoothly interpolate aircraft positions between API updates.
// Runs every 500 ms; resets whenever fresh API data arrives.
export function useDeadReckonedFlights(flights) {
  const baseRef = useRef({ flights, at: Date.now() })
  const [interpolated, setInterpolated] = useState(flights)

  // New API snapshot → reset base position and immediately show it
  useEffect(() => {
    baseRef.current = { flights, at: Date.now() }
    setInterpolated(flights)
  }, [flights])

  useEffect(() => {
    const id = setInterval(() => {
      const { flights: base, at } = baseRef.current
      const dt = (Date.now() - at) / 1000  // seconds since last real update

      setInterpolated(base.map(f => {
        if (f.onGround || !f.speed || f.heading == null || f.lat == null) return f
        const hdRad = f.heading * (Math.PI / 180)
        const dist  = f.speed * dt   // metres
        const dlat  = (dist * Math.cos(hdRad)) / 111_320
        const dlon  = (dist * Math.sin(hdRad)) / (111_320 * Math.cos(f.lat * (Math.PI / 180)))
        return { ...f, lat: f.lat + dlat, lon: f.lon + dlon }
      }))
    }, 500)
    return () => clearInterval(id)
  }, [])

  return interpolated
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
