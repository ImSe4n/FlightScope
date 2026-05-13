import { EMERGENCY_SQUAWKS } from '../utils/constants'

const ft  = v => v != null ? Math.round(v * 3.28084).toLocaleString() : 'N/A'
const kt  = v => v != null ? Math.round(v * 1.94384)                  : 'N/A'

export function FlightPopup({ f, onViewDetails }) {
  const sq        = String(f.squawk)
  const emergency = EMERGENCY_SQUAWKS[sq]

  return (
    <div className="popup">
      <div className="popup-title">
        {(f.callsign || f.icao24 || '—').trim()}
        {emergency && (
          <span className="popup-emg-badge" style={{ background: emergency.color }}>
            {emergency.label}
          </span>
        )}
      </div>
      <div className="popup-sub">{f.icao24?.toUpperCase()} · {f.origin || 'Unknown'}</div>

      <table className="popup-table">
        <tbody>
          <tr><td>Altitude</td> <td>{f.onGround ? 'On Ground' : `${ft(f.alt)} ft`}</td></tr>
          <tr><td>Speed</td>    <td>{kt(f.speed)} kt</td></tr>
          <tr><td>Heading</td>  <td>{f.heading != null ? `${Math.round(f.heading)}°` : 'N/A'}</td></tr>
          <tr><td>Squawk</td>   <td>{f.squawk || 'N/A'}</td></tr>
          <tr><td>Status</td>   <td>{f.onGround ? '⬜ On Ground' : '✈ Airborne'}</td></tr>
        </tbody>
      </table>

      <button className="popup-detail-btn" onClick={onViewDetails}>
        View Details →
      </button>
    </div>
  )
}

export function AirportPopup({ a }) {
  return (
    <div className="popup">
      <div className="popup-title">{a.name}</div>
      <div className="popup-sub">{a.ident}</div>

      {a.weather && (
        <div className="popup-row">
          🌡 {a.weather.temperature}°C &nbsp;·&nbsp; 💨 {a.weather.windspeed} m/s
        </div>
      )}

      {a.metar && a.metar !== 'N/A' && (
        <div className="popup-row popup-metar">
          <b>METAR</b>&nbsp;{a.metar}
        </div>
      )}

      {a.runways?.length > 0 && (
        <div className="popup-row">
          <b>Runways</b>
          {a.runways.map((rw, i) => (
            <div key={i} className="runway-line">
              {rw.le_ident}/{rw.he_ident} · {rw.length_ft} ft × {rw.width_ft} ft ({rw.surface})
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
