import { useState } from 'react'
import EmergencyBanner from './EmergencyBanner'
import FilterPanel     from './FilterPanel'
import FlightList      from './FlightList'
import FlightDetail    from './FlightDetail'

export default function Sidebar({
  flights, totalFlights,
  selected, onSelect, onDeselect,
  filters, onFilterChange, onClearFilters, hasFilters,
  countries, airlines, emergencies,
  airports, track, onAirportSelect,
  followMode, onToggleFollow, showTrack, onToggleTrack, on3D,
  isSaved, onSaveFlight,
}) {
  const [tab, setTab] = useState(() => localStorage.getItem('fs_sidebarTab') || 'flights')
  const switchTab = t => { setTab(t); localStorage.setItem('fs_sidebarTab', t) }

  return (
    <aside className="sidebar">

      {/* Emergency alert strip */}
      <EmergencyBanner emergencies={emergencies} onSelect={onSelect} />

      {/* Detail view replaces the whole content area when a flight is selected */}
      {selected ? (
        <div className="sb-main">
          <FlightDetail
            flight={selected}
            onClose={onDeselect}
            airports={airports}
            track={track}
            onAirportSelect={onAirportSelect}
            followMode={followMode}
            onToggleFollow={onToggleFollow}
            showTrack={showTrack}
            onToggleTrack={onToggleTrack}
            on3D={on3D}
            isSaved={isSaved}
            onSave={onSaveFlight}
          />
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="sb-tabs">
            <button
              className={`sb-tab${tab === 'flights' ? ' sb-tab--active' : ''}`}
              onClick={() => switchTab('flights')}
            >
              ✈ Flights
            </button>
            <button
              className={`sb-tab${tab === 'filters' ? ' sb-tab--active' : ''}`}
              onClick={() => switchTab('filters')}
            >
              ⚙ Filters
              {hasFilters && (
                <>
                  <span className="sb-tab-dot" />
                  <span className="sb-filter-badge">{flights.length.toLocaleString()}</span>
                </>
              )}
            </button>
          </div>

          <div className="sb-main">
            {tab === 'flights' ? (
              <FlightList
                flights={flights}
                total={totalFlights}
                selected={selected}
                onSelect={onSelect}
              />
            ) : (
              <FilterPanel
                filters={filters}
                onChange={onFilterChange}
                onClear={onClearFilters}
                hasFilters={hasFilters}
                countries={countries}
                airlines={airlines}
              />
            )}
          </div>
        </>
      )}

    </aside>
  )
}
