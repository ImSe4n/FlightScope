import { EMERGENCY_SQUAWKS } from '../utils/constants'

const LIST_LIMIT = 300

export default function FlightList({ flights, total, selected, onSelect }) {
  return (
    <div className="fl-wrap">
      <div className="sb-heading">
        {flights.length.toLocaleString()} flights
        {flights.length < total && (
          <span className="fl-total"> / {total.toLocaleString()} total</span>
        )}
      </div>

      <div className="fl-list">
        <div className="fl-header">
          <span>Callsign</span>
          <span>Country</span>
          <span>Alt</span>
        </div>

        {flights.slice(0, LIST_LIMIT).map(f => (
          <FlightRow
            key={f.icao24}
            f={f}
            isSelected={selected?.icao24 === f.icao24}
            onSelect={onSelect}
          />
        ))}

        {flights.length > LIST_LIMIT && (
          <div className="fl-more">
            +{(flights.length - LIST_LIMIT).toLocaleString()} more — refine search to see them
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
  const alt        = f.onGround ? 'GND' : f.alt != null ? `${Math.round(f.alt)}m` : '—'
  const isEmergency = EMERGENCY_SQUAWKS[String(f.squawk)]

  return (
    <div
      className={[
        'fl-row',
        isSelected   ? 'fl-row--active'    : '',
        isEmergency  ? 'fl-row--emergency' : '',
      ].join(' ').trim()}
      onClick={() => onSelect(f)}
      title={isEmergency ? `Emergency squawk ${f.squawk}` : undefined}
    >
      <span className="fl-cs">{callsign}</span>
      <span className="fl-origin">{f.origin || '—'}</span>
      <span className={`fl-alt${f.onGround ? ' fl-alt--gnd' : ''}`}>{alt}</span>
    </div>
  )
}
