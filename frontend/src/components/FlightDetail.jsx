import { EMERGENCY_SQUAWKS, SOURCE_TYPES } from '../utils/constants'
import AircraftPhoto from './AircraftPhoto'

const ft  = v => v != null ? Math.round(v * 3.28084).toLocaleString() : '—'
const kt  = v => v != null ? Math.round(v * 1.94384).toString()       : '—'
const fmt = (v, unit, dp = 0) => v != null ? `${Number(v).toFixed(dp)} ${unit}` : null

export default function FlightDetail({ flight: f, onClose }) {
  const sq        = String(f.squawk)
  const emergency = EMERGENCY_SQUAWKS[sq]
  const source    = SOURCE_TYPES[f.source] ?? 'Unknown'

  const copy = text => navigator.clipboard?.writeText(text).catch(() => {})

  return (
    <div className="flight-detail">

      {/* ── Header ── */}
      <div className="fd-head">
        <div>
          <div className="fd-callsign">{(f.callsign?.trim() || f.icao24 || 'Unknown')}</div>
          <div className="fd-meta">
            <span style={{ color: 'var(--txt-3)' }}>{f.icao24?.toUpperCase()}</span>
            <span className={`fd-status-pill fd-status-pill--${f.onGround ? 'ground' : 'air'}`}>
              <span className={`fd-status-dot fd-status-dot--${f.onGround ? 'ground' : 'air'}`} />
              {f.onGround ? 'On Ground' : 'Airborne'}
            </span>
          </div>
        </div>
        <button className="fd-close" onClick={onClose} title="Close (Esc)">✕</button>
      </div>

      {/* ── Emergency badge ── */}
      {emergency && (
        <div className="fd-emergency" style={{ '--ec': emergency.color }}>
          ⚠ {emergency.label} — Squawk {sq}
        </div>
      )}

      {/* ── Quick stat cards ── */}
      <div className="fd-stats">
        <div className="fd-stat-card">
          <span className="fd-stat-val">{ft(f.alt)}</span>
          <span className="fd-stat-unit">ft alt</span>
        </div>
        <div className="fd-stat-card">
          <span className="fd-stat-val">{kt(f.speed)}</span>
          <span className="fd-stat-unit">knots</span>
        </div>
        <div className="fd-stat-card">
          <span className="fd-stat-val">{f.heading != null ? Math.round(f.heading) + '°' : '—'}</span>
          <span className="fd-stat-unit">heading</span>
        </div>
      </div>

      {/* ── Aircraft photo ── */}
      <AircraftPhoto icao24={f.icao24} />

      {/* ── Detail rows ── */}
      <div className="fd-body">
        <DetailRow label="Origin"        value={f.origin} />
        <DetailRow label="Altitude"      value={f.alt    != null ? `${ft(f.alt)} ft  (${Math.round(f.alt)} m)` : null} />
        <DetailRow label="Speed"         value={f.speed  != null ? `${kt(f.speed)} kt  (${Math.round(f.speed)} m/s)` : null} />
        <DetailRow label="Vert. Rate"    value={fmt(f.vertRate, 'm/s', 1)} />
        <DetailRow label="Squawk"        value={f.squawk} mono />
        <DetailRow label="SPI Active"    value={f.spi ? 'Yes' : null} />
        <DetailRow label="Data Source"   value={source} />
        <DetailRow label="Position"      value={f.lat != null ? `${f.lat.toFixed(4)}°, ${f.lon.toFixed(4)}°` : null} mono />
        <DetailRow label="Last Contact"  value={f.lastContact != null ? new Date(f.lastContact * 1000).toLocaleTimeString() : null} />
      </div>

      {/* ── Action buttons ── */}
      <div className="fd-copy-row">
        <button className="btn-copy" onClick={() => copy(f.icao24)}>Copy ICAO</button>
        {f.callsign?.trim() && (
          <button className="btn-copy" onClick={() => copy(f.callsign.trim())}>Copy Callsign</button>
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
