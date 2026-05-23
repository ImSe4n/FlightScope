import { useState, useEffect, useCallback } from 'react'
import { useAppAuth } from '../context/AuthContext'

export function useUserData() {
  const { isAuthenticated, getToken } = useAppAuth()

  const [savedFlights,  setSavedFlights]  = useState([])
  const [savedAirports, setSavedAirports] = useState([])
  const [savedRoutes,   setSavedRoutes]   = useState([])
  const [settings,      setSettings]      = useState({})

  const authFetch = useCallback(async (path, opts = {}) => {
    const token = await getToken()
    const res = await fetch(path, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
    })
    if (!res.ok) throw new Error(`${path} → ${res.status}`)
    return res.json()
  }, [getToken])

  useEffect(() => {
    if (!isAuthenticated) {
      setSavedFlights([])
      setSavedAirports([])
      setSavedRoutes([])
      setSettings({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [flights, airports, routes, s] = await Promise.all([
          authFetch('/api/user/saved-flights'),
          authFetch('/api/user/saved-airports'),
          authFetch('/api/user/saved-routes'),
          authFetch('/api/user/settings'),
        ])
        if (cancelled) return
        setSavedFlights(flights)
        setSavedAirports(airports)
        setSavedRoutes(routes)
        setSettings(s)
      } catch (e) {
        console.error('[useUserData] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [isAuthenticated])  // authFetch is stable

  // ── Flights ────────────────────────────────────────────────────────────────
  const saveFlight = useCallback(async (flight) => {
    await authFetch('/api/user/saved-flights', {
      method: 'POST',
      body: JSON.stringify({ icao24: flight.icao24, callsign: flight.callsign?.trim() || null }),
    })
    setSavedFlights(prev =>
      prev.find(f => f.icao24 === flight.icao24.toLowerCase())
        ? prev
        : [{ icao24: flight.icao24.toLowerCase(), callsign: flight.callsign?.trim() || null, saved_at: Date.now() / 1000 }, ...prev]
    )
  }, [authFetch])

  const unsaveFlight = useCallback(async (icao24) => {
    await authFetch(`/api/user/saved-flights/${icao24}`, { method: 'DELETE' })
    setSavedFlights(prev => prev.filter(f => f.icao24 !== icao24.toLowerCase()))
  }, [authFetch])

  // ── Airports ───────────────────────────────────────────────────────────────
  const saveAirport = useCallback(async (airport) => {
    await authFetch('/api/user/saved-airports', {
      method: 'POST',
      body: JSON.stringify(airport),
    })
    setSavedAirports(prev =>
      prev.find(a => a.ident === airport.ident)
        ? prev
        : [{ ...airport, saved_at: Date.now() / 1000 }, ...prev]
    )
  }, [authFetch])

  const unsaveAirport = useCallback(async (ident) => {
    await authFetch(`/api/user/saved-airports/${ident}`, { method: 'DELETE' })
    setSavedAirports(prev => prev.filter(a => a.ident !== ident))
  }, [authFetch])

  // ── Routes ─────────────────────────────────────────────────────────────────
  const saveRoute = useCallback(async (dep, arr) => {
    dep = dep.toUpperCase(); arr = arr.toUpperCase()
    await authFetch('/api/user/saved-routes', {
      method: 'POST',
      body: JSON.stringify({ dep, arr }),
    })
    setSavedRoutes(prev =>
      prev.find(r => r.dep === dep && r.arr === arr)
        ? prev
        : [{ dep, arr, label: `${dep}→${arr}`, saved_at: Date.now() / 1000 }, ...prev]
    )
  }, [authFetch])

  const unsaveRoute = useCallback(async (dep, arr) => {
    dep = dep.toUpperCase(); arr = arr.toUpperCase()
    await authFetch(`/api/user/saved-routes/${dep}/${arr}`, { method: 'DELETE' })
    setSavedRoutes(prev => prev.filter(r => !(r.dep === dep && r.arr === arr)))
  }, [authFetch])

  // ── Settings ───────────────────────────────────────────────────────────────
  const saveSettings = useCallback(async (s) => {
    await authFetch('/api/user/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings: s }),
    })
    setSettings(s)
  }, [authFetch])

  return {
    savedFlights, savedAirports, savedRoutes, settings,
    saveFlight,   unsaveFlight,
    saveAirport,  unsaveAirport,
    saveRoute,    unsaveRoute,
    saveSettings,
  }
}
