import { useState, useEffect, useMemo, useTransition, useCallback, memo, lazy, Suspense } from 'react'
import { useFlights, useAirports, useTrack, useDrFlight } from './hooks/useFlights'
import Header   from './components/Header'
import Sidebar  from './components/Sidebar'
import MapView  from './components/MapView'
import './App.css'

const Globe3DModal = lazy(() => import('./components/Globe3DModal'))

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
  prev.followMode       === next.followMode       &&
  prev.showTrack        === next.showTrack        &&
  prev.onAirportSelect  === next.onAirportSelect
)

export default function App() {
  const { flights, error } = useFlights()
  const airports   = useAirports()

  const [filters,    setFilters]    = useState(DEFAULT_FILTERS)
  const [selected,   setSelected]   = useState(null)
  const [flyTarget,  setFlyTarget]  = useState(null)
  const [mapLayer,   setMapLayer]   = useState('dark')
  const [followMode, setFollowMode] = useState(false)
  const [showTrack,  setShowTrack]  = useState(true)
  const [globe3D,    setGlobe3D]    = useState(null)  // { flight, fromIcao, toIcao }

  const [, startTransition] = useTransition()

  const { track } = useTrack(selected?.icao24)

  // DR'd version of selected flight only — updates every 500 ms, no full-array scan.
  const drSelected = useDrFlight(selected)

  // Keep the selected flight fresh on every auto-refresh
  useEffect(() => {
    if (!selected) return
    const fresh = flights.find(f => f.icao24 === selected.icao24)
    if (fresh) setSelected(fresh)
  }, [flights])

  // Escape key → deselect + cancel follow
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') { setSelected(null); setFollowMode(false) } }
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

  const handleDeselect = useCallback(() => {
    setSelected(null)
    setFollowMode(false)
  }, [])

  const handleToggleFollow = useCallback(() => setFollowMode(v => !v), [])
  const handleToggleTrack  = useCallback(() => setShowTrack(v => !v),  [])
  const handle3D = useCallback(data => {
    setGlobe3D({ ...data, track })
  }, [track])

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
          onDeselect={handleDeselect}
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
          followMode={followMode}
          onToggleFollow={handleToggleFollow}
          showTrack={showTrack}
          onToggleTrack={handleToggleTrack}
          on3D={handle3D}
        />

        <MapView
          flights={filtered}
          airports={airports}
          selected={selected}
          selectedPos={drSelected}
          liveFlights={flights}
          flyTarget={flyTarget}
          mapLayer={mapLayer}
          onSelect={handleSelect}
          onFlightSelect={handleSelect}
          onDeselect={handleDeselect}
          track={showTrack ? track : null}
          followMode={followMode}
        />
      </div>

      {globe3D && (
        <Suspense fallback={null}>
          <Globe3DModal
            flight={globe3D.flight}
            fromIcao={globe3D.fromIcao}
            toIcao={globe3D.toIcao}
            track={globe3D.track}
            airports={airports}
            onClose={() => setGlobe3D(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
