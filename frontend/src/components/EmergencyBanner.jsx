import { EMERGENCY_SQUAWKS } from '../utils/constants'

export default function EmergencyBanner({ emergencies, onSelect }) {
  if (!emergencies.length) return null

  return (
    <div className="emergency-banner">
      <div className="emg-title">⚠ Emergency Squawks Active</div>
      {emergencies.map(f => {
        const sq   = String(f.squawk)
        const info = EMERGENCY_SQUAWKS[sq] ?? { label: 'Emergency', color: '#e53935' }
        return (
          <div
            key={f.icao24}
            className="emg-row"
            style={{ borderLeftColor: info.color }}
            onClick={() => onSelect(f)}
          >
            <span className="emg-callsign">{(f.callsign || f.icao24 || '—').trim()}</span>
            <span className="emg-type" style={{ color: info.color }}>
              {info.label} · {sq}
            </span>
          </div>
        )
      })}
    </div>
  )
}
