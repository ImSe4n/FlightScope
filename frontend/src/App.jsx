import { useState, useEffect, useMemo, useTransition, useCallback, memo } from 'react'
import { useFlights, useAirports, useTrack, useDeadReckonedFlights } from './hooks/useFlights'
import Header   from './components/Header'
import Sidebar  from './components/Sidebar'
import MapView  from './components/MapView'
import './App.css'

const DEFAULT_FILTERS = {
  query:         '',
  hideGround:    false,
  emergencyOnly: false,
  country:       '',
  airline:       '',
  source:        '',
  minAlt:        '',
  maxAlt:        '',
  minSpeed:      '',
  maxSpeed:      '',
}

// Extract 3-letter ICAO airline code from callsign (e.g. "BAW123" → "BAW")
const airlineOf = cs => cs?.trim().toUpperCase().match(/^([A-Z]{3})\d/)?.[1] ?? null

const MemoSidebar = memo(Sidebar, (prev, next) =>
  prev.selected         === next.selected         &&
  prev.filters          === next.filters          &&
  prev.hasFilters       === next.hasFilters       &&
  prev.flights          === next.flights          &&
  prev.totalFlights     === next.totalFlights     &&
  prev.emergencies      === next.emergencies      &&
  prev.countries        === next.countries        &&
  prev.airlines         === next.airlines         &&
  prev.airports         === next.airports         &&
  prev.track            === next.track            &&
  prev.onAirportSelect  === next.onAirportSelect
)

export default function App() {
  const { flights, error } = useFlights()
  const airports   = useAirports()
  const drFlights  = useDeadReckonedFlights(flights)  // smoothly interpolated

  const [filters,   setFilters]   = useState(DEFAULT_FILTERS)
  const [selected,  setSelected]  = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)
  const [mapLayer,  setMapLayer]  = useState('dark')

  const [, startTransition] = useTransition()

  const { track } = useTrack(selected?.icao24)

  // DR'd version of the selected flight — updates every 500 ms for smooth tracking.
  const drSelected = useMemo(
    () => selected ? (drFlights.find(f => f.icao24 === selected.icao24) ?? selected) : null,
    [selected, drFlights],
  )

  // Keep the selected flight fresh on every auto-refresh
  useEffect(() => {
    if (!selected) return
    const fresh = flights.find(f => f.icao24 === selected.icao24)
    if (fresh) setSelected(fresh)
  }, [flights])

  // Escape key → deselect
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────
  const countries = useMemo(
    () => [...new Set(flights.map(f => f.origin).filter(Boolean))].sort(),
    [flights],
  )

  const airlines = useMemo(
    () => [...new Set(flights.map(f => airlineOf(f.callsign)).filter(Boolean))].sort(),
    [flights],
  )

  const filtered = useMemo(() => {
    let r = flights
    if (filters.hideGround)    r = r.filter(f => !f.onGround)
    if (filters.emergencyOnly) r = r.filter(f => ['7500','7600','7700'].includes(String(f.squawk)))
    if (filters.country)       r = r.filter(f => f.origin === filters.country)
    if (filters.airline)       r = r.filter(f => airlineOf(f.callsign) === filters.airline)
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

  // Dead-reckoned subset for the map — same filter set, smoothed positions
  const filteredIds  = useMemo(() => new Set(filtered.map(f => f.icao24)), [filtered])
  const drFiltered   = useMemo(
    () => drFlights.filter(f => filteredIds.has(f.icao24)),
    [drFlights, filteredIds],
  )

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

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelect = useCallback(f => {
    setSelected(f)
    if (f?.lat && f?.lon) setFlyTarget(f)
  }, [])

  const handleAirportSelect = useCallback(a => {
    setSelected(null)
    setFlyTarget({ lat: a.lat, lon: a.lon, zoom: 13 })
  }, [])

  const updateFilter = (key, value) =>
    startTransition(() => setFilters(prev => ({ ...prev, [key]: value })))

  const clearFilters = () =>
    startTransition(() => setFilters(DEFAULT_FILTERS))

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
        error={error}
        mapLayer={mapLayer}
        onLayerChange={setMapLayer}
        flights={flights}
        airports={airports}
        onFlightSelect={handleSelect}
        onAirportSelect={handleAirportSelect}
      />

      <div className="body">
        <MemoSidebar
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
          airlines={airlines}
          emergencies={emergencies}
          airports={airports}
          track={track}
          onAirportSelect={handleAirportSelect}
        />

        <MapView
          flights={drFiltered}
          airports={airports}
          selected={selected}
          selectedPos={drSelected}
          liveFlights={flights}
          flyTarget={flyTarget}
          mapLayer={mapLayer}
          onSelect={handleSelect}
          onFlightSelect={handleSelect}
          onDeselect={() => setSelected(null)}
          track={track}
        />
      </div>
    </div>
  )
}
