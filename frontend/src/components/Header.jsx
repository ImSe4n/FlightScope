import { useState, useEffect, useMemo } from 'react'
import { TILE_LAYERS } from '../utils/constants'

const ROUTE_RE = /^([A-Z]{3,4})\s*[-→\s]+([A-Z]{3,4})$/i

function SearchBox({ query, onQueryChange, flights, airports, onFlightSelect, onAirportSelect }) {
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

  return (
    <div className="search-wrap">
      <span className="search-icon">⌕</span>
      <input
        className="search-input"
        placeholder="Search flights, airports, callsigns…"
        value={local}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setLocal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') clear() }}
      />
      {local && <button className="search-clear" onClick={clear}>✕</button>}

      {showDrop && hasResults && (
        <div className="search-dropdown">
          {matchAirports.length > 0 && (
            <>
              <div className="search-drop-section">Airports</div>
              {matchAirports.map(a => (
                <div key={a.ident} className="search-drop-item" onMouseDown={() => { onAirportSelect(a); setOpen(false) }}>
                  <span className="search-drop-code">{a.iata || a.ident}</span>
                  <span className="search-drop-name">{a.name}</span>
                  {a.city && <span className="search-drop-city">{a.city}{a.country ? ` · ${a.country}` : ''}</span>}
                </div>
              ))}
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
      </div>
    </header>
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
