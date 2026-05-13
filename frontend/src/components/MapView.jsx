import { useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import { makePlaneIcon, makeEmergencyIcon, makeSelectedIcon, AIRPORT_ICON, altBucket } from '../utils/icons'
import { TILE_LAYERS, EMERGENCY_SQUAWKS } from '../utils/constants'
import { AirportPopup } from './Popups'

// ── Fly-to controller ─────────────────────────────────────────────────────────
function FlyTo({ target }) {
  const map  = useMap()
  const prev = useRef(null)
  useEffect(() => {
    if (target && target !== prev.current) {
      prev.current = target
      map.flyTo([target.lat, target.lon], 9, { duration: 1.1 })
    }
  }, [target, map])
  return null
}

// ── Deselect on map click ─────────────────────────────────────────────────────
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

    const poly = L.polyline(pts, { color: '#38bdf8', weight: 2, opacity: 0.7, dashArray: '6 5' })
    map.addLayer(poly)
    polyRef.current = poly
    return () => { if (polyRef.current) { map.removeLayer(polyRef.current); polyRef.current = null } }
  }, [track, map])

  return null
}

// ── Imperative flight layer ───────────────────────────────────────────────────
// PERFORMANCE STRATEGY:
//   • Viewport culling   — only manage markers inside getBounds().pad(1.0)
//     At zoom-6 this cuts 8 000+ markers to ~200; at global zoom clustering
//     handles the visual load anyway.
//   • Batch cluster ops  — removeLayers(stale) + removeLayers(movers) + addLayers(new+movers)
//     = 3 cluster recalculations per refresh instead of up to 8 000.
//   • Icon cache         — heading-bucket (10°) × alt-bucket (5) = ≤180 objects total.
//   • Ref-based sync     — flights stored in a ref so the sync callback is stable
//     (no deps beyond `map`), preventing spurious effect re-runs.
function FlightLayer({ flights, onSelect }) {
  const map        = useMap()
  const clusterRef = useRef(null)
  const markersRef = useRef(new Map()) // icao24 → { marker, flight, prevHb, prevSq, prevAb }
  const onSelRef   = useRef(onSelect)
  const flightsRef = useRef(flights)
  onSelRef.current   = onSelect
  flightsRef.current = flights

  // Create cluster group once
  useEffect(() => {
    const cg = L.markerClusterGroup({
      chunkedLoading:          true,
      maxClusterRadius:        55,
      animate:                 false,
      spiderfyOnMaxZoom:       true,
      disableClusteringAtZoom: 14,
    })
    map.addLayer(cg)
    clusterRef.current = cg
    return () => { map.removeLayer(cg); clusterRef.current = null; markersRef.current.clear() }
  }, [map])

  // Stable sync function — all mutable state accessed via refs
  const sync = useCallback(() => {
    const cg = clusterRef.current
    if (!cg) return

    const flist    = flightsRef.current
    const bounds   = map.getBounds().pad(1.0) // generous buffer for smooth panning
    const existing = markersRef.current

    // Build wanted set: only flights inside the padded viewport
    const wanted = new Map()
    for (const f of flist) {
      if (f.lat != null && f.lon != null && bounds.contains([f.lat, f.lon])) {
        wanted.set(f.icao24, f)
      }
    }

    // 1. Remove stale / out-of-viewport markers
    const toRemove = []
    for (const [id, e] of existing) {
      if (!wanted.has(id)) { toRemove.push(e.marker); existing.delete(id) }
    }
    if (toRemove.length) cg.removeLayers(toRemove)

    // 2. Identify movers — pull out of cluster for a cheap batch reposition
    const movers   = []
    const moverSet = new Set()
    for (const [id, f] of wanted) {
      const e = existing.get(id)
      if (!e) continue
      if (Math.abs(f.lat - e.flight.lat) > 0.001 || Math.abs(f.lon - e.flight.lon) > 0.001) {
        movers.push(e.marker)
        moverSet.add(e.marker)
      }
    }
    if (movers.length) cg.removeLayers(movers)

    // 3. Update existing markers / create new ones
    const toAdd = []
    for (const [id, f] of wanted) {
      const isEmg = Boolean(EMERGENCY_SQUAWKS[String(f.squawk)])
      const newHb = Math.round((f.heading ?? 0) / 10) * 10
      const newAb = altBucket(f.alt)
      const e     = existing.get(id)

      if (e) {
        if (moverSet.has(e.marker)) {
          e.marker.setLatLng([f.lat, f.lon]) // safe — removed from cluster
          toAdd.push(e.marker)
        }
        // Rebuild icon only when heading bucket, squawk, or alt tier changes
        if (newHb !== e.prevHb || String(f.squawk) !== e.prevSq || newAb !== e.prevAb) {
          e.marker.setIcon(isEmg ? makeEmergencyIcon(f.heading, f.squawk) : makePlaneIcon(f.heading, f.alt))
          e.prevHb = newHb; e.prevSq = String(f.squawk); e.prevAb = newAb
        }
        e.flight = f
      } else {
        const icon   = isEmg ? makeEmergencyIcon(f.heading, f.squawk) : makePlaneIcon(f.heading, f.alt)
        const marker = L.marker([f.lat, f.lon], { icon })
        const entry  = { marker, flight: f, prevHb: newHb, prevSq: String(f.squawk), prevAb: newAb }
        marker.on('click', ev => { L.DomEvent.stopPropagation(ev); onSelRef.current(entry.flight) })
        existing.set(id, entry)
        toAdd.push(marker)
      }
    }

    if (toAdd.length) cg.addLayers(toAdd)
  }, [map]) // map is stable — callback never changes

  // Sync when flight data refreshes
  useEffect(() => { sync() }, [flights, sync])

  // Sync when the user pans or zooms (viewport culling needs updated bounds)
  useMapEvents({ moveend: sync, zoomend: sync })

  return null
}

// ── Geolocate button ──────────────────────────────────────────────────────────
function GeolocateBtn() {
  const map = useMap()
  const locate = () => {
    navigator.geolocation?.getCurrentPosition(pos => {
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 8, { duration: 1.2 })
    })
  }
  return (
    <div className="map-ctrl-btn" title="Fly to my location" onClick={locate}>
      ◎
    </div>
  )
}

// ── Map controls overlay ──────────────────────────────────────────────────────
function MapControls() {
  const map = useMap()
  return (
    <div className="map-controls">
      <GeolocateBtn />
      <div className="map-ctrl-btn" title="Zoom in"  onClick={() => map.zoomIn()}>+</div>
      <div className="map-ctrl-btn" title="Zoom out" onClick={() => map.zoomOut()}>−</div>
    </div>
  )
}

// ── Altitude legend overlay ───────────────────────────────────────────────────
function AltLegend() {
  return (
    <div className="alt-legend">
      <div className="alt-legend-title">ALT</div>
      {[
        { color: '#f0f4f8', label: '>11 km' },
        { color: '#a78bfa', label: '6–11 km' },
        { color: '#38bdf8', label: '1.5–6 km' },
        { color: '#4ade80', label: '<1.5 km' },
        { color: '#7c93af', label: 'Unknown' },
      ].map(({ color, label }) => (
        <div key={label} className="alt-legend-row">
          <span className="alt-legend-dot" style={{ background: color }} />
          <span className="alt-legend-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main exported component ───────────────────────────────────────────────────
export default function MapView({ flights, airports, selected, flyTarget, mapLayer, onSelect, onDeselect, track }) {
  const layer = TILE_LAYERS[mapLayer] ?? TILE_LAYERS.dark

  return (
    <div className="map-wrap">
      <MapContainer
        center={[20, 0]}
        zoom={3}
        className="map"
        worldCopyJump
        zoomControl={false}
      >
        <FlyTo target={flyTarget} />
        <MapClickHandler onDeselect={onDeselect} />
        <MapControls />

        <TileLayer
          url={layer.url}
          attribution={layer.attribution}
          subdomains={layer.subdomains ?? 'abc'}
          maxZoom={19}
        />

        <TrackLayer track={track} />

        <FlightLayer flights={flights} onSelect={onSelect} />

        {selected?.lat && selected?.lon && (
          <Marker
            position={[selected.lat, selected.lon]}
            icon={makeSelectedIcon(selected.heading)}
            zIndexOffset={1000}
          />
        )}

        {airports.map(a => (
          <Marker key={a.ident} position={[a.lat, a.lon]} icon={AIRPORT_ICON}>
            <Popup maxWidth={340}>
              <AirportPopup a={a} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <AltLegend />
    </div>
  )
}
