import { EMERGENCY_SQUAWKS, SOURCE_TYPES } from '../utils/constants'
import AircraftPhoto from './AircraftPhoto'

export default function FlightDetail({ flight: f, onClose }) {
  const sq        = String(f.squawk)
  const emergency = EMERGENCY_SQUAWKS[sq]
  const source    = SOURCE_TYPES[f.source] ?? 'Unknown'
  const m = (v, unit, dp = 0) => v != null ? `${Number(v).toFixed(dp)} ${unit}` : null

  const copy = text => navigator.clipboard?.writeText(text).catch(() => {})

  return (
    <div className="flight-detail">

      {/* Header */}
      <div className="fd-head">
        <div>
          <div className="fd-callsign">{(f.callsign || f.icao24 || 'Unknown').trim()}</div>
          <div className="fd-icao">
            {f.icao24?.toUpperCase()}
            &nbsp;·&nbsp;
            <span style={{ color: f.onGround ? '#ef9a9a' : '#a5d6a7' }}>
              {f.onGround ? '⬜ On Ground' : '✈ Airborne'}
            </span>
          </div>
        </div>
        <button className="fd-close" onClick={onClose} title="Close (Esc)">✕</button>
      </div>

      {/* Emergency badge */}
      {emergency && (
        <div className="fd-emergency" style={{ '--ec': emergency.color }}>
          ⚠ {emergency.label} — Squawk {sq}
        </div>
      )}

      {/* Aircraft photo from Planespotters.net */}
      <AircraftPhoto icao24={f.icao24} />

      {/* Detail rows */}
      <div className="fd-body">
        <DetailRow label="Origin Country" value={f.origin} />
        <DetailRow label="Altitude"       value={m(f.alt, 'm')} />
        <DetailRow label="Geo Altitude"   value={m(f.geoAlt, 'm')} />
        <DetailRow label="Speed"          value={m(f.speed, 'm/s')} />
        <DetailRow label="Heading"        value={f.heading != null ? `${Math.round(f.heading)}°` : null} />
        <DetailRow label="Vertical Rate"  value={m(f.vertRate, 'm/s', 1)} />
        <DetailRow label="Squawk"         value={f.squawk} mono />
        <DetailRow label="SPI Active"     value={f.spi ? 'Yes' : null} />
        <DetailRow label="Data Source"    value={source} />
        <DetailRow
          label="Position"
          value={f.lat != null ? `${f.lat.toFixed(4)}°, ${f.lon.toFixed(4)}°` : null}
          mono
        />
        <DetailRow label="Last Contact"   value={f.lastContact} />
      </div>

      {/* Copy buttons */}
      <div className="fd-copy-row">
        <button className="btn-copy" onClick={() => copy(f.icao24)}>
          Copy ICAO
        </button>
        {f.callsign?.trim() && (
          <button className="btn-copy" onClick={() => copy(f.callsign.trim())}>
            Copy Callsign
          </button>
        )}
        {f.lat != null && (
          <button className="btn-copy" onClick={() => copy(`${f.lat},${f.lon}`)}>
            Copy Coords
          </button>
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
