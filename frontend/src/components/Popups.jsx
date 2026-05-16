import { useState, useEffect } from 'react'
import { EMERGENCY_SQUAWKS } from '../utils/constants'
import { useAirportFlights } from '../hooks/useFlights'

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

function tsHHMM(unix) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

// ── Flight popup (shown on marker click before detail panel opens) ─────────────
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

// ── Airport info tab content ───────────────────────────────────────────────────
function AirportInfoTab({ a, loading }) {
  const wx  = a.weather
  const wmo = WX[wx?.weathercode] ?? null

  return (
    <>
      {loading && <div className="popup-loading">Loading details…</div>}

      {a.description && (
        <div className="popup-description">{a.description}</div>
      )}

      <table className="popup-table" style={{ marginTop: 8 }}>
        <tbody>
          {a.type        && <tr><td>Type</td>      <td>{a.type.replace(/_/g,' ')}</td></tr>}
          {a.elevation_ft != null && <tr><td>Elevation</td> <td>{Number(a.elevation_ft).toLocaleString()} ft</td></tr>}
        </tbody>
      </table>

      {wx && (
        <div className="popup-wx">
          {wmo && <span className="popup-wx-cond">{wmo}</span>}
          <span>{wx.temperature}°C</span>
          {wx.windspeed != null && (
            <span>· {Math.round(wx.windspeed)} kt {windDir(wx.winddirection)}</span>
          )}
        </div>
      )}

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

      {a.metar && a.metar !== 'N/A' && (
        <div className="popup-metar-wrap">
          <span className="popup-metar-label">METAR</span>
          <span className="popup-metar">{a.metar}</span>
        </div>
      )}

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

      {a.runways?.length > 0 && (
        <div className="popup-runways">
          <div className="popup-runways-title">Runways</div>
          {a.runways.slice(0, 4).map((rw, i) => {
            const isActive = a.predictedRunway &&
              (rw.le_ident === a.predictedRunway || rw.he_ident === a.predictedRunway)
            return (
              <div key={i} className={`runway-line${isActive ? ' runway-line--active' : ''}`}>
                {rw.le_ident}/{rw.he_ident}
                {rw.length_ft && ` · ${Number(rw.length_ft).toLocaleString()} ft`}
                {rw.width_ft  && ` × ${rw.width_ft} ft`}
                {rw.surface   && ` (${rw.surface})`}
                {isActive && <span className="runway-active-tag">active</span>}
              </div>
            )
          })}
        </div>
      )}

      {a.wiki_url && (
        <a className="popup-wiki-link" href={a.wiki_url} target="_blank" rel="noopener noreferrer">
          Wikipedia →
        </a>
      )}
    </>
  )
}

// ── Airport flights tab content ────────────────────────────────────────────────
function AirportFlightsTab({ ident }) {
  const { data, loading, load } = useAirportFlights(ident)
  const [sub, setSub] = useState('dep')

  // Trigger load once when this tab mounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const list = sub === 'dep' ? (data?.departures ?? []) : (data?.arrivals ?? [])

  return (
    <div className="apf-wrap">
      <div className="apf-subtabs">
        <button
          className={`apf-subtab${sub === 'dep' ? ' apf-subtab--active' : ''}`}
          onClick={() => setSub('dep')}
        >
          Departures
        </button>
        <button
          className={`apf-subtab${sub === 'arr' ? ' apf-subtab--active' : ''}`}
          onClick={() => setSub('arr')}
        >
          Arrivals
        </button>
      </div>

      {loading && <div className="apf-loading">Loading…</div>}

      {!loading && data && list.length === 0 && (
        <div className="apf-empty">No data for the past 24 h</div>
      )}

      {list.length > 0 && (
        <div className="apf-list">
          {list.map((fl, i) => {
            const cs      = fl.callsign?.trim() || fl.icao24 || '—'
            const partner = sub === 'dep'
              ? fl.estArrivalAirport
              : fl.estDepartureAirport
            const ts = sub === 'dep'
              ? tsHHMM(fl.firstSeen)
              : tsHHMM(fl.lastSeen)

            return (
              <div key={i} className="apf-row">
                <span className="apf-cs">{cs}</span>
                <span className="apf-route">
                  {sub === 'dep' ? '→ ' : '← '}
                  <span className="apf-airport">{partner || '—'}</span>
                </span>
                <span className="apf-time">{ts}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main airport popup ─────────────────────────────────────────────────────────
export function AirportPopup({ a, loading = false }) {
  const [tab, setTab] = useState('info')

  return (
    <div className="popup airport-popup">

      {/* Wikipedia image — only on info tab */}
      {tab === 'info' && a.image && (
        <div className="popup-img-wrap">
          <img src={a.image} alt={a.name} />
        </div>
      )}

      <div className="popup-airport-body">
        {/* Header */}
        <div className="popup-title">{a.name}</div>
        <div className="popup-sub">
          {a.ident}
          {a.iata    && ` · ${a.iata}`}
          {a.city    && ` · ${a.city}`}
          {a.country && ` · ${a.country}`}
        </div>

        {/* Top-level tabs */}
        <div className="ap-tabs">
          <button
            className={`ap-tab${tab === 'info'    ? ' ap-tab--active' : ''}`}
            onClick={() => setTab('info')}
          >
            Info
          </button>
          <button
            className={`ap-tab${tab === 'flights' ? ' ap-tab--active' : ''}`}
            onClick={() => setTab('flights')}
          >
            Flights
          </button>
        </div>

        {tab === 'info'    && <AirportInfoTab a={a} loading={loading} />}
        {tab === 'flights' && <AirportFlightsTab ident={a.ident} />}
      </div>
    </div>
  )
}
