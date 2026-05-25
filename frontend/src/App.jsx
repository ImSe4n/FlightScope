import { useState, useEffect, useRef, useMemo, useTransition, useCallback, memo, lazy, Suspense } from 'react'
import { useFlights, useAirports, useTrack, useDrFlight } from './hooks/useFlights'
import { useUserData } from './hooks/useUserData'
import { useAppAuth }  from './context/AuthContext'
import { airlineOf } from './utils/constants'
import Header    from './components/Header'
import Sidebar   from './components/Sidebar'
import MapView   from './components/MapView'
import AIChat    from './components/AIChat'
import UserPanel from './components/UserPanel'
import ToastList from './components/Toast'
import './App.css'

const Globe3DModal = lazy(() => import('./components/Globe3DModal'))

const ROUTE_RE = /^([A-Z]{3,4})\s*[-→\s]+([A-Z]{3,4})$/i

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
  prev.onAirportSelect  === next.onAirportSelect  &&
  prev.isSaved          === next.isSaved          &&
  prev.onSaveFlight     === next.onSaveFlight
)

export default function App() {
  const { flights, error } = useFlights()
  const airports   = useAirports()
  const { isAuthenticated, user } = useAppAuth()
  const userData   = useUserData()
  const [showUserPanel, setShowUserPanel] = useState(false)

  const [filters, setFilters] = useState(() => {
    try {
      const s = localStorage.getItem('fs_filters')
      // Never restore text query — it's ephemeral
      return s ? { ...DEFAULT_FILTERS, ...JSON.parse(s), query: '' } : DEFAULT_FILTERS
    } catch { return DEFAULT_FILTERS }
  })
  const [selected,   setSelected]   = useState(null)
  const [flyTarget,  setFlyTarget]  = useState(null)
  const [mapLayer,   setMapLayer]   = useState(() => localStorage.getItem('fs_mapLayer') || 'dark')
  const [followMode, setFollowMode] = useState(false)
  const [showTrack,  setShowTrack]  = useState(true)
  const [globe3D,    setGlobe3D]    = useState(null)  // { flight, fromIcao, toIcao }

  // Apply saved cloud preferences once when user logs in
  useEffect(() => {
    if (!isAuthenticated || !userData.settings || !Object.keys(userData.settings).length) return
    const s = userData.settings
    if (s.mapLayer) setMapLayer(s.mapLayer)
    setFilters(prev => ({
      ...prev,
      ...(s.hideGround != null ? { hideGround: s.hideGround } : {}),
      ...(s.minAlt     ? { minAlt:     s.minAlt     } : {}),
      ...(s.maxAlt     ? { maxAlt:     s.maxAlt     } : {}),
      ...(s.minSpeed   ? { minSpeed:   s.minSpeed   } : {}),
      ...(s.maxSpeed   ? { maxSpeed:   s.maxSpeed   } : {}),
    }))
  }, [isAuthenticated, userData.settings])

  // Persist filters (minus query) whenever they change
  useEffect(() => {
    const { query, ...rest } = filters
    localStorage.setItem('fs_filters', JSON.stringify(rest))
  }, [filters])

  // Restore selected flight from ?icao24= URL param on first data load
  const initialIcaoRef = useRef(new URLSearchParams(window.location.search).get('icao24'))
  useEffect(() => {
    const icao = initialIcaoRef.current
    if (!icao || !flights.length || selected) return
    const f = flights.find(f => f.icao24 === icao)
    if (f) { setSelected(f); setFlyTarget(f) }
    initialIcaoRef.current = null
  }, [flights])

  // Keep URL in sync with selected flight so links are shareable
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selected?.icao24) url.searchParams.set('icao24', selected.icao24)
    else url.searchParams.delete('icao24')
    window.history.replaceState(null, '', url.toString())
  }, [selected])

  const [toasts, setToasts] = useState([])
  const addToast = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev.slice(-2), { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200)
  }, [])

  const [routeFilter, setRouteFilter] = useState(null)
  const routeAbortRef = useRef(null)

  // Detect route pattern in query and fetch matching icao24s
  useEffect(() => {
    const m = ROUTE_RE.exec(filters.query.trim())
    if (!m) {
      setRouteFilter(null)
      routeAbortRef.current?.abort()
      return
    }
    const dep = m[1].toUpperCase()
    const arr = m[2].toUpperCase()
    routeAbortRef.current?.abort()
    const ctrl = new AbortController()
    routeAbortRef.current = ctrl
    setRouteFilter({ dep, arr, icao24s: null, loading: true })
    fetch(`/api/route-search?dep=${dep}&arr=${arr}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        if (!ctrl.signal.aborted)
          setRouteFilter({ dep, arr, icao24s: new Set(data.icao24s), loading: false })
      })
      .catch(e => {
        if (e.name !== 'AbortError')
          setRouteFilter({ dep, arr, icao24s: new Set(), loading: false })
      })
  }, [filters.query])

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
    if (routeFilter?.icao24s) {
      r = r.filter(f => routeFilter.icao24s.has(f.icao24))
    } else if (!routeFilter && filters.query.trim()) {
      const q = filters.query.trim().toLowerCase().replace(/\s+/g, '')
      r = r.filter(f =>
        f.callsign?.trim().toLowerCase().replace(/\s+/g, '').includes(q) ||
        f.icao24?.toLowerCase().includes(q) ||
        f.origin?.toLowerCase().includes(q) ||
        String(f.squawk).includes(q)
      )
    }
    return r
  }, [flights, filters, routeFilter])

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

  const handleLayerChange  = useCallback(layer => {
    setMapLayer(layer)
    localStorage.setItem('fs_mapLayer', layer)
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

  const handleSaveFlight = useCallback((flight) => {
    const cs = flight.callsign?.trim() || flight.icao24?.toUpperCase()
    const isSaved = userData.savedFlights.some(f => f.icao24 === flight.icao24?.toLowerCase())
    if (isSaved) {
      userData.unsaveFlight(flight.icao24)
      addToast(`Removed ${cs} from saved flights`)
    } else {
      userData.saveFlight(flight)
      addToast(`Saved ${cs}`)
    }
  }, [userData, addToast])

  const handleRouteSelect = useCallback(r => {
    updateFilter('query', `${r.dep}-${r.arr}`)
  }, [])

  const handleSaveAirport = useCallback((airport) => {
    userData.saveAirport(airport)
    addToast(`Saved ${airport.iata || airport.ident}`)
  }, [userData, addToast])

  const handleUnsaveAirport = useCallback((ident) => {
    userData.unsaveAirport(ident)
    addToast('Airport removed', 'info')
  }, [userData, addToast])

  const handleSaveRoute = useCallback((dep, arr) => {
    userData.saveRoute(dep, arr)
    addToast(`Saved route ${dep}–${arr}`)
  }, [userData, addToast])

  const handleUnsaveRoute = useCallback((dep, arr) => {
    userData.unsaveRoute(dep, arr)
    addToast('Route removed', 'info')
  }, [userData, addToast])

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
        onLayerChange={handleLayerChange}
        flights={flights}
        airports={airports}
        onFlightSelect={handleSelect}
        onAirportSelect={handleAirportSelect}
        onOpenUserPanel={() => setShowUserPanel(true)}
        savedAirports={userData.savedAirports}
        savedRoutes={userData.savedRoutes}
        onSaveAirport={handleSaveAirport}
        onSaveRoute={handleSaveRoute}
        onUnsaveAirport={handleUnsaveAirport}
        onUnsaveRoute={handleUnsaveRoute}
        routeFilter={routeFilter}
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
          isSaved={selected ? userData.savedFlights.some(f => f.icao24 === selected.icao24?.toLowerCase()) : false}
          onSaveFlight={selected ? () => handleSaveFlight(selected) : undefined}
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

      <AIChat flights={flights} selected={selected} />

      <UserPanel
        open={showUserPanel}
        onClose={() => setShowUserPanel(false)}
        savedFlights={userData.savedFlights}
        savedAirports={userData.savedAirports}
        savedRoutes={userData.savedRoutes}
        settings={userData.settings}
        unsaveFlight={userData.unsaveFlight}
        unsaveAirport={userData.unsaveAirport}
        unsaveRoute={userData.unsaveRoute}
        saveSettings={userData.saveSettings}
        onFlightSelect={handleSelect}
        onAirportSelect={handleAirportSelect}
        onRouteSelect={handleRouteSelect}
        mapLayer={mapLayer}
        filters={filters}
        allFlights={flights}
      />
    </div>
  )
}
