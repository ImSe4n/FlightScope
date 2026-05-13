import { EMERGENCY_SQUAWKS } from '../utils/constants'

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
      <table className="popup-table">
        <tbody>
          <tr><td>ICAO24</td>  <td>{f.icao24}</td></tr>
          <tr><td>Country</td> <td>{f.origin || 'N/A'}</td></tr>
          <tr><td>Altitude</td><td>{f.alt    != null ? `${Math.round(f.alt)} m`    : 'N/A'}</td></tr>
          <tr><td>Speed</td>   <td>{f.speed  != null ? `${Math.round(f.speed)} m/s` : 'N/A'}</td></tr>
          <tr><td>Heading</td> <td>{f.heading != null ? `${Math.round(f.heading)}°`  : 'N/A'}</td></tr>
          <tr><td>Squawk</td>  <td>{f.squawk || 'N/A'}</td></tr>
          <tr><td>Status</td>  <td>{f.onGround ? 'On Ground' : 'Airborne'}</td></tr>
        </tbody>
      </table>
      <button className="popup-detail-btn" onClick={onViewDetails}>View Details →</button>
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
          <b>Weather</b>&nbsp;{a.weather.temperature}°C · {a.weather.windspeed} m/s wind
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
              {rw.le_ident}/{rw.he_ident} &mdash; {rw.length_ft}ft &times; {rw.width_ft}ft ({rw.surface})
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
