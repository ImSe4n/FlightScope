import { useState, useMemo } from 'react'
import { EMERGENCY_SQUAWKS, airlineOf } from '../utils/constants'

const LIST_LIMIT = 300
const ft = v => v != null ? Math.round(v * 3.28084) : null

// Vertical-rate arrow: ↑ climbing, ↓ descending, blank if level / unknown
function vrArrow(vr) {
  if (vr == null || Math.abs(vr) < 0.5) return null
  return vr > 0 ? { char: '↑', color: 'var(--green)' } : { char: '↓', color: 'var(--red)' }
}

export default function FlightList({ flights, total, selected, onSelect, routeFilter }) {
  const [sortBy, setSortBy] = useState('alt')

  const sorted = useMemo(() => {
    const arr = [...flights]
    if (sortBy === 'alt')     arr.sort((a, b) => (b.alt   ?? -Infinity) - (a.alt   ?? -Infinity))
    if (sortBy === 'speed')   arr.sort((a, b) => (b.speed ?? -Infinity) - (a.speed ?? -Infinity))
    if (sortBy === 'cs')      arr.sort((a, b) => (a.callsign || 'zzz').localeCompare(b.callsign || 'zzz'))
    if (sortBy === 'airline') arr.sort((a, b) => airlineOf(a.callsign).localeCompare(airlineOf(b.callsign)))
    return arr
  }, [flights, sortBy])

  return (
    <div className="fl-wrap">

      <div className="fl-meta-row">
        <span className="fl-count">
          {flights.length.toLocaleString()}
          {flights.length < total && (
            <span className="fl-count-total"> / {total.toLocaleString()}</span>
          )}
          <span className="fl-count-label"> flights</span>
        </span>

        <div className="sort-pills">
          {[
            { key: 'alt',     label: 'Alt'     },
            { key: 'speed',   label: 'Speed'   },
            { key: 'cs',      label: 'A–Z'     },
            { key: 'airline', label: 'Airline' },
          ].map(s => (
            <button
              key={s.key}
              className={`sort-pill${sortBy === s.key ? ' sort-pill--active' : ''}`}
              onClick={() => setSortBy(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fl-header">
        <span>Callsign</span>
        <span>Country</span>
        <span>Ft</span>
      </div>

      <div className="fl-list">
        {sorted.slice(0, LIST_LIMIT).map(f => (
          <FlightRow
            key={f.icao24}
            f={f}
            isSelected={selected?.icao24 === f.icao24}
            onSelect={onSelect}
          />
        ))}

        {flights.length > LIST_LIMIT && (
          <div className="fl-more">
            +{(flights.length - LIST_LIMIT).toLocaleString()} more — refine filters to see them
          </div>
        )}

        {flights.length === 0 && total > 0 && (
          <div className="fl-empty">No flights match current filters.</div>
        )}

        {total === 0 && (
          <div className="fl-empty">Waiting for flight data…</div>
        )}
      </div>
    </div>
  )
}

function FlightRow({ f, isSelected, onSelect }) {
  const callsign   = (f.callsign || f.icao24 || '—').trim()
  const altFt      = ft(f.alt)
  const altDisplay = f.onGround ? 'GND' : altFt != null ? altFt.toLocaleString() : '—'
  const isEmg      = Boolean(EMERGENCY_SQUAWKS[String(f.squawk)])
  const vr         = vrArrow(f.vertRate)

  return (
    <div
      className={[
        'fl-row',
        isSelected ? 'fl-row--active'    : '',
        isEmg      ? 'fl-row--emergency' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(f)}
      title={isEmg ? `⚠ Emergency squawk ${f.squawk}` : undefined}
    >
      <span className="fl-cs">{callsign}</span>
      <span className="fl-origin">{f.origin || '—'}</span>
      <span className={`fl-alt${f.onGround ? ' fl-alt--gnd' : ''}`}>
        {altDisplay}
        {vr && !f.onGround && (
          <span className="fl-vr" style={{ color: vr.color }}>{vr.char}</span>
        )}
      </span>
    </div>
  )
}
