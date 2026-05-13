import { useState, useEffect } from 'react'
import { TILE_LAYERS } from '../utils/constants'

// Debounced search — displays immediately in the input, but only propagates to the
// parent after 200 ms of inactivity, avoiding a full 8 000-flight filter on every keystroke.
function SearchBox({ query, onQueryChange }) {
  const [local, setLocal] = useState(query)

  // Sync if parent clears the query (e.g. "Clear all filters")
  useEffect(() => { setLocal(query) }, [query])

  // Debounce: propagate 200 ms after the user stops typing
  useEffect(() => {
    const id = setTimeout(() => { if (local !== query) onQueryChange(local) }, 200)
    return () => clearTimeout(id)
  }, [local])  // intentionally omits query/onQueryChange — only fires on local change

  return (
    <div className="search-wrap">
      <span className="search-icon">⌕</span>
      <input
        className="search-input"
        placeholder="Callsign · ICAO24 · Country · Squawk…"
        value={local}
        onChange={e => setLocal(e.target.value)}
      />
      {local && (
        <button className="search-clear" onClick={() => { setLocal(''); onQueryChange('') }}>✕</button>
      )}
    </div>
  )
}

export default function Header({
  query, onQueryChange,
  stats, error,
  mapLayer, onLayerChange,
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

      <SearchBox query={query} onQueryChange={onQueryChange} />

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
