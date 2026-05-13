import { TILE_LAYERS } from '../utils/constants'

export default function Header({
  query, onQueryChange,
  stats, loading, error, updatedAt,
  onRefresh, mapLayer, onLayerChange,
}) {
  return (
    <header className="header">
      <span className="header-title">✈ FlightScope</span>

      <div className="search-wrap">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          placeholder="Search callsign, ICAO24, country, squawk…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
        {query && (
          <button className="search-clear" onClick={() => onQueryChange('')} title="Clear">✕</button>
        )}
      </div>

      <div className="header-right">
        {error ? (
          <span className="badge-err" title={error}>⚠ API Error</span>
        ) : (
          <>
            <StatChip value={stats.total}       label="flights"   color="#4fc3f7" />
            <StatChip value={stats.inAir}       label="airborne"  color="#81c784" />
            <StatChip value={stats.countries}   label="countries" color="#ffb74d" />
            {stats.emergencies > 0 && (
              <StatChip value={stats.emergencies} label="SOS" color="#ef5350" blink />
            )}
          </>
        )}

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

        <span className="updated">{loading ? '↻ Updating…' : updatedAt ? `↺ ${updatedAt}` : ''}</span>
        <button className="btn-refresh" onClick={onRefresh} disabled={loading}>Refresh</button>
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
