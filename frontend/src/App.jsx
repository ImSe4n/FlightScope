import { useState, useEffect, useMemo } from 'react'
import { useFlights, useAirports, useTrack } from './hooks/useFlights'
import Header   from './components/Header'
import Sidebar  from './components/Sidebar'
import MapView  from './components/MapView'
import './App.css'

const DEFAULT_FILTERS = {
  query:         '',
  hideGround:    false,
  emergencyOnly: false,
  country:       '',
  source:        '',
  minAlt:        '',
  maxAlt:        '',
  minSpeed:      '',
  maxSpeed:      '',
}

export default function App() {
  const { flights, loading, error, updatedAt, refresh } = useFlights()
  const airports = useAirports()

  const [filters, setFilters]   = useState(DEFAULT_FILTERS)
  const [selected, setSelected] = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)
  const [mapLayer, setMapLayer]   = useState('dark')

  const { track } = useTrack(selected?.icao24)

  // Keep the selected flight's data fresh after each auto-refresh
  useEffect(() => {
    if (!selected) return
    const fresh = flights.find(f => f.icao24 === selected.icao24)
    if (fresh) setSelected(fresh)
  }, [flights])                    // intentionally omit `selected` to avoid loop

  // Escape key deselects
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────

  const countries = useMemo(
    () => [...new Set(flights.map(f => f.origin).filter(Boolean))].sort(),
    [flights],
  )

  const filtered = useMemo(() => {
    let r = flights
    if (filters.hideGround)    r = r.filter(f => !f.onGround)
    if (filters.emergencyOnly) r = r.filter(f => ['7500','7600','7700'].includes(String(f.squawk)))
    if (filters.country)       r = r.filter(f => f.origin === filters.country)
    if (filters.source !== '') r = r.filter(f => f.source === Number(filters.source))
    if (filters.minAlt !== '') r = r.filter(f => f.alt   != null && f.alt   >= Number(filters.minAlt))
    if (filters.maxAlt !== '') r = r.filter(f => f.alt   != null && f.alt   <= Number(filters.maxAlt))
    if (filters.minSpeed !== '') r = r.filter(f => f.speed != null && f.speed >= Number(filters.minSpeed))
    if (filters.maxSpeed !== '') r = r.filter(f => f.speed != null && f.speed <= Number(filters.maxSpeed))
    if (filters.query.trim()) {
      const q = filters.query.trim().toLowerCase()
      r = r.filter(f =>
        f.callsign?.trim().toLowerCase().includes(q) ||
        f.icao24?.toLowerCase().includes(q) ||
        f.origin?.toLowerCase().includes(q) ||
        String(f.squawk).includes(q)
      )
    }
    return r
  }, [flights, filters])

  const emergencies = useMemo(
    () => flights.filter(f => ['7500','7600','7700'].includes(String(f.squawk))),
    [flights],
  )

  const stats = useMemo(() => ({
    total:       flights.length,
    inAir:       flights.filter(f => !f.onGround).length,
    countries:   new Set(flights.map(f => f.origin).filter(Boolean)).size,
    emergencies: emergencies.length,
  }), [flights, emergencies])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelect = f => {
    setSelected(f)
    if (f?.lat && f?.lon) setFlyTarget(f)
  }

  const updateFilter = (key, value) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  const hasFilters = Object.entries(filters).some(
    ([k, v]) => v !== '' && v !== false && !(k === 'query' && v === '')
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <Header
        query={filters.query}
        onQueryChange={v => updateFilter('query', v)}
        stats={stats}
        loading={loading}
        error={error}
        updatedAt={updatedAt}
        onRefresh={refresh}
        mapLayer={mapLayer}
        onLayerChange={setMapLayer}
      />

      <div className="body">
        <Sidebar
          flights={filtered}
          totalFlights={flights.length}
          selected={selected}
          onSelect={handleSelect}
          onDeselect={() => setSelected(null)}
          filters={filters}
          onFilterChange={updateFilter}
          onClearFilters={clearFilters}
          hasFilters={hasFilters}
          countries={countries}
          emergencies={emergencies}
        />

        <MapView
          flights={filtered}
          airports={airports}
          selected={selected}
          flyTarget={flyTarget}
          mapLayer={mapLayer}
          onSelect={handleSelect}
          onDeselect={() => setSelected(null)}
          track={track}
        />
      </div>
    </div>
  )
}
