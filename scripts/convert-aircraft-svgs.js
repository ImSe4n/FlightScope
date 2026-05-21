const sharp = require('sharp')
const potrace = require('potrace')
const fs = require('fs')
const path = require('path')

const assetsDir = path.join(__dirname, '../frontend/src/assets')
const outputDir = path.join(__dirname, '../frontend/src/assets/aircraft')

fs.mkdirSync(outputDir, { recursive: true })

// All 16 images mapped to specific aircraft types
const CATEGORY_MAP = {
  b777:   'Screenshot 2026-05-21 163745.png',  // long body, huge GE90 engines
  a320:   'Screenshot 2026-05-21 163756.png',  // medium narrowbody
  a380:   'Screenshot 2026-05-21 163809.png',  // 4 engines, massive
  b787:   'Screenshot 2026-05-21 163827.png',  // twin, raked wingtips
  b737:   'Screenshot 2026-05-21 163845.png',  // narrowbody, shorter
  atr:    'Screenshot 2026-05-21 163856.png',  // turboprop, straight wings
  b747:   'Screenshot 2026-05-21 163908.png',  // 4 engines, upper-deck hump
  crj:    'Screenshot 2026-05-21 163920.png',  // rear-engine regional
  a321:   'Screenshot 2026-05-21 163930.png',  // longer narrowbody
  bizjet: 'Screenshot 2026-05-21 163940.png',  // swept wings, rear engines
  q400:   'Screenshot 2026-05-21 163953.png',  // turboprop variant
  a330:   'Screenshot 2026-05-21 164004.png',  // older widebody twin
  a350:   'Screenshot 2026-05-21 164148.png',  // modern widebody, curved tips
  a319:   'Screenshot 2026-05-21 164203.png',  // short narrowbody
  b767:   'Screenshot 2026-05-21 164219.png',  // older medium widebody
  b757:   'Screenshot 2026-05-21 164234.png',  // long slender narrowbody
}

// Target display sizes — larger aircraft get bigger icons
const SIZES = {
  a380:   { w: 52, h: 48 },
  b747:   { w: 50, h: 46 },
  b777:   { w: 48, h: 42 },
  b787:   { w: 44, h: 40 },
  a350:   { w: 44, h: 40 },
  a330:   { w: 42, h: 38 },
  b767:   { w: 40, h: 36 },
  b757:   { w: 38, h: 28 },
  a321:   { w: 36, h: 30 },
  b737:   { w: 34, h: 30 },
  a320:   { w: 32, h: 28 },
  a319:   { w: 30, h: 26 },
  crj:    { w: 28, h: 24 },
  q400:   { w: 30, h: 28 },
  atr:    { w: 30, h: 28 },
  bizjet: { w: 26, h: 22 },
}

async function extractMask(filepath) {
  const { data, info } = await sharp(filepath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const C = 4  // RGBA channels

  // Sample background from multiple corners and edges to get a robust bg color
  const samples = [
    [0, 0], [2, 0], [0, 2],
    [width - 1, 0], [width - 3, 0],
    [0, height - 1], [0, height - 3],
    [width - 1, height - 1],
  ]
  let rSum = 0, gSum = 0, bSum = 0
  for (const [x, y] of samples) {
    const idx = (y * width + x) * C
    rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]
  }
  const bgR = rSum / samples.length
  const bgG = gSum / samples.length
  const bgB = bSum / samples.length

  // Build grayscale mask: aircraft pixels → 0 (black), background → 255 (white)
  const mask = Buffer.alloc(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * C], g = data[i * C + 1], b = data[i * C + 2]
    const dr = r - bgR, dg = g - bgG, db = b - bgB
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    mask[i] = dist > 40 ? 0 : 255
  }

  const maskPng = await sharp(mask, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer()

  return { maskPng, width, height }
}

function traceSVG(maskPng) {
  return new Promise((resolve, reject) => {
    potrace.trace(maskPng, {
      threshold:    128,
      turdSize:     3,
      optCurve:     true,
      optTolerance: 0.2,
      color:        'currentColor',
      background:   'transparent',
    }, (err, svg) => {
      if (err) return reject(err)
      resolve(svg)
    })
  })
}

// Extract just the path data strings from potrace SVG output
function extractPaths(svg) {
  const matches = [...svg.matchAll(/<path[^>]+d="([^"]+)"[^>]*\/?>/g)]
  return matches.map(m => m[1])
}

// Parse viewBox from potrace output
function getViewBox(svg) {
  const m = svg.match(/viewBox="([^"]+)"/)
  return m ? m[1] : null
}

async function processCategory(category, filename) {
  const filepath = path.join(assetsDir, filename)
  const { maskPng, width, height } = await extractMask(filepath)

  // Save mask for debugging
  await sharp(maskPng).png().toFile(path.join(outputDir, `${category}_mask.png`))

  const svg = await traceSVG(maskPng)
  const viewBox = getViewBox(svg) || `0 0 ${width} ${height}`
  const paths = extractPaths(svg)

  // Build embeddable SVG string (aircraft points UP, fill=currentColor)
  const { w, h } = SIZES[category]
  const pathsHtml = paths.map(d => `<path d="${d}"/>`).join('')
  const embedded = `<svg width="${w}" height="${h}" viewBox="${viewBox}" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${pathsHtml}</svg>`

  // Also save standalone SVG file
  fs.writeFileSync(path.join(outputDir, `${category}.svg`), svg)

  return { embedded, viewBox, pathCount: paths.length, width, height }
}

async function main() {
  const results = {}

  for (const [category, filename] of Object.entries(CATEGORY_MAP)) {
    try {
      process.stdout.write(`Processing ${category} (${filename})… `)
      const result = await processCategory(category, filename)
      results[category] = result
      console.log(`✓  ${result.pathCount} path(s), ${result.width}×${result.height}px original`)
    } catch (err) {
      console.error(`✗  ${err.message}`)
    }
  }

  // Print icons.js-ready _SVG object
  console.log('\n\n=== icons.js _SVG entries ===\n')
  for (const [cat, r] of Object.entries(results)) {
    console.log(`  ${cat}: \`${r.embedded}\`,\n`)
  }

  // Print _SIZE entries
  console.log('\n=== icons.js _SIZE entries ===\n')
  for (const [cat, sz] of Object.entries(SIZES)) {
    const half_w = sz.w / 2
    const half_h = sz.h / 2
    console.log(`  ${cat.padEnd(10)}: { iconSize: [${sz.w}, ${sz.h}], iconAnchor: [${half_w}, ${half_h}] },`)
  }
}

main()
