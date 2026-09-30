import { mkdir, writeFile } from 'node:fs/promises'

const INMO_BASE = 'https://growa-territorial.onrender.com/data/territories/mx-sin-mazatlan/inmobiliario'
const CODESIN_GEOMETRY_URL = 'https://growa-territorial.onrender.com/data/territories/mx-sin-mazatlan/geometry/codesin-districts.geojson'
const COLONIAS_SINALOA_URL = 'https://raw.githubusercontent.com/open-mexico/mexico-geojson/main/25-Sin.geojson'
const OUT = new URL('../public/data/', import.meta.url)

async function copyFrom(base, remote, local = remote) {
  const response = await fetch(`${base}/${remote}`)
  if (!response.ok) throw new Error(`No se pudo obtener ${remote}: ${response.status}`)
  const body = await response.text()
  await writeFile(new URL(local, OUT), body)
  return body
}

async function copyOptional(base, remote, fallback, local = remote) {
  try {
    const response = await fetch(`${base}/${remote}`)
    if (!response.ok) throw new Error(String(response.status))
    const body = await response.text()
    await writeFile(new URL(local, OUT), body)
    return body
  } catch {
    const body = JSON.stringify(fallback)
    await writeFile(new URL(local, OUT), body)
    return body
  }
}

async function copyUrl(url, local) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`No se pudo obtener ${local}: ${response.status}`)
  const body = await response.text()
  await writeFile(new URL(local, OUT), body)
  return body
}

const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const keyOf = value => fold(value).replace(/[^a-z0-9]/g, '')
const pick = (properties, candidates) => {
  const wanted = new Set(candidates.map(keyOf))
  for (const [key, value] of Object.entries(properties || {})) {
    if (wanted.has(keyOf(key)) && value !== null && value !== undefined && String(value).trim()) return String(value).trim()
  }
  return ''
}
const slug = value => fold(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function geometryBounds(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = node => {
    if (!Array.isArray(node)) return
    if (node.length >= 2 && Number.isFinite(Number(node[0])) && Number.isFinite(Number(node[1]))) {
      const x = Number(node[0]), y = Number(node[1])
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      return
    }
    node.forEach(walk)
  }
  walk(geometry?.coordinates)
  return Number.isFinite(minX) ? [minX,minY,maxX,maxY] : null
}

function normalizeMazatlanColonias(raw) {
  const urban = [-106.58, 23.02, -106.18, 23.45]
  const features = (raw?.features || []).flatMap((feature, index) => {
    if (!['Polygon','MultiPolygon'].includes(feature?.geometry?.type)) return []
    const p = feature.properties || {}
    const text = fold(Object.values(p).filter(v => typeof v === 'string' || typeof v === 'number').join(' '))
    const b = geometryBounds(feature.geometry)
    const inUrbanBox = b && b[2] >= urban[0] && b[0] <= urban[2] && b[3] >= urban[1] && b[1] <= urban[3]
    const mentionsMazatlan = text.includes('mazatlan')
    if (!mentionsMazatlan && !inUrbanBox) return []

    const name = pick(p, ['d_asenta','asentamiento','nombre_asentamiento','colonia','nombre','name','nom_asent','nom_asenta'])
      || Object.values(p).find(v => typeof v === 'string' && v.trim() && !/^\d+$/.test(v.trim()) && !fold(v).includes('sinaloa') && !fold(v).includes('mazatlan'))
      || `Colonia ${index + 1}`
    const type = pick(p, ['d_tipo_asenta','tipo_asentamiento','tipo','settlement_type'])
    const postalCode = pick(p, ['d_codigo','codigo_postal','codigopostal','cp','postal_code'])
    const municipality = pick(p, ['d_mnpio','municipio','municipality']) || 'Mazatlán'
    const city = pick(p, ['d_ciudad','ciudad','city']) || 'Mazatlán'
    const baseId = slug(`${name}-${postalCode || index}`) || `colonia-${index}`

    return [{
      type: 'Feature',
      id: `colonia-${baseId}`,
      properties: {
        name: String(name).trim(),
        settlement_type: type,
        postal_code: postalCode,
        municipality,
        city,
        source: 'SEPOMEX / Correos de México 2025'
      },
      geometry: feature.geometry
    }]
  })

  const seen = new Set()
  const unique = features.filter(feature => {
    const b = geometryBounds(feature.geometry)
    const signature = `${fold(feature.properties.name)}|${feature.properties.postal_code}|${b?.map(v=>v.toFixed(5)).join(',')}`
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })

  if (!unique.length) throw new Error('No se encontraron colonias de Mazatlán en la fuente SEPOMEX')
  return { type: 'FeatureCollection', features: unique, metadata: { source: 'open-mexico/mexico-geojson · SEPOMEX', year: 2025, municipality: 'Mazatlán, Sinaloa' } }
}

await mkdir(OUT, { recursive: true })
const [coreText,,geometryText,,,codesinText,coloniasText] = await Promise.all([
  copyFrom(INMO_BASE, 'ageb-core.json'),
  copyFrom(INMO_BASE, 'ageb-profile-extra.json'),
  copyFrom(INMO_BASE, 'ageb-geometry-2020.geojson'),
  copyFrom(INMO_BASE, 'financing-summary.json'),
  copyOptional(INMO_BASE, 'developer-intelligence.json', { records: [] }),
  copyUrl(CODESIN_GEOMETRY_URL, 'codesin-districts.geojson'),
  fetch(COLONIAS_SINALOA_URL).then(async response => {
    if (!response.ok) throw new Error(`No se pudo obtener colonias de Sinaloa: ${response.status}`)
    return response.text()
  }),
])

await Promise.all([
  copyOptional(INMO_BASE, 'market-pulse.json', {}),
  copyOptional(INMO_BASE, 'agebs-huella-urbana.json', {}),
  copyFrom(INMO_BASE, 'costos-construccion-inpp-ultima-observacion.csv').catch(()=>null),
])

const core = JSON.parse(coreText)
const geometry = JSON.parse(geometryText)
const codesin = JSON.parse(codesinText)
const colonias = normalizeMazatlanColonias(JSON.parse(coloniasText))
await writeFile(new URL('colonias-mazatlan.geojson', OUT), JSON.stringify(colonias))

if (!Array.isArray(core.rows) || core.rows.length !== 328) throw new Error('AGEB core inválido')
if (geometry?.type !== 'FeatureCollection' || geometry.features?.length !== 328) throw new Error('Geometría AGEB inválida')
if (codesin?.type !== 'FeatureCollection' || !Array.isArray(codesin.features) || codesin.features.length < 10) throw new Error('Geometría CODESIN inválida')
if (colonias.features.length < 20) throw new Error(`Cobertura de colonias insuficiente: ${colonias.features.length}`)
console.log(`[sync] ${core.rows.length} AGEB + ${colonias.features.length} colonias + ${codesin.features.length} distritos CODESIN listos`)
