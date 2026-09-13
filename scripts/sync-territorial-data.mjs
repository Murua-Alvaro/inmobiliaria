import { mkdir, writeFile } from 'node:fs/promises'

const BASE = 'https://growa-territorial.onrender.com/data/territories/mx-sin-mazatlan/inmobiliario'
const OUT = new URL('../public/data/', import.meta.url)

async function copy(remote, local = remote) {
  const response = await fetch(`${BASE}/${remote}`)
  if (!response.ok) throw new Error(`No se pudo obtener ${remote}: ${response.status}`)
  const body = await response.text()
  await writeFile(new URL(local, OUT), body)
  return body
}

await mkdir(OUT, { recursive: true })
const [coreText,,geometryText] = await Promise.all([
  copy('ageb-core.json'),
  copy('ageb-profile-extra.json'),
  copy('ageb-geometry-2020.geojson'),
  copy('financing-summary.json'),
])
const core = JSON.parse(coreText)
const geometry = JSON.parse(geometryText)
if (!Array.isArray(core.rows) || core.rows.length !== 328) throw new Error('AGEB core inválido')
if (geometry?.type !== 'FeatureCollection' || geometry.features?.length !== 328) throw new Error('Geometría AGEB inválida')
console.log(`[sync] ${core.rows.length} AGEB + financiamiento Mazatlán listos`)
