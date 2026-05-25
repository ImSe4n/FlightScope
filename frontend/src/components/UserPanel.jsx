import { useState, useEffect, useCallback } from 'react'
import { useAppAuth } from '../context/AuthContext'

const TABS = [
  { id: 'flights',  label: '✈ Flights'  },
  { id: 'airports', label: '⊕ Airports' },
  { id: 'routes',   label: '⇄ Routes'   },
  { id: 'settings', label: '⚙ Settings' },
]

export default function UserPanel({
  open, onClose,
  savedFlights, savedAirports, savedRoutes, settings,
  unsaveFlight, unsaveAirport, unsaveRoute, saveSettings,
  onFlightSelect, onAirportSelect, onRouteSelect,
  mapLayer, filters, allFlights,
}) {
  const { user } = useAppAuth()
  const [tab, setTab] = useState('flights')
  const [localSettings, setLocalSettings] = useState(settings)
  useEffect(() => { setLocalSettings(settings) }, [settings])

  if (!open) return null

  const handleSavePrefs = async () => {
    await saveSettings({
      mapLayer,
      hideGround: filters.hideGround,
      minAlt:     filters.minAlt,
      maxAlt:     filters.maxAlt,
      minSpeed:   filters.minSpeed,
      maxSpeed:   filters.maxSpeed,
    })
  }

  return (
    <div className="upanel-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="upanel">

        {/* Header */}
        <div className="upanel-head">
          <div>
            <div className="upanel-title">★ Saved</div>
            {user && <div className="upanel-sub">{user.email}</div>}
          </div>
          <button className="upanel-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="upanel-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`upanel-tab${tab === t.id ? ' upanel-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="upanel-body">
          {tab === 'flights' && (
            <TabFlights
              saved={savedFlights}
              allFlights={allFlights}
              onSelect={f => { onFlightSelect(f); onClose() }}
              onRemove={unsaveFlight}
            />
          )}
          {tab === 'airports' && (
            <TabAirports
              saved={savedAirports}
              onSelect={a => { onAirportSelect(a); onClose() }}
              onRemove={unsaveAirport}
            />
          )}
          {tab === 'routes' && (
            <TabRoutes
              saved={savedRoutes}
              onSelect={r => { onRouteSelect(r); onClose() }}
              onRemove={unsaveRoute}
            />
          )}
          {tab === 'settings' && (
            <TabSettings
              settings={settings}
              mapLayer={mapLayer}
              filters={filters}
              onSave={handleSavePrefs}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TabFlights({ saved, allFlights, onSelect, onRemove }) {
  if (!saved.length) {
    return <Empty>No saved flights yet. Open any flight and click <strong>★ Save</strong>.</Empty>
  }
  return (
    <ul className="ulist">
      {saved.map(f => {
        const live = allFlights?.find(a => a.icao24 === f.icao24)
        return (
          <li
            key={f.icao24}
            className={`ulist-item${live ? '' : ' ulist-item--offline'}`}
            onClick={() => live && onSelect(live)}
            title={live ? 'Click to locate on map' : 'Not currently tracked'}
          >
            <div className="ulist-info">
              <span className="ulist-code">{(f.callsign || f.icao24).trim()}</span>
              <span className="ulist-sub">{f.icao24.toUpperCase()}{live ? ' · Live' : ' · Not tracked'}</span>
            </div>
            <button className="ulist-rm" onClick={e => { e.stopPropagation(); onRemove(f.icao24) }} title="Remove">✕</button>
          </li>
        )
      })}
    </ul>
  )
}

function TabAirports({ saved, onSelect, onRemove }) {
  if (!saved.length) {
    return <Empty>No saved airports yet. Click <strong>☆</strong> next to an airport in the search dropdown.</Empty>
  }
  return (
    <ul className="ulist">
      {saved.map(a => (
        <li key={a.ident} className="ulist-item" onClick={() => onSelect(a)} title="Click to fly to airport">
          <div className="ulist-info">
            <span className="ulist-code">{a.iata || a.ident}</span>
            <span className="ulist-sub">{a.name}{a.city ? ` · ${a.city}` : ''}</span>
          </div>
          <button className="ulist-rm" onClick={e => { e.stopPropagation(); onRemove(a.ident) }} title="Remove">✕</button>
        </li>
      ))}
    </ul>
  )
}

function TabRoutes({ saved, onSelect, onRemove }) {
  if (!saved.length) {
    return <Empty>No saved routes yet. Search "LAX-JFK" and click <strong>☆ Save Route</strong>.</Empty>
  }
  return (
    <ul className="ulist">
      {saved.map(r => (
        <li key={`${r.dep}-${r.arr}`} className="ulist-item" onClick={() => onSelect(r)} title="Click to filter live flights">
          <div className="ulist-info">
            <span className="ulist-code">{r.dep} → {r.arr}</span>
            <span className="ulist-sub">Filter live flights on this route</span>
          </div>
          <button className="ulist-rm" onClick={e => { e.stopPropagation(); onRemove(r.dep, r.arr) }} title="Remove">✕</button>
        </li>
      ))}
    </ul>
  )
}

function TabSettings({ settings, mapLayer, filters, onSave }) {
  const [saveState, setSaveState] = useState('idle')  // idle | saving | saved | error
  const hasCloud = settings && Object.keys(settings).length > 0

  const handleSave = useCallback(async () => {
    setSaveState('saving')
    try {
      await onSave()
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 2500)
    }
  }, [onSave])

  const btnLabel = saveState === 'saving' ? 'Saving…'
    : saveState === 'saved'  ? '✓ Saved!'
    : saveState === 'error'  ? '✗ Save failed'
    : '↑ Save current preferences to cloud'

  return (
    <div className="usettings">
      <div className="usettings-section">Current session</div>
      <Row label="Map layer"       val={mapLayer || '—'} />
      <Row label="Hide ground"     val={filters.hideGround ? 'Yes' : 'No'} />
      {filters.minAlt   && <Row label="Min altitude" val={`${filters.minAlt} m`} />}
      {filters.maxAlt   && <Row label="Max altitude" val={`${filters.maxAlt} m`} />}
      {filters.minSpeed && <Row label="Min speed"    val={`${filters.minSpeed} m/s`} />}
      {filters.maxSpeed && <Row label="Max speed"    val={`${filters.maxSpeed} m/s`} />}

      <button
        className={`usettings-save${saveState === 'saved' ? ' usettings-save--ok' : saveState === 'error' ? ' usettings-save--err' : ''}`}
        onClick={handleSave}
        disabled={saveState === 'saving'}
      >
        {btnLabel}
      </button>

      {hasCloud && (
        <>
          <div className="usettings-section" style={{ marginTop: 16 }}>Saved in cloud</div>
          {Object.entries(settings).map(([k, v]) => (
            <Row key={k} label={k} val={String(v)} />
          ))}
        </>
      )}

      <div className="usettings-hint">
        Saved preferences are restored automatically on next login.
      </div>
    </div>
  )
}

function Row({ label, val }) {
  return (
    <div className="usettings-row">
      <span className="usettings-label">{label}</span>
      <span className="usettings-val">{val}</span>
    </div>
  )
}

function Empty({ children }) {
  return <div className="ulist-empty">{children}</div>
}
