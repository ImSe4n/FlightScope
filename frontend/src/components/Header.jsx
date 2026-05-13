import { useState, useEffect } from 'react'
import { TILE_LAYERS, REFRESH_MS } from '../utils/constants'

// Isolated countdown — re-renders every second without touching App state
function Countdown({ updatedAt, loading }) {
  const total = REFRESH_MS / 1000
  const [secs, setSecs] = useState(total)

  // Reset whenever a fresh batch of data arrives
  useEffect(() => { setSecs(total) }, [updatedAt, total])

  useEffect(() => {
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading) return <span className="countdown loading">updating…</span>
  return (
    <span className="countdown" title="Seconds until next auto-refresh">
      <span className="countdown-bar" style={{ width: `${(secs / total) * 100}%` }} />
      {secs}s
    </span>
  )
}

export default function Header({
  query, onQueryChange,
  stats, loading, error, updatedAt,
  onRefresh, mapLayer, onLayerChange,
}) {
  return (
    <header className="header">

      {/* Brand */}
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

      {/* Search */}
      <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          placeholder="Callsign · ICAO24 · Country · Squawk…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
        {query && (
          <button className="search-clear" onClick={() => onQueryChange('')}>✕</button>
        )}
      </div>

      {/* Stats + controls */}
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

        {/* Map layer buttons */}
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

        <Countdown updatedAt={updatedAt} loading={loading} />

        <button className="btn-refresh" onClick={onRefresh} disabled={loading}>
          ↻ Refresh
        </button>
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
