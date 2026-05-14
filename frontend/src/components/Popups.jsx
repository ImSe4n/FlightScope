import { EMERGENCY_SQUAWKS } from '../utils/constants'

const ft = v => v != null ? Math.round(v * 3.28084).toLocaleString() : 'N/A'
const kt = v => v != null ? Math.round(v * 1.94384)                  : 'N/A'

// WMO weather code → emoji/label
const WX = {
  0:'☀️ Clear', 1:'🌤 Mainly clear', 2:'⛅ Partly cloudy', 3:'☁️ Overcast',
  45:'🌫 Fog', 48:'🌫 Icy fog',
  51:'🌦 Light drizzle', 53:'🌦 Drizzle', 55:'🌧 Heavy drizzle',
  61:'🌧 Light rain', 63:'🌧 Rain', 65:'🌧 Heavy rain',
  71:'🌨 Light snow', 73:'🌨 Snow', 75:'❄️ Heavy snow',
  80:'🌦 Showers', 81:'🌧 Heavy showers', 95:'⛈ Thunderstorm',
}

function windDir(deg) {
  if (deg == null) return ''
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(deg / 45) % 8]
}

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
      <div className="popup-sub">{f.icao24?.toUpperCase()} · {f.origin || 'Unknown origin'}</div>

      <table className="popup-table">
        <tbody>
          <tr><td>Status</td>   <td>{f.onGround ? '⬜ On Ground' : '✈ Airborne'}</td></tr>
          <tr><td>Altitude</td> <td>{f.onGround ? '—' : `${ft(f.alt)} ft`}</td></tr>
          <tr><td>Speed</td>    <td>{kt(f.speed)} kt</td></tr>
          <tr><td>Heading</td>  <td>{f.heading != null ? `${Math.round(f.heading)}°` : 'N/A'}</td></tr>
          <tr><td>Squawk</td>   <td>{f.squawk || 'N/A'}</td></tr>
        </tbody>
      </table>

      <button className="popup-detail-btn" onClick={onViewDetails}>
        View Details →
      </button>
    </div>
  )
}

export function AirportPopup({ a, loading = false }) {
  const wx  = a.weather
  const wmo = WX[wx?.weathercode] ?? null

  return (
    <div className="popup airport-popup">

      {/* Wikipedia image */}
      {a.image && (
        <div className="popup-img-wrap">
          <img src={a.image} alt={a.name} />
        </div>
      )}

      <div className="popup-airport-body">
        {/* Header */}
        <div className="popup-title">{a.name}</div>
        <div className="popup-sub">
          {a.ident}
          {a.iata && ` · ${a.iata}`}
          {a.city  && ` · ${a.city}`}
          {a.country && ` · ${a.country}`}
        </div>

        {loading && <div className="popup-loading">Loading details…</div>}

        {/* Wikipedia description */}
        {a.description && (
          <div className="popup-description">{a.description}</div>
        )}

        {/* Airport details */}
        <table className="popup-table" style={{ marginTop: 8 }}>
          <tbody>
            {a.type       && <tr><td>Type</td>      <td>{a.type.replace(/_/g,' ')}</td></tr>}
            {a.elevation_ft != null && <tr><td>Elevation</td> <td>{Number(a.elevation_ft).toLocaleString()} ft</td></tr>}
          </tbody>
        </table>

        {/* Weather */}
        {wx && (
          <div className="popup-wx">
            {wmo && <span className="popup-wx-cond">{wmo}</span>}
            <span>{wx.temperature}°C</span>
            {wx.windspeed != null && (
              <span>· {Math.round(wx.windspeed)} kt {windDir(wx.winddirection)}</span>
            )}
          </div>
        )}

        {/* Predicted active runway */}
        {a.predictedRunway && (
          <div className="popup-rw-active">
            <span className="popup-rw-active-label">Active runway (est.)</span>
            <span className="popup-rw-active-val">RWY {a.predictedRunway}</span>
            {a.metarWindDir != null && (
              <span className="popup-rw-wind">
                Wind {a.metarWindDir}°{a.metarWindSpd != null ? ` · ${a.metarWindSpd}kt` : ''}
              </span>
            )}
          </div>
        )}

        {/* METAR */}
        {a.metar && a.metar !== 'N/A' && (
          <div className="popup-metar-wrap">
            <span className="popup-metar-label">METAR</span>
            <span className="popup-metar">{a.metar}</span>
          </div>
        )}

        {/* Hourly weather */}
        {a.weather?.hourly?.length > 0 && (
          <div className="popup-hourly">
            <div className="popup-hourly-title">Hourly Weather (UTC)</div>
            <div className="popup-hourly-list">
              {a.weather.hourly.map(h => (
                <div key={h.time} className="popup-hourly-row">
                  <span className="popup-hourly-time">{h.time.split('T')[1]}</span>
                  <span className="popup-hourly-temp">{h.temp != null ? `${h.temp}°C` : '—'}</span>
                  <span className="popup-hourly-wind">
                    {h.windspeed != null ? `${Math.round(h.windspeed)}kt` : ''}
                    {h.winddir != null ? ` ${windDir(h.winddir)}` : ''}
                  </span>
                  <span className="popup-hourly-wx">{WX[h.wxcode] ?? ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Runways */}
        {a.runways?.length > 0 && (
          <div className="popup-runways">
            <div className="popup-runways-title">Runways</div>
            {a.runways.slice(0, 4).map((rw, i) => (
              <div key={i} className={`runway-line${a.predictedRunway && (rw.le_ident === a.predictedRunway || rw.he_ident === a.predictedRunway) ? ' runway-line--active' : ''}`}>
                {rw.le_ident}/{rw.he_ident}
                {rw.length_ft && ` · ${Number(rw.length_ft).toLocaleString()} ft`}
                {rw.width_ft  && ` × ${rw.width_ft} ft`}
                {rw.surface   && ` (${rw.surface})`}
                {(rw.le_ident === a.predictedRunway || rw.he_ident === a.predictedRunway) && (
                  <span className="runway-active-tag">active</span>
                )}
              </div>
            ))}
          </div>
        )}

        {a.wiki_url && (
          <a className="popup-wiki-link" href={a.wiki_url} target="_blank" rel="noopener noreferrer">
            Wikipedia →
          </a>
        )}
      </div>
    </div>
  )
}
