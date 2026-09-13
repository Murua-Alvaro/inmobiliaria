import { mkdir, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const BASE = 'https://raw.githubusercontent.com/Murua-Alvaro/growa-territorial/main/public/data/territories/mx-sin-mazatlan/inmobiliario'
const OUT = new URL('../public/data/', import.meta.url)

async function text(path) {
  const response = await fetch(`${BASE}/${path}`)
  if (!response.ok) throw new Error(`No se pudo obtener ${path}: ${response.status}`)
  return response.text()
}

async function unpack(parts, label) {
  const encoded = (await Promise.all(parts.map(text))).join('').replace(/\s+/g, '')
  if (!encoded) throw new Error(`${label}: payload vacío`)
  return gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')
}

await mkdir(OUT, { recursive: true })

const core = await unpack(['ageb-core.b64.1','ageb-core.b64.2','ageb-core.b64.3','ageb-core.b64.4'], 'AGEB core')
const corePayload = JSON.parse(core)
if (!Array.isArray(corePayload.rows) || corePayload.rows.length !== 328) throw new Error('AGEB core inválido')
await writeFile(new URL('ageb-core.json', OUT), JSON.stringify(corePayload))

const extra = await unpack(['ageb-extra.b64.1','ageb-extra.b64.2','ageb-extra.b64.3','ageb-extra.b64.4'], 'AGEB extra')
const extraPacked = JSON.parse(extra)
const extraRecords = extraPacked.rows.map(row => Object.fromEntries(extraPacked.columns.map((column, index) => [column, row[index]])))
await writeFile(new URL('ageb-profile-extra.json', OUT), JSON.stringify({ records: extraRecords }))

const geometry = await unpack(Array.from({ length: 8 }, (_, i) => `ageb-geometry-2020.b64.${i + 1}`), 'AGEB geometry')
const geometryPayload = JSON.parse(geometry)
if (geometryPayload?.type !== 'FeatureCollection' || geometryPayload.features?.length !== 328) throw new Error('Geometría AGEB inválida')
await writeFile(new URL('ageb-geometry-2020.geojson', OUT), JSON.stringify(geometryPayload))

const financing = await text('financing-summary.json')
await writeFile(new URL('financing-summary.json', OUT), financing)

console.log(`[sync] ${corePayload.rows.length} AGEB + financiamiento Mazatlán listos`)
