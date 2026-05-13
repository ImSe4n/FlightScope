import { useState, useEffect, useCallback } from 'react'
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
  const [track, setTrack]   = useState(null)
  const [trackLoading, setTrackLoading] = useState(false)

  useEffect(() => {
    if (!icao24) { setTrack(null); return }
    setTrackLoading(true)
    fetch(`/api/track/${icao24}`)
      .then(r => r.json())
      .then(data => {
        setTrack(data.path ?? null) // [[time, lat, lon, baro_alt, heading, on_ground], ...]
        setTrackLoading(false)
      })
      .catch(() => { setTrack(null); setTrackLoading(false) })
  }, [icao24])

  return { track, trackLoading }
}
