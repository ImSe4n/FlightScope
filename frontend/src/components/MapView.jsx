import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import { makePlaneIcon, makeEmergencyIcon, makeSelectedIcon, AIRPORT_ICON } from '../utils/icons'
import { TILE_LAYERS, EMERGENCY_SQUAWKS } from '../utils/constants'
import { AirportPopup } from './Popups'

// ── Fly-to controller ─────────────────────────────────────────────────────────
function FlyTo({ target }) {
  const map  = useMap()
  const prev = useRef(null)
  useEffect(() => {
    if (target && target !== prev.current) {
      prev.current = target
      map.flyTo([target.lat, target.lon], 9, { duration: 1.2 })
    }
  }, [target, map])
  return null
}

// ── Click map background → deselect ──────────────────────────────────────────
function MapClickHandler({ onDeselect }) {
  useMapEvents({ click: onDeselect })
  return null
}

// ── Imperative flight layer ───────────────────────────────────────────────────
// Bypasses React's virtual DOM entirely for 8 000+ markers.
// Uses leaflet.markercluster directly so we can batch-add/remove layers,
// which is an order of magnitude faster than React reconciling <Marker> components.
function FlightLayer({ flights, onSelect }) {
  const map         = useMap()
  const clusterRef  = useRef(null)
  const markersRef  = useRef(new Map()) // icao24 → { marker, entry }
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect        // keep fresh without re-running effect

  // Create the cluster group once when the map is ready
  useEffect(() => {
    const cluster = L.markerClusterGroup({
      chunkedLoading:   true,
      maxClusterRadius: 50,
      animate:          false, // disabling animation gives a big speed boost
      spiderfyOnMaxZoom: true,
    })
    map.addLayer(cluster)
    clusterRef.current = cluster

    return () => {
      map.removeLayer(cluster)
      clusterRef.current = null
      markersRef.current.clear()
    }
  }, [map]) // run once per map instance

  // Sync markers whenever the filtered flight list changes
  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return

    const existing  = markersRef.current
    const wantedSet = new Set(flights.map(f => f.icao24))

    // ── Remove markers no longer in the filtered list ──
    const toRemove = []
    for (const [icao24, entry] of existing) {
      if (!wantedSet.has(icao24)) {
        toRemove.push(entry.marker)
        existing.delete(icao24)
      }
    }
    if (toRemove.length) cluster.removeLayers(toRemove)

    // ── Add new markers / update existing ones ──
    const toAdd = []
    for (const f of flights) {
      if (f.lat == null || f.lon == null) continue

      const isEmg = Boolean(EMERGENCY_SQUAWKS[String(f.squawk)])
      const icon  = isEmg ? makeEmergencyIcon(f.heading, f.squawk) : makePlaneIcon(f.heading)
      const entry = existing.get(f.icao24)

      if (entry) {
        // Update position + icon in-place — no DOM node created or destroyed
        entry.marker.setLatLng([f.lat, f.lon])
        entry.marker.setIcon(icon)
        entry.flight = f // keep fresh for click handler
      } else {
        const marker   = L.marker([f.lat, f.lon], { icon })
        const newEntry = { marker, flight: f }
        // Click calls onSelectRef.current so we never capture a stale callback
        marker.on('click', e => {
          L.DomEvent.stopPropagation(e)
          onSelectRef.current(newEntry.flight)
        })
        existing.set(f.icao24, newEntry)
        toAdd.push(marker)
      }
    }
    // addLayers() is a single batched operation — much faster than addLayer() in a loop
    if (toAdd.length) cluster.addLayers(toAdd)
  }, [flights]) // onSelect intentionally omitted — accessed via ref above

  return null
}

// ── Main exported component ───────────────────────────────────────────────────
export default function MapView({ flights, airports, selected, flyTarget, mapLayer, onSelect, onDeselect }) {
  const layer = TILE_LAYERS[mapLayer] ?? TILE_LAYERS.dark

  return (
    <div className="map-wrap">
      <MapContainer center={[20, 0]} zoom={3} className="map" worldCopyJump>
        <FlyTo target={flyTarget} />
        <MapClickHandler onDeselect={onDeselect} />

        <TileLayer
          url={layer.url}
          attribution={layer.attribution}
          subdomains={layer.subdomains ?? 'abc'}
          maxZoom={19}
        />

        {/* Imperative layer — zero React overhead for thousands of flight markers */}
        <FlightLayer flights={flights} onSelect={onSelect} />

        {/* Selected flight marker — outside the cluster so it's always visible */}
        {selected?.lat && selected?.lon && (
          <Marker
            position={[selected.lat, selected.lon]}
            icon={makeSelectedIcon(selected.heading)}
            zIndexOffset={1000}
          />
        )}

        {/* Airport markers — only a handful, React components are fine here */}
        {airports.map(a => (
          <Marker key={a.ident} position={[a.lat, a.lon]} icon={AIRPORT_ICON}>
            <Popup maxWidth={340}>
              <AirportPopup a={a} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
