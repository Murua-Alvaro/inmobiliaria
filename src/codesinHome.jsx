import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer, TextLayer } from '@deck.gl/layers'
import AgebDemografia from './AgebDemografia.jsx'
import Indicadores from './Indicadores.jsx'
import './codesinHome.css'
import './agebProfileOverrides.css'

const INITIAL_VIEW = {
  longitude: -106.424,
  latitude: 23.242,
  zoom: 11.05,
  pitch: 51,
  bearing: -18,
}

function collectCoordinates(value, output) {
  if (!Array.isArray(value)) return
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    output.push([value[0], value[1]])
    return
  }
  value.forEach(item => collectCoordinates(item, output))
}

function districtCenter(feature) {
  const coordinates = []
  collectCoordinates(feature?.geometry?.coordinates, coordinates)
  if (!coordinates.length) return null
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  coordinates.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  })
  return {
    name: String(feature?.properties?.district || 'Distrito'),
    agebCount: Number(feature?.properties?.ageb_count || 0),
    longitude: (minLon + maxLon) / 2,
    latitude: (minLat + maxLat) / 2,
  }
}

function cleanName(name) {
  return String(name || '').replace(' - ', ' · ')
}

function CodesinMapHome() {
  const [geojson, setGeojson] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/codesin-districts.geojson', { signal: controller.signal, cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`Geometría ${response.status}`)
        return response.json()
      })
      .then(setGeojson)
      .catch(caught => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => controller.abort()
  }, [])

  const districts = useMemo(() => (geojson?.features || []).map(districtCenter).filter(Boolean), [geojson])
  const agebCounts = districts.map(d => d.agebCount).filter(Number.isFinite)
  const maxAgeb = Math.max(...agebCounts, 1)
  const selectedMeta = districts.find(d => d.name === selected) || null

  const layers = useMemo(() => {
    if (!geojson) return []
    const polygonLayer = new GeoJsonLayer({
      id: 'inmobiliaria-codesin-districts',
      data: geojson,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: true,
      wireframe: true,
      opacity: 1,
      getElevation: feature => {
        const count = Number(feature?.properties?.ageb_count || 0)
        const base = 80 + (count / maxAgeb) * 1150
        return String(feature?.properties?.district || '') === selected ? base * 1.16 : base
      },
      getFillColor: feature => {
        const name = String(feature?.properties?.district || '')
        if (name === selected) return [18, 18, 18, 242]
        if (selected) return [205, 205, 205, 170]
        const count = Number(feature?.properties?.ageb_count || 0)
        const t = Math.max(0, Math.min(1, count / maxAgeb))
        const shade = Math.round(232 - t * 90)
        return [shade, shade, shade, 220]
      },
      getLineColor: feature => String(feature?.properties?.district || '') === selected
        ? [0, 0, 0, 255]
        : [112, 112, 112, 210],
      lineWidthMinPixels: 1,
      material: {
        ambient: 0.88,
        diffuse: 0.34,
        shininess: 8,
        specularColor: [255, 255, 255],
      },
      updateTriggers: {
        getElevation: [selected, maxAgeb],
        getFillColor: [selected, maxAgeb],
        getLineColor: [selected],
      },
    })

    const labelLayer = new TextLayer({
      id: 'inmobiliaria-codesin-labels',
      data: districts,
      pickable: true,
      getPosition: district => [district.longitude, district.latitude],
      getText: district => cleanName(district.name),
      getSize: 11,
      sizeMinPixels: 9,
      sizeMaxPixels: 13,
      getColor: district => district.name === selected ? [255, 255, 255, 255] : [25, 25, 25, 235],
      getPixelOffset: [0, 18],
      fontWeight: 650,
      billboard: true,
      background: true,
      getBackgroundColor: district => district.name === selected ? [12, 12, 12, 230] : [255, 255, 255, 220],
      backgroundPadding: [5, 3],
      updateTriggers: {
        getColor: [selected],
        getBackgroundColor: [selected],
      },
    })

    return [polygonLayer, labelLayer]
  }, [geojson, districts, maxAgeb, selected])

  return <main className="ch-stage">
    <div className="ch-title"><span>TERRITORIO / MAZATLÁN</span><h1>Mapa urbano por distritos.</h1><p>La estructura territorial CODESIN como punto de entrada al análisis inmobiliario de Mazatlán.</p></div>

    {error ? <div className="ch-error">No se pudo cargar la geometría CODESIN · {error}</div> : null}
    {!geojson && !error ? <div className="ch-loading">Cargando geometría CODESIN…</div> : null}

    <div className="ch-map">
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller
        layers={layers}
        onClick={info => {
          const name = info?.object?.properties?.district ?? info?.object?.name ?? null
          if (name) setSelected(String(name))
        }}
        getTooltip={info => {
          const object = info?.object
          if (!object) return null
          const name = object?.properties?.district ?? object?.name
          if (!name) return null
          const count = Number(object?.properties?.ageb_count ?? object?.agebCount ?? 0)
          return {
            html: `<div class="ch-tooltip"><span>DISTRITO CODESIN</span><strong>${cleanName(name)}</strong><small>${count ? `${count} AGEB integradas` : 'Seleccionar distrito'}</small></div>`,
            style: { background: 'transparent', padding: 0, border: 'none' },
          }
        }}
      />
    </div>

    <aside className="ch-panel">
      <div className="ch-panel__head"><span>DISTRITOS CODESIN</span><strong>Selecciona una zona</strong></div>
      <div className="ch-list">{districts.map((district, index) => <button type="button" key={district.name} className={selected === district.name ? 'is-active' : ''} onClick={() => setSelected(district.name)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{cleanName(district.name)}</strong><small>Polígono territorial</small></div><b>{district.agebCount || '—'}</b></button>)}</div>
      {selected ? <button type="button" className="ch-panel__clear" onClick={() => setSelected(null)}>Ver todos los distritos</button> : null}
    </aside>

    {selectedMeta ? <section className="ch-selection"><span>DISTRITO SELECCIONADO</span><h2>{cleanName(selectedMeta.name)}</h2><p>Esta selección funcionará como nivel distrital para cruzar después vivienda, oferta y mercado.</p><div><small>AGEB integradas</small><strong>{selectedMeta.agebCount || '—'}</strong></div></section> : null}

    <div className="ch-legend"><span><i /> distrito</span><span><i className="dark" /> selección</span><span><b /> altura relativa</span></div>
  </main>
}

function App() {
  const pageFromHash = () => location.hash === '#ageb' ? 'ageb' : location.hash === '#indicadores' ? 'indicadores' : 'inicio'
  const [page,setPage] = useState(pageFromHash)
  useEffect(()=>{
    const onHash=()=>setPage(pageFromHash())
    window.addEventListener('hashchange',onHash)
    return()=>window.removeEventListener('hashchange',onHash)
  },[])
  const go = next => {
    location.hash = next === 'ageb' ? 'ageb' : next === 'indicadores' ? 'indicadores' : 'inicio'
    setPage(next)
  }
  const badge = page==='ageb' ? 'PERFIL AGEB · 2020' : page==='inicio' ? 'MAPA CODESIN · 13 DISTRITOS' : ''
  return <div className="codesin-home">
    <header className={`ch-header${page==='indicadores'?' ch-header--indicators':''}`}>
      <button type="button" className="ch-brand ch-brand--button" onClick={()=>go('inicio')}><div className="ch-brand__mark">G</div><div className="ch-brand__copy"><strong>GROWA</strong><span>INMOBILIARIA</span></div></button>
      <div className="ch-header__rule" />
      <nav className="ch-nav"><button type="button" className={page==='inicio'?'active':''} onClick={()=>go('inicio')}>Inicio</button><button type="button" className={page==='ageb'?'active':''} onClick={()=>go('ageb')}>AGEB / Demografía</button><button type="button" className={page==='indicadores'?'active':''} onClick={()=>go('indicadores')}>Indicadores</button></nav>
      <div className="ch-context"><strong>Mazatlán, Sinaloa</strong><span>PLATAFORMA TERRITORIAL INMOBILIARIA</span></div>
      {badge?<div className="ch-badge">{badge}</div>:null}
    </header>
    {page==='ageb'?<AgebDemografia/>:page==='indicadores'?<Indicadores/>:<CodesinMapHome/>}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
