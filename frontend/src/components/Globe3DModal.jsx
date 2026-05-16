import { useRef, useEffect, useMemo, useCallback } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'

function airportMeta(airports, code) {
  if (!code || !airports?.length) return null
  return airports.find(a => a.ident === code || a.iata === code) ?? null
}

// ── Procedural 3D airplane model ──────────────────────────────────────────────
function makeAirplane() {
  const group = new THREE.Group()

  const bodyMat = new THREE.MeshPhongMaterial({ color: 0xeff6ff, shininess: 120, side: THREE.DoubleSide })
  const wingMat = new THREE.MeshPhongMaterial({ color: 0xc5d8e8, shininess: 80,  side: THREE.DoubleSide })
  const tailMat = new THREE.MeshPhongMaterial({ color: 0x38bdf8, shininess: 130, side: THREE.DoubleSide })
  const engMat  = new THREE.MeshPhongMaterial({ color: 0x8aa0b0, shininess: 90,  side: THREE.DoubleSide })

  // ── Fuselage ──────────────────────────────────────────────────────────────
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 2.6, 12), bodyMat)
  fuse.rotation.z = Math.PI / 2
  group.add(fuse)

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 12), bodyMat)
  nose.rotation.z = -Math.PI / 2
  nose.position.x = 1.575
  group.add(nose)

  // Rear taper
  const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.10, 0.9, 12), bodyMat)
  rear.rotation.z = Math.PI / 2
  rear.position.x = -1.65
  group.add(rear)

  // ── Main wings (swept, tapered) ───────────────────────────────────────────
  function makeWing(side) {
    const s   = side // +1 right, -1 left
    const shp = new THREE.Shape()
    shp.moveTo(0.35,  0)
    shp.lineTo(0.5,   s * 0.01)
    shp.lineTo(0.0,   s * 1.45)   // leading edge tip
    shp.lineTo(-0.55, s * 1.45)   // trailing edge tip
    shp.lineTo(-0.85, 0)          // trailing edge root
    shp.closePath()
    const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.04, bevelEnabled: false })
    const m   = new THREE.Mesh(geo, wingMat)
    m.rotation.x = Math.PI / 2 * s
    m.position.set(0.2, 0, 0)
    return m
  }
  group.add(makeWing( 1))
  group.add(makeWing(-1))

  // ── Winglets ──────────────────────────────────────────────────────────────
  function makeWinglet(side) {
    const s   = side
    const shp = new THREE.Shape()
    shp.moveTo(0, 0)
    shp.lineTo(0, s * 0.28)
    shp.lineTo(-0.14, s * 0.28)
    shp.lineTo(-0.22, 0)
    shp.closePath()
    const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.025, bevelEnabled: false })
    const m   = new THREE.Mesh(geo, tailMat)
    // Sit at wing tip: x≈-0.55, z≈side*1.45
    m.rotation.y = Math.PI / 2
    m.rotation.x = Math.PI / 2 * s
    m.position.set(-0.35, 0, s * 1.46)
    return m
  }
  group.add(makeWinglet( 1))
  group.add(makeWinglet(-1))

  // ── Horizontal stabilizer (tail plane) ───────────────────────────────────
  function makeStab(side) {
    const s   = side
    const shp = new THREE.Shape()
    shp.moveTo(0.1,   0)
    shp.lineTo(0.1,   s * 0.01)
    shp.lineTo(-0.05, s * 0.52)
    shp.lineTo(-0.28, s * 0.52)
    shp.lineTo(-0.38, 0)
    shp.closePath()
    const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.025, bevelEnabled: false })
    const m   = new THREE.Mesh(geo, wingMat)
    m.rotation.x = Math.PI / 2 * s
    m.position.set(-1.65, 0, 0)
    return m
  }
  group.add(makeStab( 1))
  group.add(makeStab(-1))

  // ── Vertical fin ─────────────────────────────────────────────────────────
  const finShp = new THREE.Shape()
  finShp.moveTo(0,     0)
  finShp.lineTo(0.08,  0.55)
  finShp.lineTo(-0.05, 0.55)
  finShp.lineTo(-0.38, 0)
  finShp.closePath()
  const fin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(finShp, { depth: 0.025, bevelEnabled: false }),
    tailMat,
  )
  fin.rotation.x  = -Math.PI / 2
  fin.rotation.y  =  Math.PI / 2
  fin.position.set(-1.65, 0.0125, 0)
  group.add(fin)

  // ── Engines (two, underwing) ──────────────────────────────────────────────
  function makeEngine(xPos, zPos) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.7, 10), engMat)
    nacelle.rotation.z = Math.PI / 2
    nacelle.position.set(xPos, -0.12, zPos)
    group.add(nacelle)

    // Intake ring
    const intake = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.018, 8, 20),
      new THREE.MeshPhongMaterial({ color: 0x334455, shininess: 100 }),
    )
    intake.position.set(xPos + 0.36, -0.12, zPos)
    group.add(intake)
  }
  makeEngine( 0.5,  0.7)
  makeEngine( 0.5, -0.7)

  return group
}

// ── Orient an airplane model on the globe surface at lat/lng/heading ──────────
function applyGlobeOrientation(obj, lat, lng, heading) {
  const latR = lat     * (Math.PI / 180)
  const lngR = lng     * (Math.PI / 180)
  const hdgR = heading * (Math.PI / 180)

  // Surface normal = outward direction = model's +Y (up)
  const up = new THREE.Vector3(
    Math.cos(latR) * Math.sin(lngR),
    Math.sin(latR),
    Math.cos(latR) * Math.cos(lngR),
  ).normalize()

  // Geographic north at this point (tangent)
  const north = new THREE.Vector3(
    -Math.sin(latR) * Math.sin(lngR),
     Math.cos(latR),
    -Math.sin(latR) * Math.cos(lngR),
  ).normalize()

  // East tangent
  const east = new THREE.Vector3().crossVectors(up, north).normalize()

  // Forward = north rotated by heading around "up" = model's +X (nose)
  const fwd = new THREE.Vector3()
    .addScaledVector(north, Math.cos(hdgR))
    .addScaledVector(east,  Math.sin(hdgR))
    .normalize()

  // Right = fwd × up (model's +Z)
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize()

  // Build rotation matrix: column X=fwd, Y=up, Z=right
  const m = new THREE.Matrix4().makeBasis(fwd, up, right)
  obj.setRotationFromMatrix(m)
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function Globe3DModal({ flight, fromIcao, toIcao, track, airports, onClose }) {
  const globeRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (globeRef.current && flight?.lat != null) {
        globeRef.current.pointOfView({ lat: flight.lat, lng: flight.lon, altitude: 0.05 }, 1400)
      }
    }, 500)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fromAirport = airportMeta(airports, fromIcao)
  const toAirport   = airportMeta(airports, toIcao)

  // Data for 3D airplane layer
  const aircraftData = useMemo(() => {
    if (flight?.lat == null) return []
    return [{ lat: flight.lat, lng: flight.lon, heading: flight.heading ?? 0 }]
  }, [flight])

  // Historical track path
  const pathsData = useMemo(() => {
    if (!track || track.length < 2) return []
    const pts = track.filter(p => p[1] != null && p[2] != null)
    if (pts.length < 2) return []
    return [{ points: pts.map(p => ({ lat: p[1], lng: p[2] })) }]
  }, [track])

  // Departure → arrival arc
  const arcsData = useMemo(() => {
    if (!fromAirport || !toAirport) return []
    return [{ startLat: fromAirport.lat, startLng: fromAirport.lon, endLat: toAirport.lat, endLng: toAirport.lon }]
  }, [fromAirport, toAirport])

  // Airport markers
  const airportDots = useMemo(() => {
    const dots = []
    if (fromAirport) dots.push({ lat: fromAirport.lat, lng: fromAirport.lon, label: fromAirport.ident })
    if (toAirport)   dots.push({ lat: toAirport.lat,   lng: toAirport.lon,   label: toAirport.ident  })
    return dots
  }, [fromAirport, toAirport])

  // Stable callbacks for Globe props
  const createAirplane  = useCallback(() => makeAirplane(), [])
  const updateAirplane  = useCallback((obj, d) => {
    if (!globeRef.current) return
    const coords = globeRef.current.getCoords(d.lat, d.lng, 0.008)
    if (coords) {
      obj.position.set(coords.x, coords.y, coords.z)
      applyGlobeOrientation(obj, d.lat, d.lng, d.heading)
    }
  }, [])

  const w = Math.min(window.innerWidth  - 48, 960)
  const h = Math.min(window.innerHeight - 100, 720)

  return (
    <div className="globe-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="globe-box">
        <div className="globe-header">
          <span className="globe-title">
            3D View — {flight?.callsign?.trim() || flight?.icao24 || 'Aircraft'}
            {fromIcao && toIcao ? ` · ${fromIcao} → ${toIcao}` : ''}
          </span>
          <button className="globe-close" onClick={onClose}>✕</button>
        </div>
        <div className="globe-body">
          <Globe
            ref={globeRef}
            width={w}
            height={h - 44}
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            backgroundColor="rgba(0,0,0,0)"
            atmosphereColor="rgba(56,189,248,0.25)"
            atmosphereAltitude={0.2}
            // 3D airplane model
            customLayerData={aircraftData}
            customThreeObject={createAirplane}
            customThreeObjectUpdate={updateAirplane}
            // Airport dots
            pointsData={airportDots}
            pointLat="lat"
            pointLng="lng"
            pointLabel="label"
            pointColor={() => '#fbbf24'}
            pointRadius={0.25}
            pointAltitude={0}
            // Track path
            pathsData={pathsData}
            pathPoints="points"
            pathPointLat="lat"
            pathPointLng="lng"
            pathColor={() => '#38bdf8'}
            pathStroke={1.5}
            // Route arc
            arcsData={arcsData}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor={() => 'rgba(56,189,248,0.4)'}
            arcStroke={0.7}
            arcDashLength={0.4}
            arcDashGap={0.3}
            arcDashAnimateTime={2800}
            arcAltitudeAutoScale={0.35}
          />
        </div>
        <div className="globe-hint">Drag to rotate · Scroll to zoom · Click outside to close</div>
      </div>
    </div>
  )
}
