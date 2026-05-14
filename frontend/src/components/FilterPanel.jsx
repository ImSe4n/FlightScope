import { SOURCE_TYPES } from '../utils/constants'

export default function FilterPanel({ filters, onChange, onClear, hasFilters, countries, airlines }) {
  const set = key => e =>
    onChange(key, e.target.type === 'checkbox' ? e.target.checked : e.target.value)

  return (
    <div className="filter-panel">
      <div className="sb-heading">
        Filters
        {hasFilters && <button className="btn-clear" onClick={onClear}>Clear all</button>}
      </div>

      <div className="filter-checks">
        <label className="filter-check">
          <input type="checkbox" checked={filters.hideGround} onChange={set('hideGround')} />
          Hide ground traffic
        </label>
        <label className="filter-check">
          <input type="checkbox" checked={filters.emergencyOnly} onChange={set('emergencyOnly')} />
          Emergency squawks only
        </label>
      </div>

      <select className="filter-select" value={filters.country} onChange={set('country')}>
        <option value="">All countries</option>
        {countries.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <select className="filter-select" value={filters.airline} onChange={set('airline')}>
        <option value="">All airlines</option>
        {airlines.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      <select className="filter-select" value={filters.source} onChange={set('source')}>
        <option value="">All data sources</option>
        {Object.entries(SOURCE_TYPES).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <div className="filter-range-row">
        <span className="filter-range-label">Altitude (m)</span>
        <div className="filter-range-inputs">
          <input className="filter-num" type="number" placeholder="Min"
            value={filters.minAlt} onChange={set('minAlt')} />
          <span className="range-sep">–</span>
          <input className="filter-num" type="number" placeholder="Max"
            value={filters.maxAlt} onChange={set('maxAlt')} />
        </div>
      </div>

      <div className="filter-range-row">
        <span className="filter-range-label">Speed (m/s)</span>
        <div className="filter-range-inputs">
          <input className="filter-num" type="number" placeholder="Min"
            value={filters.minSpeed} onChange={set('minSpeed')} />
          <span className="range-sep">–</span>
          <input className="filter-num" type="number" placeholder="Max"
            value={filters.maxSpeed} onChange={set('maxSpeed')} />
        </div>
      </div>
    </div>
  )
}
