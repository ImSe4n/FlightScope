import { useState, useEffect, useMemo, useTransition, memo } from 'react'
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

// Memo-wrap heavy components so they only re-render when their own props change.
// Sidebar only needs to re-render when selected / filters / flight count changes —
// NOT on every flight position tick.
const MemoSidebar = memo(Sidebar, (prev, next) =>
  prev.selected      === next.selected      &&
  prev.filters       === next.filters       &&
  prev.hasFilters    === next.hasFilters    &&
  prev.flights       === next.flights       &&
  prev.totalFlights  === next.totalFlights  &&
  prev.emergencies   === next.emergencies   &&
  prev.countries     === next.countries     &&
  prev.airports      === next.airports      &&
  prev.track         === next.track
)

export default function App() {
  const { flights, error } = useFlights()
  const airports = useAirports()

  const [filters,   setFilters]   = useState(DEFAULT_FILTERS)
  const [selected,  setSelected]  = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)
  const [mapLayer,  setMapLayer]  = useState('dark')

  // useTransition defers low-priority state updates (filtering/sorting)
  // so the map and input feel instant even while 8 000+ flights are being filtered.
  const [, startTransition] = useTransition()

  const { track } = useTrack(selected?.icao24)

  // Keep the selected flight fresh on every auto-refresh
  useEffect(() => {
    if (!selected) return
    const fresh = flights.find(f => f.icao24 === selected.icao24)
    if (fresh) setSelected(fresh)
  }, [flights])  // intentionally omits `selected` to avoid loop

  // Escape key → deselect
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── Derived data (all wrapped in useMemo for stability) ──────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelect = f => {
    setSelected(f)
    if (f?.lat && f?.lon) setFlyTarget(f)
  }

  // Wrap filter updates in startTransition — filtering 8 000 flights is
  // non-urgent; React 18 will yield to input/map events first.
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
          emergencies={emergencies}
          airports={airports}
          track={track}
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
