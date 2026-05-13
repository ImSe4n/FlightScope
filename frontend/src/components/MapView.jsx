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

// ── Flight path polyline ──────────────────────────────────────────────────────
function TrackLayer({ track }) {
  const map    = useMap()
  const polyRef = useRef(null)

  useEffect(() => {
    if (polyRef.current) { map.removeLayer(polyRef.current); polyRef.current = null }
    if (!track || track.length < 2) return

    const pts = track.filter(p => p[1] != null && p[2] != null).map(p => [p[1], p[2]])
    if (pts.length < 2) return

    const poly = L.polyline(pts, {
      color:     '#06b6d4',
      weight:    2,
      opacity:   0.75,
      dashArray: '6, 5',
    })
    map.addLayer(poly)
    polyRef.current = poly

    return () => { if (polyRef.current) { map.removeLayer(polyRef.current); polyRef.current = null } }
  }, [track, map])

  return null
}

// ── Imperative flight layer ───────────────────────────────────────────────────
// Bypasses React's virtual DOM entirely for 8 000+ markers.
// Key perf trick: movers are batch-removed from the cluster, repositioned while
// outside it (no per-marker cluster recalculation), then batch-added back.
// Total cluster operations per refresh: removeLayers(stale) + removeLayers(movers) + addLayers(movers+new)  = 3.
function FlightLayer({ flights, onSelect }) {
  const map         = useMap()
  const clusterRef  = useRef(null)
  const markersRef  = useRef(new Map()) // icao24 → { marker, flight, prevBucket, prevSquawk }
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      chunkedLoading:    true,
      maxClusterRadius:  50,
      animate:           false,
      spiderfyOnMaxZoom: true,
    })
    map.addLayer(cluster)
    clusterRef.current = cluster
    return () => {
      map.removeLayer(cluster)
      clusterRef.current = null
      markersRef.current.clear()
    }
  }, [map])

  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return

    const existing  = markersRef.current
    const wantedSet = new Set(flights.map(f => f.icao24))

    // ── 1. Remove stale markers ───────────────────────────────────────────────
    const toRemove = []
    for (const [icao24, entry] of existing) {
      if (!wantedSet.has(icao24)) {
        toRemove.push(entry.marker)
        existing.delete(icao24)
      }
    }
    if (toRemove.length) cluster.removeLayers(toRemove)

    // ── 2. Identify movers — pull them out of the cluster in one batch op ─────
    //    Once outside the cluster, setLatLng is cheap (no internal cluster move).
    const movers    = []
    const moverSet  = new Set()
    for (const f of flights) {
      if (f.lat == null || f.lon == null) continue
      const entry = existing.get(f.icao24)
      if (!entry) continue
      const dl = Math.abs(f.lat  - entry.flight.lat)
      const dm = Math.abs(f.lon  - entry.flight.lon)
      if (dl > 0.001 || dm > 0.001) { movers.push(entry.marker); moverSet.add(entry.marker) }
    }
    if (movers.length) cluster.removeLayers(movers)

    // ── 3. Update existing markers / create new ones ──────────────────────────
    const toAdd = []
    for (const f of flights) {
      if (f.lat == null || f.lon == null) continue

      const isEmg     = Boolean(EMERGENCY_SQUAWKS[String(f.squawk)])
      const newBucket = Math.round((f.heading ?? 0) / 10) * 10
      const entry     = existing.get(f.icao24)

      if (entry) {
        if (moverSet.has(entry.marker)) {
          entry.marker.setLatLng([f.lat, f.lon]) // cheap — marker is outside cluster
          toAdd.push(entry.marker)
        }
        // Only rebuild icon when heading bucket or squawk changes
        if (newBucket !== entry.prevBucket || String(f.squawk) !== entry.prevSquawk) {
          entry.marker.setIcon(
            isEmg ? makeEmergencyIcon(f.heading, f.squawk) : makePlaneIcon(f.heading)
          )
          entry.prevBucket = newBucket
          entry.prevSquawk = String(f.squawk)
        }
        entry.flight = f
      } else {
        const icon     = isEmg ? makeEmergencyIcon(f.heading, f.squawk) : makePlaneIcon(f.heading)
        const marker   = L.marker([f.lat, f.lon], { icon })
        const newEntry = { marker, flight: f, prevBucket: newBucket, prevSquawk: String(f.squawk) }
        marker.on('click', e => {
          L.DomEvent.stopPropagation(e)
          onSelectRef.current(newEntry.flight)
        })
        existing.set(f.icao24, newEntry)
        toAdd.push(marker)
      }
    }

    if (toAdd.length) cluster.addLayers(toAdd)
  }, [flights])

  return null
}

// ── Main exported component ───────────────────────────────────────────────────
export default function MapView({ flights, airports, selected, flyTarget, mapLayer, onSelect, onDeselect, track }) {
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

        {/* Flight path polyline — renders below markers automatically (overlayPane vs markerPane) */}
        <TrackLayer track={track} />

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
