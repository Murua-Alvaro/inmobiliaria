import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './agebDemografia.css'

const fmt = (value, digits = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : 'No disponible'
}
const pct = (value, digits = 1) => {
  const n = Number(value)
  return Number.isFinite(n) ? `${fmt(n, digits)}%` : 'No disponible'
}
const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const ratio = (a, b, multiplier = 100) => {
  const x = num(a), y = num(b)
  return x === null || y === null || y <= 0 ? null : x / y * multiplier
}
const median = values => {
  const ordered = values.filter(Number.isFinite).sort((a,b)=>a-b)
  if (!ordered.length) return null
  const m = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[m] : (ordered[m - 1] + ordered[m]) / 2
}

const METRICS = [
  { key:'adult_share_pct', label:'Composición adulta', mapLabel:'Población de 18 años y más', unit:'%', digits:1, use:'Ayuda a distinguir zonas con estructura más adulta antes de cruzarlas con producto, renta o financiamiento.' },
  { key:'prom_ocup', label:'Tamaño del hogar', mapLabel:'Ocupantes por vivienda', unit:'pers.', digits:1, use:'Sirve para discutir mezcla de unidades y número de recámaras; no identifica preferencias de compra por sí solo.' },
  { key:'interstate_2015_pct', label:'Movilidad reciente', mapLabel:'Residía en otra entidad en 2015', unit:'%', digits:1, use:'Es una señal de incorporación reciente de población externa; útil para detectar zonas con mayor rotación interestatal.' },
  { key:'born_elsewhere_pct', label:'Origen externo acumulado', mapLabel:'Nacidos en otra entidad', unit:'%', digits:1, use:'Distingue zonas con arraigo local de zonas con mayor componente foráneo; no equivale a migración reciente.' },
]

function unpack(payload) {
  const records = {}
  payload.rows.forEach(row => {
    const r = Object.fromEntries(payload.columns.map((column,index)=>[column,row[index]]))
    const id = String(r.cvegeo_ageb || '').trim()
    if (id) records[id] = r
  })
  return records
}
function enrich(core, extra) {
  for (const r of extra.records || []) {
    const id = String(r.cvegeo_ageb || '').trim()
    if (id) core[id] = { ...(core[id] || { cvegeo_ageb:id }), ...r }
  }
  Object.values(core).forEach(r => {
    r.adult_share_pct = ratio(r.p_18ymas, r.pobtot)
    r.born_elsewhere_pct = ratio(r.pnacoe, r.pobtot)
    r.interstate_2015_pct = ratio(r.presoe15, r.pobtot)
    r.women_share_pct = ratio(r.pobfem, r.pobtot)
    r.men_share_pct = ratio(r.pobmas, r.pobtot)
  })
  return core
}
function isCity(record) {
  const id = String(record?.cvegeo_ageb || '')
  return id.slice(5,9) === '0001' && Number(record?.pobtot || 0) > 0
}
function contextFor(records, key, current) {
  const value = num(current)
  const values = records.map(r=>num(r[key])).filter(v=>v!==null)
  if (value === null || !values.length) return null
  const med = median(values)
  const below = values.filter(v=>v<value).length
  const equal = values.filter(v=>v===value).length
  const percentile = Math.max(1, Math.min(99, Math.round(((below + equal * .5) / values.length) * 100)))
  return { median:med, percentile, rank:1 + values.filter(v=>v>value).length, count:values.length }
}
function band(ctx) {
  if (!ctx) return 'sin referencia suficiente'
  if (ctx.percentile >= 80) return 'entre los valores más altos de la ciudad'
  if (ctx.percentile >= 60) return 'por encima del patrón urbano'
  if (ctx.percentile <= 20) return 'entre los valores más bajos de la ciudad'
  if (ctx.percentile <= 40) return 'por debajo del patrón urbano'
  return 'cerca del patrón urbano'
}
function formatMetric(metric, value) {
  const n = num(value)
  if (n === null) return 'No disponible'
  if (metric.unit === '%') return pct(n, metric.digits)
  if (metric.unit === 'pers.') return `${fmt(n,metric.digits)} pers.`
  return fmt(n,metric.digits)
}
function grayscale(value, low, high) {
  if (!Number.isFinite(value)) return '#f1f1f1'
  const t = Math.max(0, Math.min(1, (value - low) / (high - low || 1)))
  const shades = ['#f0f0f0','#d9d9d9','#bfbfbf','#999999','#6d6d6d','#2c2c2c']
  return shades[Math.min(shades.length-1, Math.floor(t * shades.length))]
}

function DemographicMap({geometry,records,metricKey,selectedId,onSelect,scope,setScope}) {
  const nodeRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const firstRef = useRef(true)
  const metric = METRICS.find(m=>m.key===metricKey)
  const visibleFeatures = useMemo(() => (geometry?.features || []).filter(feature => {
    const id = String(feature?.properties?.cvegeo_ageb || feature?.properties?.CVEGEO || '').slice(0,13)
    const record = records[id]
    if (!record || Number(record.pobtot || 0) <= 0) return false
    return scope === 'city' ? isCity(record) : true
  }), [geometry,records,scope])
  const values = useMemo(() => metric ? visibleFeatures.map(f=>{
    const id=String(f?.properties?.cvegeo_ageb||f?.properties?.CVEGEO||'').slice(0,13)
    return num(records[id]?.[metric.key])
  }).filter(v=>v!==null).sort((a,b)=>a-b) : [], [visibleFeatures,records,metric])
  const low = values[Math.floor(values.length*.08)] ?? 0
  const high = values[Math.floor(values.length*.94)] ?? 1

  useEffect(()=>{
    if (!nodeRef.current || mapRef.current) return
    const map = L.map(nodeRef.current,{zoomControl:false,attributionControl:false,minZoom:9,maxZoom:17})
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20}).addTo(map)
    L.control.zoom({position:'topright'}).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map || !geometry) return
    if(layerRef.current) layerRef.current.remove()
    const layer = L.geoJSON({type:'FeatureCollection',features:visibleFeatures},{
      style: feature => {
        const id=String(feature?.properties?.cvegeo_ageb||feature?.properties?.CVEGEO||'').slice(0,13)
        const active=id===selectedId
        const value=metric ? num(records[id]?.[metric.key]) : null
        return {
          color:active?'#000':'#8f8f8f',
          weight:active?2.6:.9,
          fillColor:metric?grayscale(value,low,high):'#e6e6e6',
          fillOpacity:active?.96:.82,
        }
      },
      onEachFeature:(feature,l)=>{
        const id=String(feature?.properties?.cvegeo_ageb||feature?.properties?.CVEGEO||'').slice(0,13)
        const record=records[id]
        if(!record)return
        const content=metric
          ? `<span>AGEB ${id.slice(-4)}</span><strong>${formatMetric(metric,record[metric.key])}</strong><small>${metric.mapLabel}</small>`
          : `<span>AGEB ${id.slice(-4)}</span><strong>${fmt(record.pobtot)}</strong><small>Población total · clic para consultar</small>`
        l.bindTooltip(`<div class="ad-map-tip">${content}</div>`,{sticky:true,direction:'top',opacity:1})
        l.on('click',()=>onSelect(id))
      }
    }).addTo(map)
    layerRef.current=layer
    if(layer.getBounds().isValid()) {
      map.fitBounds(layer.getBounds(),{padding:[28,28],duration:firstRef.current?0:.35,maxZoom:scope==='city'?12.5:11.3})
      firstRef.current=false
    }
  },[geometry,visibleFeatures,records,metric,selectedId,low,high,onSelect,scope])

  useEffect(()=>{
    if(!selectedId||!layerRef.current||!mapRef.current)return
    let hit=null
    layerRef.current.eachLayer(layer=>{
      const id=String(layer.feature?.properties?.cvegeo_ageb||layer.feature?.properties?.CVEGEO||'').slice(0,13)
      if(id===selectedId)hit=layer
    })
    if(hit?.getBounds) mapRef.current.fitBounds(hit.getBounds(),{padding:[110,110],maxZoom:14,duration:.35})
  },[selectedId])

  return <div className="ad-map-wrap">
    <div ref={nodeRef} className="ad-map" />
    <div className="ad-map-scope"><button className={scope==='city'?'active':''} onClick={()=>setScope('city')}>Ciudad</button><button className={scope==='municipality'?'active':''} onClick={()=>setScope('municipality')}>Municipio</button></div>
    <div className="ad-map-legend"><span>{metric?.mapLabel || 'Mapa neutro'}</span>{metric?<><div><i className="g1"/><i className="g2"/><i className="g3"/><i className="g4"/><i className="g5"/><i className="g6"/></div><small>menor <b>→</b> mayor</small></>:<small>Selecciona un AGEB para abrir su ficha</small>}</div>
  </div>
}

function DecisionCard({metric,record,benchmark,active,onCompare}) {
  const value=num(record[metric.key])
  const ctx=contextFor(benchmark,metric.key,value)
  const finding = metric.key==='adult_share_pct' ? `El peso de población de 18 años y más está ${band(ctx)}.`
    : metric.key==='prom_ocup' ? `El tamaño medio del hogar está ${band(ctx)}.`
    : metric.key==='interstate_2015_pct' ? `La proporción que residía en otra entidad en 2015 está ${band(ctx)}.`
    : `La presencia de población nacida fuera de Sinaloa está ${band(ctx)}.`
  return <article className={`ad-decision${active?' active':''}`}>
    <div className="ad-decision-top"><span>{metric.label}</span><b>{ctx?`P${ctx.percentile}`:'s/ref.'}</b></div>
    <strong>{formatMetric(metric,value)}</strong>
    <small>{ctx?`P${ctx.percentile} · mediana ${formatMetric(metric,ctx.median)}`:'No hay comparación urbana suficiente'}</small>
    <p><b>Lectura</b>{finding}</p>
    <p><b>Para qué sirve</b>{metric.use}</p>
    <button onClick={()=>onCompare(metric.key)}>{active?'Mostrando en mapa':'Comparar en mapa'}</button>
  </article>
}

function Inspector({record,benchmark,metricKey,onCompare}) {
  if(!record) return <aside className="ad-inspector ad-empty"><div className="ad-empty-icon">⌖</div><strong>Selecciona un AGEB</strong><p>La ficha derecha abrirá el análisis demográfico de ese polígono.</p><div><b>Perfil territorial</b><span>Selecciona el polígono. Las variables comparables aparecen en la ficha y sólo pasan al mapa cuando tú lo decides.</span></div></aside>
  const contexts = METRICS.map(metric=>({metric,ctx:contextFor(benchmark,metric.key,record[metric.key])})).filter(x=>x.ctx)
  const strongest=[...contexts].sort((a,b)=>Math.abs((b.ctx?.percentile||50)-50)-Math.abs((a.ctx?.percentile||50)-50))[0]
  const strongestLabel = strongest?.metric?.label?.toLowerCase() || 'la composición demográfica'
  return <aside className="ad-inspector">
    <div className="ad-inspector-head"><div><span>INEGI · CENSO 2020</span><h2>Demografía útil</h2><p>AGEB {String(record.cvegeo_ageb).slice(-4)} · estructura del hogar y movilidad, no conteos sueltos</p></div><code>{record.cvegeo_ageb}</code></div>
    <section className="ad-executive"><span>LECTURA DEL AGEB</span><strong>La señal que más distingue este AGEB es {strongestLabel}.</strong><p>Aquí no se trata a la población como demanda. Se compara composición, tamaño de hogar y movilidad para describir el tipo de tejido residencial que ya existe.</p></section>
    <div className="ad-decision-grid">{METRICS.map(metric=><DecisionCard key={metric.key} metric={metric} record={record} benchmark={benchmark} active={metricKey===metric.key} onCompare={onCompare}/>)}</div>
    <details className="ad-detail" open>
      <summary><div><strong>Datos que explican el perfil</strong><span>conteos censales detrás de las señales</span></div><i>+</i></summary>
      <div className="ad-detail-grid">
        <div><span>Población total</span><strong>{fmt(record.pobtot)}</strong><small>contexto de escala, no demanda</small></div>
        <div><span>Población de 18 años y más</span><strong>{fmt(record.p_18ymas)}</strong><small>{pct(record.adult_share_pct)} del total</small></div>
        <div><span>Ocupantes por vivienda</span><strong>{fmt(record.prom_ocup,1)}</strong></div>
        <div><span>Promedio de hijas/os nacidos vivos</span><strong>{fmt(record.prom_hnv,1)}</strong><small>mujeres de 12 años y más</small></div>
        <div><span>Nacida en otra entidad</span><strong>{fmt(record.pnacoe)}</strong><small>{pct(record.born_elsewhere_pct)} del total</small></div>
        <div><span>Residía en otra entidad en 2015</span><strong>{fmt(record.presoe15)}</strong><small>{pct(record.interstate_2015_pct)} del total</small></div>
        {num(record.pobfem)!==null?<div><span>Mujeres</span><strong>{fmt(record.pobfem)}</strong><small>{pct(record.women_share_pct)} del total</small></div>:null}
        {num(record.pobmas)!==null?<div><span>Hombres</span><strong>{fmt(record.pobmas)}</strong><small>{pct(record.men_share_pct)} del total</small></div>:null}
      </div>
      <p className="ad-detail-foot">Estas variables describen composición. Para demanda, precio o absorción hacen falta datos inmobiliarios adicionales.</p>
    </details>
  </aside>
}

export default function AgebDemografia() {
  const [state,setState]=useState({loading:true,error:'',records:null,geometry:null})
  const [selectedId,setSelectedId]=useState(null)
  const [metricKey,setMetricKey]=useState(null)
  const [scope,setScope]=useState('city')
  useEffect(()=>{
    const controller=new AbortController()
    Promise.all([
      fetch('/data/ageb-core.json',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AGEB core ${r.status}`);return r.json()}),
      fetch('/data/ageb-profile-extra.json',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AGEB extra ${r.status}`);return r.json()}),
      fetch('/data/ageb-geometry-2020.geojson',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AGEB geometry ${r.status}`);return r.json()}),
    ]).then(([core,extra,geometry])=>setState({loading:false,error:'',records:enrich(unpack(core),extra),geometry})).catch(error=>{if(!controller.signal.aborted)setState({loading:false,error:String(error),records:null,geometry:null})})
    return()=>controller.abort()
  },[])
  if(state.loading) return <div className="ad-state">Cargando composición demográfica por AGEB…</div>
  if(state.error) return <div className="ad-state ad-error">No se pudo cargar la base AGEB · {state.error}</div>
  const allRecords=Object.values(state.records||{}).filter(r=>Number(r.pobtot||0)>0)
  const cityRecords=allRecords.filter(isCity)
  const benchmark=cityRecords
  const selected=selectedId?state.records[selectedId]:null
  return <main className="ad-page">
    <header className="ad-page-head"><div><span>AGEB / MAZATLÁN · INEGI CENSO 2020</span><h1>Composición demográfica.</h1><p>Mapa territorial y lectura comparativa por AGEB. La población se usa como estructura residencial, no como una estimación automática de demanda.</p></div><div className="ad-coverage"><strong>{cityRecords.length}</strong><span>AGEB ciudad</span><i/><strong>{allRecords.length}</strong><span>integradas</span></div></header>
    <section className="ad-workbench">
      <div className="ad-map-card">
        <DemographicMap geometry={state.geometry} records={state.records} metricKey={metricKey} selectedId={selectedId} onSelect={setSelectedId} scope={scope} setScope={setScope}/>
        <aside className="ad-filter-rail">
          <div className="ad-filter-head"><div><span>Perfil territorial</span><strong>Demografía</strong></div><small>AGEB · Mazatlán</small></div>
          <div className="ad-source"><div><strong>INEGI</strong><span>Censo 2020 · perfil territorial</span></div><button className="active"><i/> <span><strong>Demografía</strong><small>Composición adulta, tamaño de hogar y movilidad.</small></span><b>›</b></button></div>
        </aside>
        <div className="ad-map-foot"><div><strong>Demografía</strong><span>{metricKey?`Comparación activa: ${METRICS.find(m=>m.key===metricKey)?.mapLabel}.`:'Mapa neutro · selecciona un AGEB para abrir su ficha.'}</span></div>{metricKey?<button onClick={()=>setMetricKey(null)}>Quitar comparación</button>:null}</div>
      </div>
      <Inspector record={selected} benchmark={benchmark} metricKey={metricKey} onCompare={key=>setMetricKey(prev=>prev===key?null:key)}/>
    </section>
  </main>
}
