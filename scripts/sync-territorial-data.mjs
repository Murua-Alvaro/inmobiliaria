import { mkdir, writeFile } from 'node:fs/promises'

const INMO_BASE = 'https://growa-territorial.onrender.com/data/territories/mx-sin-mazatlan/inmobiliario'
const CODESIN_GEOMETRY_URL = 'https://growa-territorial.onrender.com/data/territories/mx-sin-mazatlan/geometry/codesin-districts.geojson'
const OUT = new URL('../public/data/', import.meta.url)

async function copyFrom(base, remote, local = remote) {
  const response = await fetch(`${base}/${remote}`)
  if (!response.ok) throw new Error(`No se pudo obtener ${remote}: ${response.status}`)
  const body = await response.text()
  await writeFile(new URL(local, OUT), body)
  return body
}

async function copyUrl(url, local) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`No se pudo obtener ${local}: ${response.status}`)
  const body = await response.text()
  await writeFile(new URL(local, OUT), body)
  return body
}

await mkdir(OUT, { recursive: true })
const [coreText,,geometryText,,codesinText] = await Promise.all([
  copyFrom(INMO_BASE, 'ageb-core.json'),
  copyFrom(INMO_BASE, 'ageb-profile-extra.json'),
  copyFrom(INMO_BASE, 'ageb-geometry-2020.geojson'),
  copyFrom(INMO_BASE, 'financing-summary.json'),
  copyUrl(CODESIN_GEOMETRY_URL, 'codesin-districts.geojson'),
])

const core = JSON.parse(coreText)
const geometry = JSON.parse(geometryText)
const codesin = JSON.parse(codesinText)
if (!Array.isArray(core.rows) || core.rows.length !== 328) throw new Error('AGEB core inválido')
if (geometry?.type !== 'FeatureCollection' || geometry.features?.length !== 328) throw new Error('Geometría AGEB inválida')
if (codesin?.type !== 'FeatureCollection' || !Array.isArray(codesin.features) || codesin.features.length < 10) throw new Error('Geometría CODESIN inválida')
console.log(`[sync] ${core.rows.length} AGEB + ${codesin.features.length} distritos CODESIN listos`)
