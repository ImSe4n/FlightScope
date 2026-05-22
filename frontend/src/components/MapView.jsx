import { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import { makePlaneIcon, makeEmergencyIcon, makeSelectedIcon, AIRPORT_ICON, altBucket, altColor } from '../utils/icons'
import { getCachedType, setCachedType } from '../utils/aircraftTypes'
import { TILE_LAYERS, EMERGENCY_SQUAWKS } from '../utils/constants'
import { AirportPopup } from './Popups'

// ── Fly-to controller ─────────────────────────────────────────────────────────
function FlyTo({ target }) {
  const map  = useMap()
  const prev = useRef(null)
  useEffect(() => {
    if (target && target !== prev.current) {
      prev.current = target
      map.flyTo([target.lat, target.lon], target.zoom ?? 9, { duration: 1.1 })
    }
  }, [target, map])
  return null
}

// ── Follow mode — continuously pans to selected flight ────────────────────────
function FollowMode({ selectedPos, active }) {
  const map     = useMap()
  const prevRef = useRef(null)

  useEffect(() => {
    if (!active || !selectedPos?.lat || !selectedPos?.lon) return
    const pos = [selectedPos.lat, selectedPos.lon]
    const prev = prevRef.current
    if (prev && Math.abs(pos[0] - prev[0]) < 0.0002 && Math.abs(pos[1] - prev[1]) < 0.0002) return
    prevRef.current = pos
    map.panTo(pos, { animate: true, duration: 0.4 })
  }, [selectedPos, active, map])

  return null
}

// ── Deselect on map click ─────────────────────────────────────────────────────
function MapClickHandler({ onDeselect }) {
  useMapEvents({ click: onDeselect })
  return null
}

// ── Flight path — one segment per point pair, coloured by altitude ────────────
function TrackLayer({ track, selected }) {
  const map      = useMap()
  const segsRef  = useRef([])
  const extRef   = useRef(null)
  const selRef   = useRef(selected)
  const trackRef = useRef(track)
  selRef.current   = selected
  trackRef.current = track

  // Render coloured historical segments whenever track data changes
  useEffect(() => {
    segsRef.current.forEach(s => map.removeLayer(s))
    segsRef.current = []

    if (!track || track.length < 2) return
    const valid = track.filter(p => p[1] != null && p[2] != null)
    if (valid.length < 2) return

    for (let i = 0; i < valid.length - 1; i++) {
      const [t1, lat1, lon1, alt1] = valid[i]
      const [t2, lat2, lon2]       = valid[i + 1]
      if (t2 - t1 > 900) continue
      const seg = L.polyline([[lat1, lon1], [lat2, lon2]], {
        color: altColor(alt1), weight: 3, opacity: 0.85,
      })
      seg.addTo(map)
      segsRef.current.push(seg)
    }

    return () => { segsRef.current.forEach(s => map.removeLayer(s)); segsRef.current = [] }
  }, [track, map])

  // Imperatively update the dashed extension every 500 ms — computes DR fresh from
  // Date.now() so it stays in sync with the moving plane without relying on React renders
  useEffect(() => {
    const update = () => {
      const f     = selRef.current
      const trk   = trackRef.current
      const valid = trk?.filter(p => p[1] != null && p[2] != null)
      const last  = valid?.at(-1)

      if (!last || !f?.lat || !f?.lon) {
        if (extRef.current) { map.removeLayer(extRef.current); extRef.current = null }
        return
      }

      let lat = f.lat, lon = f.lon
      if (!f.onGround && f.speed && f.heading != null && f.timePos != null) {
        const dt     = Math.min(Math.max(0, Date.now() / 1000 - f.timePos), 300)
        const s      = dt * f.speed
        const hdR    = f.heading * (Math.PI / 180)
        const cosLat = Math.cos(f.lat * (Math.PI / 180)) || 1e-9
        lat = f.lat + (s * Math.cos(hdR) / 6_371_000) * (180 / Math.PI)
        lon = f.lon + (s * Math.sin(hdR) / (6_371_000 * cosLat)) * (180 / Math.PI)
      }

      const latlngs = [[last[1], last[2]], [lat, lon]]
      const extColor = altColor(last[3])
      if (extRef.current) {
        extRef.current.setLatLngs(latlngs)
        extRef.current.setStyle({ color: extColor })
      } else {
        extRef.current = L.polyline(latlngs, {
          color: extColor, weight: 3, opacity: 0.7, dashArray: '7 5',
        }).addTo(map)
      }
    }

    update()
    const id = setInterval(update, 500)
    return () => {
      clearInterval(id)
      if (extRef.current) { map.removeLayer(extRef.current); extRef.current = null }
    }
  }, [map])

  return null
}

// ── Day/Night terminator (native math, no external package) ──────────────────
function _sunPosition(date) {
  const D = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000
  const g = (357.529 + 0.98560028 * D) * (Math.PI / 180)
  const Lsun = (280.459 + 0.98564736 * D + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180)
  const e = (23.439 - 3.6e-7 * D) * (Math.PI / 180)
  const sinDec = Math.sin(e) * Math.sin(Lsun)
  const RA = Math.atan2(Math.cos(e) * Math.sin(Lsun), Math.cos(Lsun))
  const GMST = (18.697374558 + 24.06570982441908 * D) % 24
  const sunLon = ((RA * 12 / Math.PI - GMST) * 15 + 540) % 360 - 180
  return { lat: Math.asin(sinDec) * (180 / Math.PI), lon: sunLon }
}

function _terminatorPoints(date) {
  const { lat: sunLat, lon: sunLon } = _sunPosition(date)
  if (Math.abs(sunLat) < 0.01) return null
  const decRad = sunLat * (Math.PI / 180)
  const lonRad = sunLon * (Math.PI / 180)
  const pts = []
  for (let i = 0; i <= 360; i++) {
    const lam = (i - 180) * (Math.PI / 180) - lonRad
    const latT = Math.atan(-Math.cos(lam) / Math.tan(decRad)) * (180 / Math.PI)
    pts.push([latT, i - 180])
  }
  const pole = sunLat > 0 ? -90 : 90
  return [[pole, -180], ...pts, [pole, 180]]
}

function TerminatorLayer() {
  const map    = useMap()
  const polyRef = useRef(null)

  const draw = useCallback(() => {
    const pts = _terminatorPoints(new Date())
    if (!pts) return
    if (polyRef.current) {
      polyRef.current.setLatLngs(pts)
    } else {
      polyRef.current = L.polygon(pts, {
        color: 'none', weight: 0, fillColor: '#001530', fillOpacity: 0.22,
      }).addTo(map)
    }
  }, [map])

  useEffect(() => {
    draw()
    const id = setInterval(draw, 60_000)
    return () => {
      clearInterval(id)
      if (polyRef.current) { map.removeLayer(polyRef.current); polyRef.current = null }
    }
  }, [draw, map])

  return null
}

// ── ATC / FIR boundaries (VATSIM data) ───────────────────────────────────────
let _atcCache = null
let _atcFetching = false

function ATCBoundsLayer() {
  const map      = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    const addLayer = data => {
      if (layerRef.current || !data) return
      layerRef.current = L.geoJSON(data, {
        style: { color: '#38bdf8', weight: 0.8, opacity: 0.35, fill: false },
      }).addTo(map)
    }

    if (_atcCache) {
      addLayer(_atcCache)
    } else if (!_atcFetching) {
      _atcFetching = true
      fetch('https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson')
        .then(r => r.json())
        .then(d => { _atcCache = d; _atcFetching = false; addLayer(d) })
        .catch(() => { _atcFetching = false })
    }

    return () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    }
  }, [map])

  return null
}

// ── RainViewer radar overlay (free, no key) ───────────────────────────────────
function RadarLayer() {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let mounted = true
    const load = () =>
      fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then(r => r.json())
        .then(d => {
          const ts = d.radar?.past?.at(-1)?.time
          if (ts && mounted) setUrl(`https://tilecache.rainviewer.com/v2/radar/${ts}/512/{z}/{x}/{y}/4/1_1.png`)
        })
        .catch(() => {})

    load()
    const id = setInterval(load, 300_000) // refresh every 5 min
    return () => { mounted = false; clearInterval(id) }
  }, [])

  if (!url) return null
  return <TileLayer url={url} opacity={0.55} zIndex={450} tms={false} />
}

// ── Lazy aircraft-type enrichment (for OpenSky flights that have no acType) ───
// Module-level so the sets persist across re-renders and don't cause loops.
const _enriched  = new Set()
const _enriching = new Set()

function _enrichBatch(ids, onDone) {
  const toFetch = ids.filter(id => !_enriched.has(id) && !_enriching.has(id)).slice(0, 10)
  if (!toFetch.length) return
  toFetch.forEach(id => _enriching.add(id))
  let pending = toFetch.length
  const finish = () => { if (--pending === 0) onDone() }
  for (const id of toFetch) {
    fetch(`/api/aircraft/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ICAOTypeCode) setCachedType(id, d.ICAOTypeCode) })
      .catch(() => {})
      .finally(() => { _enriched.add(id); _enriching.delete(id); finish() })
  }
}

// ── Imperative flight layer ───────────────────────────────────────────────────
const FlightLayer = memo(function FlightLayer({ flights, onSelect }) {
  const map        = useMap()
  const clusterRef = useRef(null)
  const markersRef = useRef(new Map())
  const onSelRef   = useRef(onSelect)
  const flightsRef = useRef(flights)
  onSelRef.current   = onSelect
  flightsRef.current = flights

  useEffect(() => {
    const cg = L.markerClusterGroup({
      chunkedLoading:          true,
      chunkedLoadingSize:      300,   // process 300 markers per frame for faster initial load
      chunkedLoadingDelay:     16,    // ~60 fps cadence
      maxClusterRadius:        55,
      animate:                 false,
      spiderfyOnMaxZoom:       true,
      disableClusteringAtZoom: 14,
    })
    map.addLayer(cg)
    clusterRef.current = cg
    return () => { map.removeLayer(cg); clusterRef.current = null; markersRef.current.clear() }
  }, [map])

  // Sync flight markers to the cluster group — no bounds filter so pan/zoom never triggers
  // expensive add/remove cycles; Leaflet.markercluster handles viewport culling natively.
  const sync = useCallback(() => {
    const cg = clusterRef.current
    if (!cg) return

    const flist    = flightsRef.current
    const existing = markersRef.current

    const wanted = new Map()
    for (const f of flist) {
      if (f.lat != null && f.lon != null) wanted.set(f.icao24, f)
    }

    const toRemove = []
    for (const [id, e] of existing) {
      if (!wanted.has(id)) { toRemove.push(e.marker); existing.delete(id) }
    }
    if (toRemove.length) cg.removeLayers(toRemove)

    // Kick off background type lookups for OpenSky flights (no acType field)
    const untyped = []
    for (const [id, f] of wanted) {
      if (!f.acType && getCachedType(id) === 'default') untyped.push(id)
    }
    if (untyped.length) _enrichBatch(untyped, sync)

    const toAdd = []
    for (const [id, f] of wanted) {
      const isEmg  = Boolean(EMERGENCY_SQUAWKS[String(f.squawk)])
      const newHb  = Math.round((f.heading ?? 0) / 10) * 10
      const newAb  = altBucket(f.alt)
      if (f.acType) setCachedType(id, f.acType)
      const newCat = getCachedType(id)
      const newCs  = f.callsign || ''
      const e      = existing.get(id)

      if (e) {
        // Skip setLatLng when position unchanged — avoids triggering cluster recomputation
        // for stationary aircraft (ground traffic, parked planes, etc.)
        if (f.lat !== e.flight.lat || f.lon !== e.flight.lon) {
          e.marker.setLatLng([f.lat, f.lon])
        }
        e.flight = f
        if (newHb !== e.prevHb || String(f.squawk) !== e.prevSq || newAb !== e.prevAb || newCat !== e.prevCat || newCs !== e.prevCs) {
          e.marker.setIcon(isEmg ? makeEmergencyIcon(f.heading, f.squawk) : makePlaneIcon(f.heading, f.alt, newCat, newCs))
          e.prevHb = newHb; e.prevSq = String(f.squawk); e.prevAb = newAb; e.prevCat = newCat; e.prevCs = newCs
        }
      } else {
        const icon   = isEmg ? makeEmergencyIcon(f.heading, f.squawk) : makePlaneIcon(f.heading, f.alt, newCat, newCs)
        const marker = L.marker([f.lat, f.lon], { icon })
        const entry  = { marker, flight: f, prevHb: newHb, prevSq: String(f.squawk), prevAb: newAb, prevCat: newCat, prevCs: newCs }
        marker.on('click', ev => { L.DomEvent.stopPropagation(ev); onSelRef.current(entry.flight) })
        existing.set(id, entry)
        toAdd.push(marker)
      }
    }

    if (toAdd.length) cg.addLayers(toAdd)
  }, [])

  // Imperative DR timer — only updates markers that are individually visible on the map
  // (not hidden inside a cluster bubble). At low zoom almost every marker is clustered,
  // so getVisibleParent quickly skips them with zero DOM work.
  // The zoom guard is a cheap early-out that avoids even the loop at global view.
  useEffect(() => {
    const id = setInterval(() => {
      const cg = clusterRef.current
      if (!cg || map.getZoom() < 7) return
      const nowSec = Date.now() / 1000
      for (const [, entry] of markersRef.current) {
        // Skip clustered markers — setLatLng on them triggers cluster recomputation for no visual gain
        if (cg.getVisibleParent(entry.marker) !== entry.marker) continue
        const f = entry.flight
        if (f.onGround || !f.speed || f.heading == null || f.lat == null || !f.timePos) continue
        const dt = Math.min(Math.max(0, nowSec - f.timePos), 300)
        if (dt <= 0) continue
        const s      = dt * f.speed
        const hdR    = f.heading * (Math.PI / 180)
        const cosLat = Math.cos(f.lat * (Math.PI / 180)) || 1e-9
        const dLat   = (s * Math.cos(hdR) / 6_371_000) * (180 / Math.PI)
        const dLon   = (s * Math.sin(hdR) / (6_371_000 * cosLat)) * (180 / Math.PI)
        entry.marker.setLatLng([f.lat + dLat, f.lon + dLon])
      }
    }, 500)
    return () => clearInterval(id)
  }, [map])

  useEffect(() => { sync() }, [flights, sync])

  return null
})

// ── Airport layer — zoom-based tier filtering ─────────────────────────────────
function AirportLayer({ airports, liveFlights, onFlightSelect }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })

  const visible = useMemo(
    () => zoom <= 3 ? airports.filter(a => a.tier === 1) : airports,
    [airports, zoom],
  )

  return <>{visible.map(a => (
    <AirportMarker key={a.ident} a={a} liveFlights={liveFlights} onFlightSelect={onFlightSelect} />
  ))}</>
}

// ── Airport marker with lazy-loaded enrichment ────────────────────────────────
const AirportMarker = memo(function AirportMarker({ a, liveFlights, onFlightSelect }) {
  const [detail,    setDetail]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [loadError, setLoadError] = useState(false)
  const triggered = useRef(false)

  const handleClick = useCallback(() => {
    if (triggered.current && !loadError) return
    triggered.current = true
    setLoading(true)
    setLoadError(false)
    fetch(`/api/airport/${a.ident}`)
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false) })
      .catch(() => { setLoading(false); setLoadError(true); triggered.current = false })
  }, [a.ident, loadError])

  const merged = detail ? { ...a, ...detail } : a

  return (
    <Marker
      position={[a.lat, a.lon]}
      icon={AIRPORT_ICON}
      eventHandlers={{ click: handleClick }}
    >
      <Popup maxWidth={380}>
        <AirportPopup a={merged} loading={loading} loadError={loadError} liveFlights={liveFlights} onFlightSelect={onFlightSelect} />
      </Popup>
    </Marker>
  )
})

// ── Geolocate button ──────────────────────────────────────────────────────────
function GeolocateBtn() {
  const map = useMap()
  const locate = () => {
    navigator.geolocation?.getCurrentPosition(pos => {
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 8, { duration: 1.2 })
    })
  }
  return <div className="map-ctrl-btn" title="Fly to my location" onClick={locate}>◎</div>
}

// ── Zoom-to-fit button — fits all currently visible flights in viewport ───────
function ZoomToFitBtn({ flights }) {
  const map = useMap()
  const fit = useCallback(() => {
    const pts = flights.filter(f => f.lat != null && f.lon != null)
    if (!pts.length) return
    map.fitBounds(L.latLngBounds(pts.map(f => [f.lat, f.lon])), { padding: [50, 50], maxZoom: 8 })
  }, [flights, map])
  return <div className="map-ctrl-btn" title="Zoom to fit all flights" onClick={fit}>⊡</div>
}

// ── Map controls overlay ──────────────────────────────────────────────────────
function MapControls({ flights }) {
  const map = useMap()
  return (
    <div className="map-controls">
      <GeolocateBtn />
      <ZoomToFitBtn flights={flights} />
      <div className="map-ctrl-btn" title="Zoom in"  onClick={() => map.zoomIn()}>+</div>
      <div className="map-ctrl-btn" title="Zoom out" onClick={() => map.zoomOut()}>−</div>
    </div>
  )
}

// ── Altitude legend ───────────────────────────────────────────────────────────
function AltLegend() {
  return (
    <div className="alt-legend">
      <div className="alt-legend-title">ALT</div>
      {[
        { color: '#f0f4f8', label: '>11 km'   },
        { color: '#a78bfa', label: '6–11 km'  },
        { color: '#38bdf8', label: '1.5–6 km' },
        { color: '#4ade80', label: '<1.5 km'  },
        { color: '#7c93af', label: 'Unknown'  },
      ].map(({ color, label }) => (
        <div key={label} className="alt-legend-row">
          <span className="alt-legend-dot" style={{ background: color }} />
          <span className="alt-legend-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Selected-flight marker ────────────────────────────────────────────────────
function SelectedMarker({ selectedPos, selectedCat }) {
  if (!selectedPos?.lat || !selectedPos?.lon) return null
  return (
    <Marker
      position={[selectedPos.lat, selectedPos.lon]}
      icon={makeSelectedIcon(selectedPos.heading, selectedCat)}
      zIndexOffset={1000}
    />
  )
}

// ── Overlay control panel (outside MapContainer) ──────────────────────────────
function Toggle({ on, onChange, label }) {
  return (
    <label className="ov-toggle">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      <span className="ov-toggle-track"><span className="ov-toggle-thumb" /></span>
      <span className="ov-toggle-label">{label}</span>
    </label>
  )
}

function OverlayPanel({ overlays, setOverlays, onClose }) {
  return (
    <div className="ov-panel">
      <div className="ov-panel-header">
        <span className="ov-panel-title">Map Layers</span>
        <button className="ov-panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="ov-section">
        <div className="ov-section-title">Overlays</div>
        <Toggle
          on={overlays.terminator}
          onChange={v => setOverlays(p => ({ ...p, terminator: v }))}
          label="Day / Night line"
        />
        <Toggle
          on={overlays.atcBounds}
          onChange={v => setOverlays(p => ({ ...p, atcBounds: v }))}
          label="ATC / FIR boundaries"
        />
        <Toggle
          on={overlays.radar}
          onChange={v => setOverlays(p => ({ ...p, radar: v }))}
          label="Weather radar (RainViewer)"
        />
      </div>
    </div>
  )
}

// ── Main exported component ───────────────────────────────────────────────────
export default function MapView({ flights, airports, selected, selectedPos, liveFlights, flyTarget, mapLayer, onSelect, onFlightSelect, onDeselect, track, followMode }) {
  const layer = TILE_LAYERS[mapLayer] ?? TILE_LAYERS.dark

  const [overlays, setOverlays] = useState(() => {
    try {
      const s = localStorage.getItem('fs_overlays')
      return s ? { terminator: false, atcBounds: false, radar: false, ...JSON.parse(s) }
               : { terminator: false, atcBounds: false, radar: false }
    } catch { return { terminator: false, atcBounds: false, radar: false } }
  })

  useEffect(() => {
    localStorage.setItem('fs_overlays', JSON.stringify(overlays))
  }, [overlays])
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)

  // Exclude selected flight from cluster layer (SelectedMarker renders it separately)
  const layerFlights = useMemo(
    () => selected ? flights.filter(f => f.icao24 !== selected.icao24) : flights,
    [flights, selected],
  )
  const selectedCat = selected ? getCachedType(selected.icao24) : 'default'

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
        <MapControls flights={flights} />
        <FollowMode selectedPos={selectedPos} active={followMode} />

        <TileLayer
          url={layer.url}
          attribution={layer.attribution}
          subdomains={layer.subdomains ?? 'abc'}
          maxZoom={19}
        />
        {/* Hybrid labels overlay */}
        {layer.overlay && (
          <TileLayer url={layer.overlay} subdomains="abc" maxZoom={19} zIndex={250} />
        )}

        {overlays.terminator && <TerminatorLayer />}
        {overlays.atcBounds  && <ATCBoundsLayer />}
        {overlays.radar      && <RadarLayer />}

        <TrackLayer track={track} selected={selected} />
        <FlightLayer flights={layerFlights} onSelect={onSelect} />
        <SelectedMarker selectedPos={selectedPos} selectedCat={selectedCat} />
        <AirportLayer airports={airports} liveFlights={liveFlights} onFlightSelect={onFlightSelect} />
      </MapContainer>

      {/* Layer / overlay control */}
      <div className="ov-ctrl">
        <button
          className={`ov-ctrl-btn${layerPanelOpen ? ' ov-ctrl-btn--active' : ''}`}
          title="Map layers"
          onClick={() => setLayerPanelOpen(o => !o)}
        >
          ☰
        </button>
        {layerPanelOpen && (
          <OverlayPanel
            overlays={overlays}
            setOverlays={setOverlays}
            onClose={() => setLayerPanelOpen(false)}
          />
        )}
      </div>

      <AltLegend />
    </div>
  )
}
