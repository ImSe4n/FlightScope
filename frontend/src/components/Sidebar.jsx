import EmergencyBanner from './EmergencyBanner'
import FilterPanel     from './FilterPanel'
import FlightList      from './FlightList'
import FlightDetail    from './FlightDetail'

export default function Sidebar({
  flights, totalFlights,
  selected, onSelect, onDeselect,
  filters, onFilterChange, onClearFilters, hasFilters,
  countries, emergencies,
}) {
  return (
    <aside className="sidebar">

      {/* Emergency alert — shown above everything else when active */}
      <EmergencyBanner emergencies={emergencies} onSelect={onSelect} />

      {/* Filters */}
      <FilterPanel
        filters={filters}
        onChange={onFilterChange}
        onClear={onClearFilters}
        hasFilters={hasFilters}
        countries={countries}
      />

      {/* Flight detail OR flight list */}
      <div className="sb-main">
        {selected ? (
          <FlightDetail flight={selected} onClose={onDeselect} />
        ) : (
          <FlightList
            flights={flights}
            total={totalFlights}
            selected={selected}
            onSelect={onSelect}
          />
        )}
      </div>

    </aside>
  )
}
