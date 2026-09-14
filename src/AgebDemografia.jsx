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
const firstNum = (...values) => values.map(num).find(value => value !== null) ?? null
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

const SECTIONS = [
  { id:'demografia', label:'Demografía', description:'Composición adulta, tamaño de hogar y movilidad.' },
  { id:'vivienda', label:'Vivienda', description:'Intensidad residencial, equipamiento y servicios.' },
  { id:'trabajo', label:'Trabajo', description:'Participación, ocupación y estructura laboral residente.' },
]

const SECTION_METRICS = {
  demografia:[
    { key:'adult_share_pct', title:'Composición adulta', mapLabel:'Población adulta', unit:'%', digits:1, use:'Ayuda a distinguir zonas con estructura más adulta antes de cruzarlas con producto, renta o financiamiento.' },
    { key:'prom_ocup', title:'Tamaño del hogar', mapLabel:'Ocupantes por vivienda', unit:'pers.', digits:1, use:'Sirve para discutir mezcla de unidades y número de recámaras; no identifica preferencias de compra por sí solo.' },
    { key:'interstate_2015_pct', title:'Movilidad reciente', mapLabel:'Movilidad interestatal 2015–2020', unit:'%', digits:1, use:'Es una señal de incorporación reciente de población externa; útil para detectar zonas con mayor rotación interestatal.' },
    { key:'born_elsewhere_pct', title:'Origen externo acumulado', mapLabel:'Nacidos en otra entidad', unit:'%', digits:1, use:'Distingue zonas con arraigo local de zonas con mayor componente foráneo; no equivale a migración reciente.' },
  ],
  vivienda:[
    { key:'housing_density_km2', title:'Intensidad residencial', mapLabel:'Densidad residencial', unit:'viv/km²', digits:0, use:'Permite distinguir tejido consolidado de zonas de baja ocupación y contextualizar presión sobre servicios y espacio urbano.' },
    { key:'households_per_dwelling', title:'Hogares por vivienda', mapLabel:'Hogares por vivienda', unit:'', digits:2, use:'Ayuda a detectar diferencias de estructura residencial; valores altos requieren revisar convivencia de hogares y condiciones de ocupación.' },
    { key:'auto_homes_pct', title:'Motorización', mapLabel:'Viviendas con automóvil', unit:'%', digits:1, use:'Es útil para discutir estacionamiento, accesibilidad y dependencia del automóvil, no para inferir ingreso directamente.' },
    { key:'servicios_completos_pct', title:'Cobertura básica conjunta', mapLabel:'Viviendas con servicios completos', unit:'%', digits:1, use:'Sirve como señal de consolidación del parque existente; la capacidad futura de red debe revisarse con organismos operadores.' },
  ],
  trabajo:[
    { key:'pea_pct', title:'Participación laboral', mapLabel:'PEA / población', unit:'%', digits:1, use:'Ayuda a distinguir zonas con diferente intensidad de participación económica entre residentes.' },
    { key:'ocupacion_pct', title:'Ocupación de la PEA', mapLabel:'Tasa de ocupación', unit:'%', digits:1, use:'Sirve como contexto laboral del residente; no mide calidad, formalidad ni salario del empleo.' },
    { key:'employed_per_household', title:'Ocupados por hogar', mapLabel:'Ocupados residentes por hogar', unit:'', digits:2, use:'Permite comparar estructura laboral doméstica entre AGEB antes de incorporar ingreso o financiamiento.' },
    { key:'unemployment_pct', title:'Desocupación', mapLabel:'Desocupación / PEA', unit:'%', digits:1, use:'Es una señal de contexto laboral; no debe interpretarse como riesgo crediticio individual.' },
  ],
}
const ALL_METRICS = Object.values(SECTION_METRICS).flat()

function unpack(payload) {
  const records = {}
  payload.rows.forEach(row => {
    const r = Object.fromEntries(payload.columns.map((column,index)=>[column,row[index]]))
    const id = String(r.cvegeo_ageb || '').trim()
    if (id) records[id] = r
  })
  return records
}
function enrich(core, extra, intelligence) {
  for (const r of extra.records || []) {
    const id = String(r.cvegeo_ageb || '').trim()
    if (id) core[id] = { ...(core[id] || { cvegeo_ageb:id }), ...r }
  }
  for (const r of intelligence?.records || []) {
    const id = String(r.cvegeo_ageb || '').trim()
    if (id && core[id]) core[id] = { ...core[id], ...r }
  }
  Object.values(core).forEach(r => {
    r.adult_share_pct = firstNum(r.adult_share_pct, ratio(r.p_18ymas, r.pobtot))
    r.born_elsewhere_pct = firstNum(r.born_elsewhere_pct, ratio(r.pnacoe, r.pobtot))
    r.interstate_2015_pct = firstNum(r.interstate_2015_pct, ratio(r.presoe15, r.pobtot))
    r.women_share_pct = firstNum(r.women_share_pct, ratio(r.pobfem, r.pobtot))
    r.men_share_pct = firstNum(r.men_share_pct, ratio(r.pobmas, r.pobtot))
    r.households_per_dwelling = firstNum(r.households_per_dwelling, ratio(r.tothog, r.vivpar_hab, 1))
    r.ocupacion_pct = firstNum(r.ocupacion_pct, ratio(r.pocupada, r.pea))
    r.pea_pct = firstNum(r.pea_pct, ratio(r.pea, r.pobtot))
    r.unemployment_pct = firstNum(r.unemployment_pct, ratio(r.pdesocup, r.pea))
    const inhabited = firstNum(r.tvivparhab, r.vivpar_hab)
    r.agua_pct = firstNum(r.agua_pct, ratio(r.vph_aguadv, inhabited))
    r.drenaje_pct = firstNum(r.drenaje_pct, ratio(r.vph_drenaj, inhabited))
    r.electricidad_pct = firstNum(r.electricidad_pct, ratio(r.vph_c_elec, inhabited))
    r.servicios_completos_pct = firstNum(r.servicios_completos_pct, ratio(r.vph_c_serv, inhabited))
    r.auto_homes_pct = firstNum(r.auto_homes_pct, ratio(r.vph_autom, inhabited))
    r.internet_homes_pct = firstNum(r.internet_homes_pct, ratio(r.vph_inter, inhabited))
    r.employed_per_household = firstNum(r.employed_per_household, ratio(r.pocupada, r.tothog, 1))
    const areaKm2 = firstNum(r.area_km2, r.ageb_area_km2, r.geometry_area_km2)
    r.housing_density_km2 = firstNum(r.housing_density_km2, areaKm2 && areaKm2 > 0 ? Number(r.vivpar_hab || 0) / areaKm2 : null)
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
  if (metric.unit) return `${fmt(n,metric.digits)} ${metric.unit}`
  return fmt(n,metric.digits)
}
function grayscale(value, low, high) {
  if (!Number.isFinite(value)) return '#f1f1f1'
  const t = Math.max(0, Math.min(1, (value - low) / (high - low || 1)))
  const shades = ['#f0f0f0','#d9d9d9','#bfbfbf','#999999','#6d6d6d','#2c2c2c']
  return shades[Math.min(shades.length-1, Math.floor(t * shades.length))]
}
function findingFor(metric, ctx) {
  const place = band(ctx)
  const phrases = {
    adult_share_pct:`El peso de población de 18 años y más está ${place}.`,
    prom_ocup:`El tamaño medio del hogar está ${place}.`,
    interstate_2015_pct:`La proporción que residía en otra entidad en 2015 está ${place}.`,
    born_elsewhere_pct:`La presencia de población nacida fuera de Sinaloa está ${place}.`,
    housing_density_km2:`La concentración de vivienda habitada está ${place}.`,
    households_per_dwelling:`La relación hogares/vivienda está ${place}.`,
    auto_homes_pct:`La disponibilidad de automóvil está ${place}.`,
    servicios_completos_pct:`La cobertura conjunta de agua, drenaje y electricidad está ${place}.`,
    pea_pct:`El peso de la PEA está ${place}.`,
    ocupacion_pct:`La tasa de ocupación está ${place}.`,
    employed_per_household:`La base de ocupados por hogar está ${place}.`,
    unemployment_pct:`La proporción desocupada está ${place}.`,
  }
  return phrases[metric.key] || `El indicador está ${place}.`
}

function ProfileMap({geometry,records,metricKey,selectedId,onSelect,scope,setScope}) {
  const nodeRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const firstRef = useRef(true)
  const metric = ALL_METRICS.find(m=>m.key===metricKey)
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
        return { color:active?'#000':'#8f8f8f', weight:active?2.6:.9, fillColor:metric?grayscale(value,low,high):'#e6e6e6', fillOpacity:active?.96:.82 }
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
  return <article className={`ad-decision${active?' active':''}`}>
    <div className="ad-decision-top"><span>{metric.title}</span><b>{ctx?`P${ctx.percentile}`:'s/ref.'}</b></div>
    <strong>{formatMetric(metric,value)}</strong>
    <small>{ctx?`P${ctx.percentile} · mediana ${formatMetric(metric,ctx.median)}`:'No hay comparación urbana suficiente'}</small>
    <p><b>Lectura</b>{findingFor(metric,ctx)}</p>
    <p><b>Para qué sirve</b>{metric.use}</p>
    <button onClick={()=>onCompare(metric.key)}>{active?'Mostrando en mapa':'Comparar en mapa'}</button>
  </article>
}

function DetailGrid({fields}) {
  return <div className="ad-detail-grid">{fields.filter(field=>field.value!=='No disponible').map(field=><div key={field.label}><span>{field.label}</span><strong>{field.value}</strong>{field.note?<small>{field.note}</small>:null}</div>)}</div>
}
function Details({title,subtitle,fields,footer}) {
  return <details className="ad-detail" open><summary><div><strong>{title}</strong><span>{subtitle}</span></div><i>+</i></summary><DetailGrid fields={fields}/>{footer?<p className="ad-detail-foot">{footer}</p>:null}</details>
}

function Inspector({record,benchmark,metricKey,onCompare,section}) {
  const sectionDef=SECTIONS.find(item=>item.id===section)||SECTIONS[0]
  const metrics=SECTION_METRICS[section]
  if(!record) return <aside className="ad-inspector ad-empty"><div className="ad-empty-icon">⌖</div><strong>Selecciona un AGEB</strong><p>La ficha derecha abrirá el análisis de <b>{sectionDef.label}</b> para ese polígono.</p><div><b>Perfil territorial</b><span>Las variables comparables aparecen en la ficha y sólo pasan al mapa cuando tú lo decides.</span></div></aside>
  const contexts=metrics.map(metric=>({metric,ctx:contextFor(benchmark,metric.key,record[metric.key])})).filter(x=>x.ctx)
  const strongest=[...contexts].sort((a,b)=>Math.abs((b.ctx?.percentile||50)-50)-Math.abs((a.ctx?.percentile||50)-50))[0]

  let title='Demografía útil', subtitle='estructura del hogar y movilidad, no conteos sueltos', executive='Perfil demográfico sin una señal dominante.', executiveText='Aquí no se trata a la población como demanda. Se compara composición, tamaño de hogar y movilidad para describir el tipo de tejido residencial que ya existe.'
  let details=null
  if(section==='demografia'){
    const names={adult_share_pct:'peso adulto',prom_ocup:'tamaño de hogar',interstate_2015_pct:'movilidad interestatal',born_elsewhere_pct:'origen fuera del estado'}
    executive=strongest?`La señal que más distingue este AGEB es ${names[strongest.metric.key]}.`:executive
    details=<Details title="Datos que explican el perfil" subtitle="conteos censales detrás de las señales" fields={[
      {label:'Población total',value:fmt(record.pobtot),note:'contexto de escala, no demanda'},
      {label:'Población de 18 años y más',value:fmt(record.p_18ymas),note:num(record.adult_share_pct)===null?null:`${pct(record.adult_share_pct)} del total`},
      {label:'Ocupantes por vivienda',value:fmt(record.prom_ocup,1)},
      {label:'Promedio de hijas/os nacidos vivos',value:fmt(record.prom_hnv,1),note:'mujeres de 12 años y más'},
      {label:'Nacida en otra entidad',value:fmt(record.pnacoe),note:num(record.born_elsewhere_pct)===null?null:`${pct(record.born_elsewhere_pct)} del total`},
      {label:'Residía en otra entidad en 2015',value:fmt(record.presoe15),note:num(record.interstate_2015_pct)===null?null:`${pct(record.interstate_2015_pct)} del total`},
    ]} footer="Estas variables describen composición. Para demanda, precio o absorción hacen falta datos inmobiliarios adicionales."/>
  }
  if(section==='vivienda'){
    title='Vivienda y habitabilidad';subtitle='intensidad residencial, equipamiento y cobertura'
    executive=`El tejido residencial está ${band(contextFor(benchmark,'housing_density_km2',record.housing_density_km2))} en densidad.`
    executiveText='La ficha separa intensidad, carga de hogares, motorización y servicios. Son condiciones del parque existente, no una estimación de viviendas que se podrían vender.'
    details=<Details title="Parque habitado" subtitle="datos base del tejido residencial" fields={[
      {label:'Viviendas particulares habitadas',value:fmt(record.vivpar_hab)},
      {label:'Hogares censales',value:fmt(record.tothog),note:'no equivale a compradores'},
      {label:'Ocupantes por vivienda',value:fmt(record.prom_ocup,1)},
      {label:'Viviendas con internet',value:pct(record.internet_homes_pct)},
      {label:'Agua entubada',value:pct(record.agua_pct)},
      {label:'Drenaje',value:pct(record.drenaje_pct)},
      {label:'Electricidad',value:pct(record.electricidad_pct)},
    ]}/>
  }
  if(section==='trabajo'){
    title='Trabajo y base laboral';subtitle='participación, ocupación y estructura laboral residente'
    executive=`La participación laboral está ${band(contextFor(benchmark,'pea_pct',record.pea_pct))}.`
    executiveText='Se distingue la estructura laboral de quienes viven en el AGEB del empleo localizado en la zona. Aquí no se usan salarios ni se infiere capacidad hipotecaria.'
    details=<Details title="Conteos laborales" subtitle="base censal detrás de las tasas" fields={[
      {label:'PEA',value:fmt(record.pea)},
      {label:'Población ocupada',value:fmt(record.pocupada)},
      {label:'Población desocupada',value:fmt(record.pdesocup)},
      {label:'Población total',value:fmt(record.pobtot)},
    ]}/>
  }
  return <aside className="ad-inspector">
    <div className="ad-inspector-head"><div><span>PERFIL TERRITORIAL · 2020</span><h2>{title}</h2><p>AGEB {String(record.cvegeo_ageb).slice(-4)} · {subtitle}</p></div><code>{record.cvegeo_ageb}</code></div>
    <section className="ad-executive"><span>LECTURA DEL AGEB</span><strong>{executive}</strong><p>{executiveText}</p></section>
    <div className="ad-decision-grid">{metrics.map(metric=><DecisionCard key={metric.key} metric={metric} record={record} benchmark={benchmark} active={metricKey===metric.key} onCompare={onCompare}/>)}</div>
    {details}
  </aside>
}

export default function AgebDemografia() {
  const [state,setState]=useState({loading:true,error:'',records:null,geometry:null})
  const [selectedId,setSelectedId]=useState(null)
  const [metricKey,setMetricKey]=useState(null)
  const [scope,setScope]=useState('city')
  const [section,setSection]=useState('demografia')
  useEffect(()=>{
    const controller=new AbortController()
    Promise.all([
      fetch('/data/ageb-core.json',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AGEB core ${r.status}`);return r.json()}),
      fetch('/data/ageb-profile-extra.json',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AGEB extra ${r.status}`);return r.json()}),
      fetch('/data/ageb-geometry-2020.geojson',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`AGEB geometry ${r.status}`);return r.json()}),
      fetch('/data/developer-intelligence.json',{signal:controller.signal,cache:'no-store'}).then(r=>r.ok?r.json():({records:[]})),
    ]).then(([core,extra,geometry,intelligence])=>setState({loading:false,error:'',records:enrich(unpack(core),extra,intelligence),geometry})).catch(error=>{if(!controller.signal.aborted)setState({loading:false,error:String(error),records:null,geometry:null})})
    return()=>controller.abort()
  },[])
  if(state.loading) return <div className="ad-state">Cargando perfil territorial por AGEB…</div>
  if(state.error) return <div className="ad-state ad-error">No se pudo cargar la base AGEB · {state.error}</div>
  const allRecords=Object.values(state.records||{}).filter(r=>Number(r.pobtot||0)>0)
  const cityRecords=allRecords.filter(isCity)
  const selected=selectedId?state.records[selectedId]:null
  const activeSection=SECTIONS.find(item=>item.id===section)||SECTIONS[0]
  const chooseSection=id=>{setSection(id);setMetricKey(null)}
  return <main className="ad-page">
    <header className="ad-page-head"><div><span>AGEB / MAZATLÁN · PERFIL TERRITORIAL 2020</span><h1>Perfil territorial por AGEB.</h1><p>Composición demográfica, vivienda y estructura laboral con lectura comparativa para cada polígono.</p></div><div className="ad-coverage"><strong>{cityRecords.length}</strong><span>AGEB ciudad</span><i/><strong>{allRecords.length}</strong><span>integradas</span></div></header>
    <section className="ad-workbench">
      <div className="ad-map-card">
        <ProfileMap geometry={state.geometry} records={state.records} metricKey={metricKey} selectedId={selectedId} onSelect={setSelectedId} scope={scope} setScope={setScope}/>
        <aside className="ad-filter-rail">
          <div className="ad-filter-head"><div><span>Perfil territorial</span><strong>{activeSection.label}</strong></div><small>AGEB · Mazatlán</small></div>
          <section className="ad-source"><div><strong>Variables territoriales</strong><span>Perfil por AGEB · 2020</span></div>{SECTIONS.map(item=><button key={item.id} type="button" className={section===item.id?'active':''} onClick={()=>chooseSection(item.id)}><i/><span><strong>{item.label}</strong><small>{item.description}</small></span><b>›</b></button>)}</section>
        </aside>
        <div className="ad-map-foot"><div><strong>{activeSection.label}</strong><span>{metricKey?`Comparación activa: ${ALL_METRICS.find(m=>m.key===metricKey)?.mapLabel||metricKey}.`:'Mapa neutro · selecciona un AGEB para abrir su ficha.'}</span></div>{metricKey?<button onClick={()=>setMetricKey(null)}>Quitar comparación</button>:null}</div>
      </div>
      <Inspector record={selected} benchmark={cityRecords} metricKey={metricKey} onCompare={setMetricKey} section={section}/>
    </section>
  </main>
}
