import { useEffect, useMemo } from 'react'
import { EMERGENCY_SQUAWKS, SOURCE_TYPES } from '../utils/constants'
import AircraftPhoto from './AircraftPhoto'
import { useAircraftInfo, useRoute, useFlightHistory, useFlightStatus } from '../hooks/useFlights'
import { setCachedType } from '../utils/aircraftTypes'

const ft  = v => v != null ? Math.round(v * 3.28084).toLocaleString() : '—'
const kt  = v => v != null ? Math.round(v * 1.94384).toString()       : '—'
const fmt = (v, unit, dp = 0) => v != null ? `${Number(v).toFixed(dp)} ${unit}` : null
const hhmm = v => v != null
  ? new Date(v * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  : null

// Vertical-rate direction arrow + colour
function VrIndicator({ vr }) {
  if (vr == null || Math.abs(vr) < 0.5) return <span style={{ color: 'var(--txt-3)' }}>→ level</span>
  return vr > 0
    ? <span style={{ color: 'var(--green)' }}>↑ +{fmt(vr, 'm/s', 1)}</span>
    : <span style={{ color: 'var(--red)'   }}>↓ {fmt(vr, 'm/s', 1)}</span>
}

// Airport lookup by ICAO ident or IATA code
function airportMeta(airports, code) {
  if (!code || !airports?.length) return null
  return airports.find(a => a.ident === code || a.iata === code) ?? null
}

// SVG altitude profile — drawn from the OpenSky track path array
function AltitudeProfile({ track }) {
  if (!track || track.length < 2) return null

  const pts = track
    .filter(p => p[3] != null)
    .map(p => ({ t: p[0], alt: Math.round(p[3] * 3.28084) }))
  if (pts.length < 2) return null

  const W = 280, H = 90
  const PAD = { top: 8, right: 6, bottom: 18, left: 46 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top  - PAD.bottom

  const minAlt = Math.min(...pts.map(p => p.alt))
  const maxAlt = Math.max(...pts.map(p => p.alt))
  const minT   = pts[0].t
  const maxT   = pts[pts.length - 1].t
  const rng    = maxAlt - minAlt || 1

  const x = t   => PAD.left + (t   - minT)  / (maxT - minT) * iW
  const y = alt => PAD.top  + iH - (alt - minAlt) / rng * iH

  const line = pts.map(p => `${x(p.t).toFixed(1)},${y(p.alt).toFixed(1)}`).join(' ')
  const area = `${x(minT).toFixed(1)},${(PAD.top + iH).toFixed(1)} ${line} ${x(maxT).toFixed(1)},${(PAD.top + iH).toFixed(1)}`

  const hhmm = ts => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const last  = pts[pts.length - 1]

  return (
    <div className="fd-card">
      <div className="fd-card-label">Altitude History</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="alt-profile-svg">
        <defs>
          <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#38bdf8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        <line x1={PAD.left} y1={PAD.top}      x2={W - PAD.right} y2={PAD.top}      stroke="rgba(56,189,248,0.07)" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + iH} x2={W - PAD.right} y2={PAD.top + iH} stroke="rgba(56,189,248,0.07)" strokeWidth="1" />
        {/* Fill */}
        <polygon points={area} fill="url(#altGrad)" />
        {/* Line */}
        <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Current-position dot */}
        <circle cx={x(last.t)} cy={y(last.alt)} r="3" fill="#38bdf8" stroke="var(--panel)" strokeWidth="1.5" />
        {/* Y-axis labels */}
        <text x={PAD.left - 4} y={PAD.top + 4}  textAnchor="end" className="alt-axis-lbl">{maxAlt.toLocaleString()} ft</text>
        <text x={PAD.left - 4} y={PAD.top + iH} textAnchor="end" className="alt-axis-lbl">{minAlt.toLocaleString()} ft</text>
        {/* X-axis labels */}
        <text x={PAD.left}          y={H - 2} textAnchor="start" className="alt-axis-lbl">{hhmm(minT)}</text>
        <text x={W - PAD.right}     y={H - 2} textAnchor="end"   className="alt-axis-lbl">{hhmm(maxT)}</text>
      </svg>
    </div>
  )
}

function fmtDur(ms) {
  if (ms <= 0) return '0m'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function FlightDetail({ flight: f, onClose, airports, track, onAirportSelect, followMode, onToggleFollow, showTrack, onToggleTrack, on3D }) {
  const sq        = String(f.squawk)
  const emergency = EMERGENCY_SQUAWKS[sq]
  const source    = SOURCE_TYPES[f.source] ?? 'Unknown'
  const callsign  = f.callsign?.trim()

  // Parallel data fetches — all independent, all start immediately
  const acInfo       = useAircraftInfo(f.icao24)
  const route        = useRoute(callsign)
  const history      = useFlightHistory(f.icao24)
  const flightStatus = useFlightStatus(callsign)

  // When aircraft type is known, write to the shared cache so FlightLayer
  // can update this marker's icon on the next sync.
  useEffect(() => {
    if (acInfo?.ICAOTypeCode) setCachedType(f.icao24, acInfo.ICAOTypeCode)
  }, [acInfo, f.icao24])

  const copy = text => navigator.clipboard?.writeText(text).catch(() => {})

  // AeroDataBox ISO time → HH:MM tz (e.g. "2024-05-14 16:35+02:00")
  const fmtIso = s => {
    if (!s) return null
    try { return new Date(s.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) }
    catch { return s }
  }

  // Route: prefer schedule DB (adsbdb/OpenSky routes) → AeroDataBox → nothing.
  // Do NOT fall back to history.estDepartureAirport/estArrivalAirport — OpenSky's
  // trajectory-based estimates are unreliable and often wrong.
  const latest   = history?.latest
  const fromIcao = route?.route?.[0]                     ?? flightStatus?.departure?.airport ?? null
  const toIcao   = route?.route?.[route.route.length - 1] ?? flightStatus?.arrival?.airport  ?? null

  // Prefer AeroDataBox times when available (more precise), fall back to OpenSky history
  const depTime  = flightStatus?.departure?.actual   ?? flightStatus?.departure?.scheduled   ?? (latest?.firstSeen ? hhmm(latest.firstSeen) : null)
  const arrTime  = flightStatus?.arrival?.estimated  ?? flightStatus?.arrival?.scheduled     ?? (latest?.lastSeen  ? hhmm(latest.lastSeen)  : null)
  const depTimeDisplay = flightStatus ? fmtIso(depTime) : (latest?.firstSeen ? hhmm(latest.firstSeen) : null)
  const arrTimeDisplay = flightStatus ? fmtIso(arrTime) : (latest?.lastSeen  ? hhmm(latest.lastSeen)  : null)

  const depTerminal = flightStatus?.departure?.terminal
  const depGate     = flightStatus?.departure?.gate
  const arrTerminal = flightStatus?.arrival?.terminal
  const arrGate     = flightStatus?.arrival?.gate
  const fromInfo = airportMeta(airports, fromIcao)
  const toInfo   = airportMeta(airports, toIcao)

  // Great-circle distance (nm) from current position to destination
  const distNm = (() => {
    if (!toInfo || f.lat == null || f.lon == null) return null
    const R = 6371
    const dLat = (toInfo.lat - f.lat) * Math.PI / 180
    const dLon = (toInfo.lon - f.lon) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(f.lat * Math.PI / 180) * Math.cos(toInfo.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return Math.round(R * 2 * Math.asin(Math.sqrt(a)) * 0.539957)
  })()

  // Distance-based flight progress (accurate even when ETA is stale)
  const [progressPct, progressElapsed, progressRemaining] = useMemo(() => {
    if (!fromInfo || !toInfo || distNm == null || f.lat == null) return [null, null, null]

    // Total great-circle distance departure → arrival (nm)
    const R = 6371
    const dLat = (toInfo.lat - fromInfo.lat) * Math.PI / 180
    const dLon = (toInfo.lon - fromInfo.lon) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(fromInfo.lat * Math.PI / 180) * Math.cos(toInfo.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    const totalNm = R * 2 * Math.asin(Math.sqrt(a)) * 0.539957
    if (totalNm < 10) return [null, null, null]

    const pct = Math.min(100, Math.max(0, (totalNm - distNm) / totalNm * 100))

    // Elapsed from actual/scheduled departure
    let elapsed = null
    const depStr = flightStatus?.departure?.actual ?? flightStatus?.departure?.scheduled
    if (depStr) {
      try { elapsed = fmtDur(Math.max(0, Date.now() - new Date(depStr.replace(' ', 'T')).getTime())) }
      catch { /* ignore */ }
    }

    // Remaining from current speed + distance (live, not from stale ETA)
    let remaining = null
    const speedKts = f.speed != null ? f.speed * 1.94384 : 0
    if (speedKts > 50 && distNm > 0) {
      remaining = fmtDur(distNm / speedKts * 3_600_000)
    }

    return [pct, elapsed, remaining]
  }, [fromInfo, toInfo, distNm, f.lat, f.speed, flightStatus])

  return (
    <div className="flight-detail">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="fd-head">
        <div>
          <div className="fd-callsign">{callsign || f.icao24 || 'Unknown'}</div>
          <div className="fd-meta">
            <span className="fd-icao-badge">{f.icao24?.toUpperCase()}</span>
            <span className={`fd-status-pill fd-status-pill--${f.onGround ? 'ground' : 'air'}`}>
              <span className={`fd-status-dot fd-status-dot--${f.onGround ? 'ground' : 'air'}`} />
              {f.onGround ? 'On Ground' : 'Airborne'}
            </span>
          </div>
        </div>
        <button className="fd-close" onClick={onClose} title="Close (Esc)">✕</button>
      </div>

      {/* ── Emergency badge ─────────────────────────────────────────────── */}
      {emergency && (
        <div className="fd-emergency" style={{ '--ec': emergency.color }}>
          ⚠ {emergency.label} — Squawk {sq}
        </div>
      )}

      {/* ── Quick stats ─────────────────────────────────────────────────── */}
      <div className="fd-stats">
        <div className="fd-stat-card">
          <span className="fd-stat-val">{ft(f.alt)}</span>
          <span className="fd-stat-unit">ft</span>
        </div>
        <div className="fd-stat-card">
          <span className="fd-stat-val">{kt(f.speed)}</span>
          <span className="fd-stat-unit">kts</span>
        </div>
        <div className="fd-stat-card">
          <span className="fd-stat-val">{f.heading != null ? Math.round(f.heading) + '°' : '—'}</span>
          <span className="fd-stat-unit">hdg</span>
        </div>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="fd-actions">
        <button
          className={`fd-action${followMode ? ' fd-action--active' : ''}`}
          onClick={onToggleFollow}
          title="Auto-pan map to keep this flight centred"
        >
          <span className="fd-action-icon">⊙</span>
          Follow
        </button>
        <button
          className={`fd-action${showTrack === false ? ' fd-action--muted' : ''}`}
          onClick={onToggleTrack}
          title="Toggle flight path overlay"
        >
          <span className="fd-action-icon">╌</span>
          Route
        </button>
        <button
          className="fd-action"
          onClick={() => on3D?.({ flight: f, fromIcao, toIcao })}
          title="Open 3D globe view"
        >
          <span className="fd-action-icon">🌐</span>
          3D
        </button>
        <button
          className="fd-action"
          onClick={() => {
            const url = new URL(window.location.href)
            url.searchParams.set('icao24', f.icao24)
            navigator.clipboard?.writeText(url.toString())
          }}
          title="Copy shareable link to clipboard"
        >
          <span className="fd-action-icon">↗</span>
          Share
        </button>
      </div>

      {/* ── Route card — compact ICAO codes, click to fly to airport ───── */}
      <div className="fd-card">
        <div className="fd-card-label">Route</div>
        {(fromIcao || toIcao) ? (
          <div className="fd-rte-row">
            {/* Departure */}
            <button
              className={`fd-rte-node${fromInfo && onAirportSelect ? ' fd-rte-node--link' : ''}`}
              onClick={fromInfo && onAirportSelect ? () => onAirportSelect(fromInfo) : undefined}
              title={fromInfo ? `${fromInfo.name}${fromInfo.city ? ` · ${fromInfo.city}` : ''}` : undefined}
              disabled={!fromInfo || !onAirportSelect}
            >
              <span className="fd-rte-icao">{fromIcao ?? '—'}</span>
              <span className="fd-rte-role">DEP</span>
              {depTimeDisplay && <span className="fd-rte-time">{depTimeDisplay}</span>}
              {(depTerminal || depGate) && (
                <span className="fd-rte-gate">
                  {[depTerminal && `T${depTerminal}`, depGate && `G${depGate}`].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>

            {/* Connector arrow + distance */}
            <div className="fd-rte-line">
              <div className="fd-rte-dash" />
              <span className="fd-rte-icon">✈</span>
              <div className="fd-rte-dash" />
              {distNm != null && (
                <span className="fd-rte-dist">{distNm.toLocaleString()} nm</span>
              )}
            </div>

            {/* Arrival */}
            <button
              className={`fd-rte-node fd-rte-node--right${toInfo && onAirportSelect ? ' fd-rte-node--link' : ''}`}
              onClick={toInfo && onAirportSelect ? () => onAirportSelect(toInfo) : undefined}
              title={toInfo ? `${toInfo.name}${toInfo.city ? ` · ${toInfo.city}` : ''}` : undefined}
              disabled={!toInfo || !onAirportSelect}
            >
              <span className="fd-rte-icao">{toIcao ?? '—'}</span>
              <span className="fd-rte-role">ARR</span>
              {arrTimeDisplay && <span className="fd-rte-time">{arrTimeDisplay}</span>}
              {(arrTerminal || arrGate) && (
                <span className="fd-rte-gate">
                  {[arrTerminal && `T${arrTerminal}`, arrGate && `G${arrGate}`].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="fd-route-none">No route data for this aircraft</div>
        )}
        {route?.operatorCode && (
          <div className="fd-route-op">Operator: {route.operatorCode}
            {route.flightNumber ? ` · Flight ${route.flightNumber}` : ''}
          </div>
        )}

        {/* Flight progress bar */}
        {progressPct != null && (
          <div className="fd-progress">
            <div className="fd-progress-bar">
              <div className="fd-progress-fill" style={{ width: `${progressPct}%` }} />
              <div className="fd-progress-dot" style={{ left: `calc(${progressPct}% - 4px)` }} />
            </div>
            <div className="fd-progress-times">
              <span className="fd-progress-elapsed">{progressElapsed} elapsed</span>
              <span className="fd-progress-pct">{Math.round(progressPct)}%</span>
              <span className="fd-progress-remain">{progressRemaining} left</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Altitude profile ─────────────────────────────────────────────── */}
      <AltitudeProfile track={track} />

      {/* ── Aircraft info card ───────────────────────────────────────────── */}
      {acInfo && (
        <div className="fd-card">
          <div className="fd-card-label">Aircraft</div>
          <div className="fd-ac-grid">
            {acInfo.Registration && (
              <div className="fd-ac-item">
                <span className="fd-ac-key">Registration</span>
                <span className="fd-ac-val fd-mono">{acInfo.Registration}</span>
              </div>
            )}
            {acInfo.ICAOTypeCode && (
              <div className="fd-ac-item">
                <span className="fd-ac-key">ICAO Type</span>
                <span className="fd-ac-val fd-mono">{acInfo.ICAOTypeCode}</span>
              </div>
            )}
            {acInfo.Type && (
              <div className="fd-ac-item fd-ac-item--full">
                <span className="fd-ac-key">Aircraft Model</span>
                <span className="fd-ac-val">{acInfo.Type}</span>
              </div>
            )}
            {acInfo.RegisteredOwners && (
              <div className="fd-ac-item fd-ac-item--full">
                <span className="fd-ac-key">Operator</span>
                <span className="fd-ac-val">{acInfo.RegisteredOwners}</span>
              </div>
            )}
            {acInfo.Manufacturer && acInfo.Manufacturer !== acInfo.Type?.split(' ')[0] && (
              <div className="fd-ac-item fd-ac-item--full">
                <span className="fd-ac-key">Manufacturer</span>
                <span className="fd-ac-val">{acInfo.Manufacturer}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Aircraft photo ───────────────────────────────────────────────── */}
      <AircraftPhoto icao24={f.icao24} />

      {/* ── Detail rows ─────────────────────────────────────────────────── */}
      <div className="fd-body">
        <DetailRow label="Origin Country" value={f.origin} />
        <DetailRow label="Altitude"  value={f.alt   != null ? `${ft(f.alt)} ft (${Math.round(f.alt)} m)` : null} />
        <DetailRow label="Speed"     value={f.speed != null ? `${kt(f.speed)} kt (${Math.round(f.speed)} m/s)` : null} />
        <div className="fd-row">
          <span className="fd-key">Vert. Rate</span>
          <span className="fd-val"><VrIndicator vr={f.vertRate} /></span>
        </div>
        <DetailRow label="Squawk"      value={f.squawk} mono />
        <DetailRow label="SPI Active"  value={f.spi ? 'Yes' : null} />
        <DetailRow label="Data Source" value={source} />
        <DetailRow label="Position"    value={f.lat != null ? `${f.lat.toFixed(4)}°, ${f.lon.toFixed(4)}°` : null} mono />
        <DetailRow label="Last Seen"   value={hhmm(f.lastContact)} />
      </div>

      {/* ── Copy / action buttons ────────────────────────────────────────── */}
      <div className="fd-copy-row">
        <button className="btn-copy" onClick={() => copy(f.icao24)}>Copy ICAO</button>
        {callsign && (
          <button className="btn-copy" onClick={() => copy(callsign)}>Copy Callsign</button>
        )}
        {f.lat != null && (
          <button className="btn-copy" onClick={() => copy(`${f.lat},${f.lon}`)}>Copy Coords</button>
        )}
      </div>

    </div>
  )
}

function DetailRow({ label, value, mono = false }) {
  if (value == null || value === '') return null
  return (
    <div className="fd-row">
      <span className="fd-key">{label}</span>
      <span className={`fd-val${mono ? ' fd-mono' : ''}`}>{value}</span>
    </div>
  )
}
