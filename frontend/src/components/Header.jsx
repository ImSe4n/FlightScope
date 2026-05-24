import { useState, useEffect, useMemo, useCallback } from 'react'
import { TILE_LAYERS } from '../utils/constants'
import { useAppAuth }  from '../context/AuthContext'
import AuthButton      from './AuthButton'

const ROUTE_RE = /^([A-Z]{3,4})\s*[-→\s]+([A-Z]{3,4})$/i

function SearchBox({
  query, onQueryChange,
  flights, airports, onFlightSelect, onAirportSelect,
  savedAirports, savedRoutes, onSaveAirport, onSaveRoute, onUnsaveAirport, onUnsaveRoute,
  routeFilter,
}) {
  const { isAuthenticated } = useAppAuth()
  const [local, setLocal] = useState(query)
  const [open,  setOpen]  = useState(false)

  useEffect(() => { setLocal(query) }, [query])

  // Debounce propagation to the filter list
  useEffect(() => {
    const id = setTimeout(() => { if (local !== query) onQueryChange(local) }, 200)
    return () => clearTimeout(id)
  }, [local])

  const q        = local.trim().toLowerCase().replace(/\s+/g, '')
  const qRaw     = local.trim().toLowerCase()
  const showDrop = open && q.length >= 2
  const routeMatch = showDrop ? ROUTE_RE.exec(local.trim()) : null

  const matchAirports = useMemo(() => {
    if (!showDrop) return []
    return airports.filter(a =>
      a.iata?.toLowerCase().startsWith(q) ||
      a.ident?.toLowerCase().startsWith(q) ||
      a.name?.toLowerCase().includes(qRaw) ||
      a.city?.toLowerCase().includes(qRaw)
    ).slice(0, 5)
  }, [airports, q, qRaw, showDrop])

  const matchFlights = useMemo(() => {
    if (!showDrop) return []
    return flights.filter(f =>
      f.callsign?.trim().toLowerCase().replace(/\s+/g, '').startsWith(q) ||
      f.icao24?.toLowerCase().startsWith(q)
    ).slice(0, 5)
  }, [flights, q, showDrop])

  const clear = () => { setLocal(''); onQueryChange(''); setOpen(false) }

  const hasResults = matchAirports.length > 0 || matchFlights.length > 0

  const isAirportSaved = (ident) => savedAirports?.some(a => a.ident === ident)
  const isRouteSaved   = (dep, arr) => savedRoutes?.some(r => r.dep === dep && r.arr === arr)

  return (
    <div className="search-wrap">
      <span className="search-icon">⌕</span>
      <input
        className="search-input"
        placeholder="Search flights, airports… or LAX JFK"
        value={local}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setLocal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') clear() }}
      />
      {local && <button className="search-clear" onClick={clear}>✕</button>}

      {showDrop && routeMatch && (() => {
        const dep = routeMatch[1].toUpperCase()
        const arr = routeMatch[2].toUpperCase()
        const saved = isRouteSaved(dep, arr)
        return (
          <div className="search-dropdown">
            <div className="search-drop-item search-drop-route">
              <span className="search-drop-code">{dep} → {arr}</span>
              <span className="search-drop-name">
                {routeFilter?.loading ? 'Searching…' : 'Filtering live flights on this route'}
              </span>
              {isAuthenticated && (
                <button
                  className={`search-drop-star${saved ? ' saved' : ''}`}
                  title={saved ? 'Remove saved route' : 'Save route'}
                  onMouseDown={e => {
                    e.preventDefault()
                    saved ? onUnsaveRoute(dep, arr) : onSaveRoute(dep, arr)
                  }}
                >
                  {saved ? '★' : '☆'}
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {showDrop && !routeMatch && hasResults && (
        <div className="search-dropdown">
          {matchAirports.length > 0 && (
            <>
              <div className="search-drop-section">Airports</div>
              {matchAirports.map(a => {
                const saved = isAirportSaved(a.ident)
                return (
                  <div key={a.ident} className="search-drop-item search-drop-item--airport">
                    <div className="search-drop-item-info" onMouseDown={() => { onAirportSelect(a); setOpen(false) }}>
                      <span className="search-drop-code">{a.iata || a.ident}</span>
                      <span className="search-drop-name">{a.name}</span>
                      {a.city && <span className="search-drop-city">{a.city}{a.country ? ` · ${a.country}` : ''}</span>}
                    </div>
                    {isAuthenticated && (
                      <button
                        className={`search-drop-star${saved ? ' saved' : ''}`}
                        title={saved ? 'Remove saved airport' : 'Save airport'}
                        onMouseDown={e => {
                          e.preventDefault()
                          saved ? onUnsaveAirport(a.ident) : onSaveAirport(a)
                        }}
                      >
                        {saved ? '★' : '☆'}
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          )}
          {matchFlights.length > 0 && (
            <>
              <div className="search-drop-section">Flights</div>
              {matchFlights.map(f => (
                <div key={f.icao24} className="search-drop-item" onMouseDown={() => { onFlightSelect(f); clear() }}>
                  <span className="search-drop-code">{(f.callsign || f.icao24 || '').trim()}</span>
                  <span className="search-drop-name">{f.icao24?.toUpperCase()}</span>
                  {f.origin && <span className="search-drop-city">{f.origin}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Header({
  query, onQueryChange,
  stats, error,
  mapLayer, onLayerChange,
  flights, airports, onFlightSelect, onAirportSelect,
  onOpenUserPanel,
  savedAirports, savedRoutes, onSaveAirport, onSaveRoute, onUnsaveAirport, onUnsaveRoute,
  routeFilter,
}) {
  return (
    <header className="header">

      <div className="header-brand">
        <span className="header-logo">✈</span>
        <span className="header-title">
          Flight<span className="header-title-hl">Scope</span>
        </span>
        <span className="header-live">
          <span className="live-dot" />
          LIVE
        </span>
      </div>

      <div className="header-sep" />

      <SearchBox
        query={query}
        onQueryChange={onQueryChange}
        flights={flights}
        airports={airports}
        onFlightSelect={onFlightSelect}
        onAirportSelect={onAirportSelect}
        savedAirports={savedAirports}
        savedRoutes={savedRoutes}
        onSaveAirport={onSaveAirport}
        onSaveRoute={onSaveRoute}
        onUnsaveAirport={onUnsaveAirport}
        onUnsaveRoute={onUnsaveRoute}
        routeFilter={routeFilter}
      />

      <div className="header-right">
        {error ? (
          <span className="badge-err" title={error}>⚠ API Error</span>
        ) : (
          <>
            <StatChip value={stats.total}       label="Flights"   color="#38bdf8" />
            <StatChip value={stats.inAir}       label="Airborne"  color="#4ade80" />
            <StatChip value={stats.countries}   label="Countries" color="#fbbf24" />
            {stats.emergencies > 0 && (
              <StatChip value={stats.emergencies} label="SOS" color="#f87171" blink />
            )}
          </>
        )}

        <div className="header-sep" />

        <LiveClock />

        <div className="header-sep" />

        <div className="layer-switcher">
          {Object.entries(TILE_LAYERS).map(([key, layer]) => (
            <button
              key={key}
              className={`layer-btn${mapLayer === key ? ' layer-btn--active' : ''}`}
              onClick={() => onLayerChange(key)}
            >
              {layer.label}
            </button>
          ))}
        </div>

        <div className="header-sep" />

        <AuthButton onOpenPanel={onOpenUserPanel} />
      </div>
    </header>
  )
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const utc = now.toISOString().slice(11, 19)
  return (
    <div className="live-clock">
      <div className="live-clock-time">{utc}</div>
      <div className="live-clock-label">UTC</div>
    </div>
  )
}

function StatChip({ value, label, color, blink = false }) {
  return (
    <div className={`stat-chip${blink ? ' stat-chip--blink' : ''}`}>
      <span className="stat-val" style={{ color }}>{value.toLocaleString()}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
