const sharp = require('sharp')
const potrace = require('potrace')
const fs = require('fs')
const path = require('path')

const assetsDir = path.join(__dirname, '../frontend/src/assets')
const outputDir = path.join(__dirname, '../frontend/src/assets/aircraft')

fs.mkdirSync(outputDir, { recursive: true })

// One representative image per category
const CATEGORY_MAP = {
  heavy4:     'Screenshot 2026-05-21 163809.png',
  widebody:   'Screenshot 2026-05-21 164148.png',
  narrowbody: 'Screenshot 2026-05-21 163845.png',
  regional:   'Screenshot 2026-05-21 163920.png',
  turboprop:  'Screenshot 2026-05-21 163856.png',
  bizjet:     'Screenshot 2026-05-21 163940.png',
}

// Target display sizes (the SVGs point UP, so these are height×width when north-facing)
const SIZES = {
  heavy4:     { w: 48, h: 44 },
  widebody:   { w: 42, h: 40 },
  narrowbody: { w: 34, h: 30 },
  regional:   { w: 28, h: 26 },
  turboprop:  { w: 30, h: 28 },
  bizjet:     { w: 26, h: 22 },
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
