import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BarChart3, Building2, ChevronDown, Download, Info, Landmark, Map as MapIcon, Search, X } from 'lucide-react'
import { inppData, inppMeta } from './data'
import './styles.css'

const fmt = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('es-MX', { minimumFractionDigits:d, maximumFractionDigits:d }) : '—'
const pct = (v, d = 1) => Number.isFinite(Number(v)) ? `${fmt(v,d)}%` : '—'
const mxn = (v) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v)||0)
const compactMXN = (v) => {
  const n = Number(v)||0
  if (n >= 1e9) return `$${(n/1e9).toFixed(2)} mil M`
  if (n >= 1e6) return `$${(n/1e6).toFixed(1)} M`
  return mxn(n)
}
const ratio = (a,b,m=100) => Number(b)>0 && Number.isFinite(Number(a)) ? Number(a)/Number(b)*m : null
const num = (v) => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null

const METRICS = [
  { key:'pobtot', label:'Población', short:'Población', format:v=>fmt(v), help:'Tamaño de la población residente censada.' },
  { key:'adult_share_pct', label:'18 años y más', short:'Adultos', format:v=>pct(v), help:'Peso de la población adulta dentro del AGEB.' },
  { key:'prom_ocup', label:'Ocupantes por vivienda', short:'Hogar', format:v=>`${fmt(v,1)} pers.`, help:'Promedio de ocupantes por vivienda particular habitada.' },
  { key:'born_elsewhere_pct', label:'Nacidos en otra entidad', short:'Origen externo', format:v=>pct(v), help:'Población nacida fuera de Sinaloa; no equivale a migración reciente.' },
  { key:'interstate_2015_pct', label:'Residía en otra entidad en 2015', short:'Movilidad', format:v=>pct(v), help:'Señal de movilidad interestatal reciente al Censo 2020.' },
]

function unpackCore(payload) {
  const out = {}
  payload.rows.forEach(row => {
    const record = Object.fromEntries(payload.columns.map((c,i)=>[c,row[i]]))
    const id = String(record.cvegeo_ageb||'').trim()
    if (id) out[id] = record
  })
  return out
}
function derive(core, extra) {
  for (const r of extra.records || []) {
    const id = String(r.cvegeo_ageb||'').trim()
    if (id) core[id] = {...(core[id]||{}),...r}
  }
  Object.values(core).forEach(r => {
    r.adult_share_pct = ratio(r.p_18ymas,r.pobtot)
    r.born_elsewhere_pct = ratio(r.pnacoe,r.pobtot)
    r.interstate_2015_pct = ratio(r.presoe15,r.pobtot)
    r.women_share_pct = ratio(r.pobfem,r.pobtot)
    r.men_share_pct = ratio(r.pobmas,r.pobtot)
  })
  return core
}
function isCity(record) {
  const id=String(record.cvegeo_ageb||'')
  return id.slice(5,9)==='0001' && Number(record.pobtot||0)>0
}
function median(values) {
  const a=values.filter(v=>Number.isFinite(v)).sort((x,y)=>x-y)
  if (!a.length) return null
  const i=Math.floor(a.length/2)
  return a.length%2?a[i]:(a[i-1]+a[i])/2
}
function compareWord(value, values) {
  if (!Number.isFinite(Number(value))) return 'Sin comparación'
  const m=median(values.map(Number))
  if (!Number.isFinite(m)) return 'Sin comparación'
  const diff=(Number(value)-m)/(Math.abs(m)||1)
  if (diff > .12) return 'Por encima de la mediana urbana'
  if (diff < -.12) return 'Por debajo de la mediana urbana'
  return 'Cerca de la mediana urbana'
}

function Header({page,setPage}) {
  return <header className="site-header">
    <button className="brand" onClick={()=>setPage('territorio')}><span>G</span><div><strong>GROWA</strong><small>INMOBILIARIA</small></div></button>
    <nav>
      <button className={page==='territorio'?'active':''} onClick={()=>setPage('territorio')}>Territorio</button>
      <button className={page==='indicadores'?'active':''} onClick={()=>setPage('indicadores')}>Indicadores</button>
    </nav>
    <div className="header-context"><strong>Mazatlán, Sin.</strong><span>Inteligencia para desarrollo</span></div>
  </header>
}

function grayscale(value,min,max) {
  if (!Number.isFinite(value)) return '#f4f4f4'
  const t=Math.max(0,Math.min(1,(value-min)/(max-min||1)))
  const shades=['#f3f3f3','#dedede','#bdbdbd','#929292','#5f5f5f','#222222']
  return shades[Math.min(shades.length-1,Math.floor(t*shades.length))]
}

function AgebMap({geometry,records,metric,selectedId,onSelect,search}) {
  const node=useRef(null), mapRef=useRef(null), layerRef=useRef(null), firstFit=useRef(true)
  const metricDef=METRICS.find(m=>m.key===metric)||METRICS[0]
  const cityFeatures=useMemo(()=>geometry?.features?.filter(f=>{
    const id=String(f.properties?.cvegeo_ageb||f.properties?.CVEGEO||'').slice(0,13)
    return records[id] && isCity(records[id])
  })||[],[geometry,records])
  const values=useMemo(()=>cityFeatures.map(f=>num(records[String(f.properties?.cvegeo_ageb||f.properties?.CVEGEO||'').slice(0,13)]?.[metric])).filter(Number.isFinite).sort((a,b)=>a-b),[cityFeatures,records,metric])
  const lo=values[Math.floor(values.length*.05)]??0, hi=values[Math.floor(values.length*.95)]??1

  useEffect(()=>{
    if (!node.current || mapRef.current) return
    const map=L.map(node.current,{zoomControl:false,attributionControl:false,minZoom:10,maxZoom:17})
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20}).addTo(map)
    L.control.zoom({position:'bottomright'}).addTo(map)
    mapRef.current=map
    return()=>{map.remove();mapRef.current=null}
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!geometry)return
    if(layerRef.current) layerRef.current.remove()
    const fc={type:'FeatureCollection',features:cityFeatures}
    const layer=L.geoJSON(fc,{
      style:(feature)=>{
        const id=String(feature?.properties?.cvegeo_ageb||feature?.properties?.CVEGEO||'').slice(0,13)
        const active=id===selectedId
        const value=num(records[id]?.[metric])
        return {color:active?'#000':'#fff',weight:active?2.6:.8,fillColor:grayscale(value,lo,hi),fillOpacity:active?.92:.82}
      },
      onEachFeature:(feature,l)=>{
        const id=String(feature?.properties?.cvegeo_ageb||feature?.properties?.CVEGEO||'').slice(0,13)
        const r=records[id]
        if(!r)return
        l.bindTooltip(`<div class="map-tip"><span>AGEB ${id.slice(-4)}</span><strong>${metricDef.format(r[metric])}</strong><small>${metricDef.label}</small></div>`,{sticky:true,direction:'top',opacity:1})
        l.on('click',()=>onSelect(id))
      }
    }).addTo(map)
    layerRef.current=layer
    if(firstFit.current && layer.getBounds().isValid()) {map.fitBounds(layer.getBounds(),{padding:[18,18]});firstFit.current=false}
  },[geometry,cityFeatures,records,metric,selectedId,lo,hi,metricDef,onSelect])

  useEffect(()=>{
    if(!search||!mapRef.current||!layerRef.current)return
    const term=search.trim().toLowerCase()
    if(!term)return
    let hit=null
    layerRef.current.eachLayer(l=>{
      const p=l.feature?.properties||{}
      const id=String(p.cvegeo_ageb||p.CVEGEO||'').slice(0,13)
      if(id.toLowerCase().includes(term)||id.slice(-4).toLowerCase()===term) hit={l,id}
    })
    if(hit){onSelect(hit.id);mapRef.current.fitBounds(hit.l.getBounds(),{padding:[80,80],maxZoom:14})}
  },[search,onSelect])

  return <div ref={node} className="ageb-map" />
}

function Stat({label,value,note}) {return <div className="stat"><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>}
function Meter({label,value}) {
  const v=Math.max(0,Math.min(100,Number(value)||0))
  return <div className="meter"><div><span>{label}</span><b>{pct(value)}</b></div><i><em style={{width:`${v}%`}}/></i></div>
}

function AgebFicha({record,onClose}) {
  return <div className="ficha-overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <article className="ficha">
      <div className="ficha-actions"><button onClick={onClose}><X size={16}/> Cerrar</button><button className="black" onClick={()=>window.print()}><Download size={16}/> Imprimir / PDF</button></div>
      <div className="ficha-brand"><span>G</span><strong>GROWA / INMOBILIARIA</strong><code>AGEB {String(record.cvegeo_ageb).slice(-4)}</code></div>
      <header><small>PERFIL TERRITORIAL · CENSO 2020</small><h1>Composición demográfica</h1><p>Mazatlán, Sinaloa · {record.cvegeo_ageb}</p></header>
      <div className="ficha-grid">
        <Stat label="Población total" value={fmt(record.pobtot)}/><Stat label="18 años y más" value={pct(record.adult_share_pct)}/><Stat label="Ocupantes por vivienda" value={fmt(record.prom_ocup,1)}/><Stat label="Nacidos en otra entidad" value={pct(record.born_elsewhere_pct)}/>
      </div>
      <section className="ficha-section"><h3>Composición</h3>{num(record.women_share_pct)!==null&&<><Meter label="Mujeres" value={record.women_share_pct}/><Meter label="Hombres" value={record.men_share_pct}/></>}</section>
      <section className="ficha-section"><h3>Movilidad y hogar</h3><div className="ficha-grid small"><Stat label="Residía en otra entidad en 2015" value={pct(record.interstate_2015_pct)}/><Stat label="Hogares censales" value={fmt(record.tothog)}/><Stat label="Viviendas habitadas" value={fmt(record.vivpar_hab)}/><Stat label="Promedio hijos nacidos vivos" value={fmt(record.prom_hnv,1)}/></div></section>
      <footer>Fuente: INEGI, Censo de Población y Vivienda 2020. Variables descriptivas; no equivalen por sí solas a demanda inmobiliaria.</footer>
    </article>
  </div>
}

function Territory({data,geometry}) {
  const [metric,setMetric]=useState('pobtot'),[selectedId,setSelectedId]=useState(null),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[ficha,setFicha]=useState(false)
  const city=useMemo(()=>Object.values(data||{}).filter(isCity),[data])
  const selected=selectedId?data?.[selectedId]:null
  const metricDef=METRICS.find(m=>m.key===metric)||METRICS[0]
  const totals=useMemo(()=>({pop:city.reduce((a,r)=>a+(Number(r.pobtot)||0),0),households:city.reduce((a,r)=>a+(Number(r.tothog)||0),0),agebs:city.length}),[city])
  const valuesFor=(key)=>city.map(r=>num(r[key])).filter(Number.isFinite)

  return <main className="territory-page">
    <div className="page-intro">
      <div><span className="kicker">TERRITORIO · CENSO 2020</span><h1>Quién vive en cada zona.</h1><p>Selecciona un AGEB para entender el mercado residente: tamaño, estructura adulta, hogar y origen de la población.</p></div>
      <div className="intro-meta"><b>{totals.agebs}</b><span>AGEB urbanas integradas</span></div>
    </div>
    <section className="territory-workspace">
      <div className="map-side">
        <div className="map-controls">
          <div className="metric-tabs">{METRICS.map(m=><button key={m.key} className={metric===m.key?'active':''} onClick={()=>setMetric(m.key)}>{m.short}</button>)}</div>
          <form className="ageb-search" onSubmit={e=>{e.preventDefault();setSearch(query)}}><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar AGEB"/><button>Ir</button></form>
        </div>
        <div className="map-frame"><AgebMap geometry={geometry} records={data} metric={metric} selectedId={selectedId} onSelect={setSelectedId} search={search}/><div className="map-legend"><span>{metricDef.label}</span><div><i className="l1"/><i className="l2"/><i className="l3"/><i className="l4"/><i className="l5"/><i className="l6"/></div><small>menor <b>→</b> mayor</small></div></div>
        <div className="map-explainer"><Info size={14}/><span><b>{metricDef.label}.</b> {metricDef.help}</span></div>
      </div>
      <aside className="ageb-panel">
        {!selected ? <div className="panel-empty">
          <MapIcon size={24}/><span>MAZATLÁN URBANO</span><h2>Selecciona un polígono.</h2><p>La ficha de la derecha cambia con cada AGEB. El mapa sirve para comparar composición territorial, no para asumir que población equivale a compradores.</p>
          <div className="city-summary"><Stat label="Población en AGEB integradas" value={fmt(totals.pop)}/><Stat label="Hogares censales" value={fmt(totals.households)}/></div>
        </div> : <>
          <div className="panel-head"><div><span>AGEB URBANA</span><h2>{String(selected.cvegeo_ageb).slice(-4)}</h2><small>{selected.cvegeo_ageb}</small></div><button className="text-button" onClick={()=>setFicha(true)}>Generar ficha</button></div>
          <div className="panel-primary"><Stat label="Población total" value={fmt(selected.pobtot)} note={compareWord(selected.pobtot,valuesFor('pobtot'))}/><Stat label="Ocupantes por vivienda" value={fmt(selected.prom_ocup,1)} note={compareWord(selected.prom_ocup,valuesFor('prom_ocup'))}/></div>
          <section className="panel-section"><div className="section-label">COMPOSICIÓN</div>{num(selected.women_share_pct)!==null&&<><Meter label="Mujeres" value={selected.women_share_pct}/><Meter label="Hombres" value={selected.men_share_pct}/></>}<Meter label="18 años y más" value={selected.adult_share_pct}/></section>
          <section className="panel-section"><div className="section-label">ORIGEN Y MOVILIDAD</div><div className="detail-rows"><div><span>Nacidos en otra entidad</span><strong>{pct(selected.born_elsewhere_pct)}</strong></div><div><span>Residía en otra entidad en 2015</span><strong>{pct(selected.interstate_2015_pct)}</strong></div></div></section>
          <section className="panel-section"><div className="section-label">HOGAR</div><div className="detail-rows"><div><span>Hogares censales</span><strong>{fmt(selected.tothog)}</strong></div><div><span>Viviendas habitadas</span><strong>{fmt(selected.vivpar_hab)}</strong></div><div><span>Promedio hijas/os nacidos vivos</span><strong>{fmt(selected.prom_hnv,1)}</strong></div></div></section>
          <div className="panel-source">INEGI · Censo 2020 · AGEB urbana</div>
        </>}
      </aside>
    </section>
    {ficha&&selected&&<AgebFicha record={selected} onClose={()=>setFicha(false)}/>} 
  </main>
}

function LineChart({series,valueKey='i',height=220,formatValue=(v)=>fmt(v,1)}) {
  const vals=series.map(d=>Number(d[valueKey])).filter(Number.isFinite)
  const min=Math.min(...vals),max=Math.max(...vals),range=max-min||1,w=900,h=height,p=26
  const pts=series.map((d,i)=>`${p+(i/(series.length-1||1))*(w-p*2)},${p+(1-(Number(d[valueKey])-min)/range)*(h-p*2)}`).join(' ')
  const last=series.at(-1)
  return <div className="line-chart"><svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><line x1={p} y1={h-p} x2={w-p} y2={h-p} className="axis"/><line x1={p} y1={p} x2={w-p} y2={p} className="grid"/><polyline points={pts} className="chart-line" fill="none" vectorEffect="non-scaling-stroke"/></svg><div className="chart-labels"><span>{series[0]?.d}</span><strong>{last?.d} · {formatValue(last?.[valueKey])}</strong></div></div>
}

function ConstructionIndicators() {
  const [material,setMaterial]=useState('Subíndice materiales de construcción')
  const city=inppData.culiacan, latest=city.at(-1), mat=inppData.materials[material], ml=mat.at(-1)
  const highlight=['Subíndice materiales de construcción','Concreto premezclado','Varilla','Cable, alambre y conductores eléctricos','Subíndice de remuneraciones','Subíndice alquiler de maquinaria y equipo']
  return <div className="indicator-content">
    <div className="scope-note"><Info size={16}/><p><b>Escala correcta:</b> construcción residencial usa Culiacán como referencia disponible de Sinaloa. Los materiales, remuneraciones y maquinaria son nacionales. Mazatlán no aparece como ciudad INPP en este archivo.</p></div>
    <section className="indicator-hero">
      <div className="hero-copy"><span>CONSTRUCCIÓN RESIDENCIAL · CULIACÁN</span><h2>{fmt(latest.i,2)}</h2><p>Índice enero 2022 = 100 · agosto 2026</p></div>
      <Stat label="Variación anual" value={`${latest.y>=0?'+':''}${pct(latest.y,2)}`} note="ago 2026 vs ago 2025"/><Stat label="Variación mensual" value={`${latest.m>=0?'+':''}${pct(latest.m,2)}`} note="ago vs jul 2026"/><Stat label="Desde ene 2022" value={`+${pct(latest.i-100,1)}`} note="cambio acumulado del índice"/>
    </section>
    <section className="indicator-block"><div className="block-head"><div><span>01</span><h3>Trayectoria del costo residencial de referencia</h3></div><small>INPP · Culiacán, Sin.</small></div><LineChart series={city}/></section>
    <section className="indicator-block material-block"><div className="block-head"><div><span>02</span><h3>Qué insumo está presionando el proyecto</h3></div><label className="select-wrap"><select value={material} onChange={e=>setMaterial(e.target.value)}>{Object.keys(inppData.materials).map(k=><option key={k}>{k}</option>)}</select><ChevronDown size={15}/></label></div>
      <div className="material-layout"><div><div className="material-big"><span>{material}</span><strong>{fmt(ml.i,2)}</strong><small>índice · ene 2022 = 100</small></div><div className="material-deltas"><Stat label="Mensual" value={`${ml.m>=0?'+':''}${pct(ml.m,2)}`}/><Stat label="Interanual" value={`${ml.y>=0?'+':''}${pct(ml.y,2)}`}/></div></div><LineChart series={mat}/></div>
    </section>
    <section className="indicator-block"><div className="block-head"><div><span>03</span><h3>Presiones de costo · agosto 2026</h3></div><small>Variación interanual</small></div><div className="cost-table">{highlight.map(name=>{const l=inppData.materials[name].at(-1);return <div key={name}><span>{name.replace('Subíndice ','')}</span><div><i style={{width:`${Math.min(100,Math.max(3,Math.abs(l.y)/15*100))}%`}}/></div><strong>{l.y>=0?'+':''}{pct(l.y,1)}</strong></div>})}</div></section>
    <div className="method-note"><b>Cómo leerlo</b><p>{inppMeta.unitNote} Sirve para seguir presión de costos, presupuestar escenarios y detectar qué componentes se están encareciendo más rápido.</p><span>Fuente: {inppMeta.source} · corte {inppMeta.updated}</span></div>
  </div>
}

function FinancingIndicators({financing}) {
  const [seriesKey,setSeriesKey]=useState('actions')
  const h=financing.h1['2026'], yoy=financing.h1_2026_vs_2025
  const cfg={actions:{label:'Acciones',format:v=>fmt(v)},amount_mxn:{label:'Monto financiado',format:v=>compactMXN(v)},avg_amount_per_action:{label:'Ticket promedio',format:v=>compactMXN(v)}}[seriesKey]
  const ageTotal=financing.age_profile.reduce((a,d)=>a+d.actions,0)
  const demand=financing.potential_demand
  const maxDemand=Math.max(...demand.bands.map(d=>d.beneficiaries))
  return <div className="indicator-content">
    <div className="scope-note"><Landmark size={16}/><p><b>Escala municipal:</b> los financiamientos corresponden al municipio de Mazatlán. No se reparten ni estiman por AGEB.</p></div>
    <section className="finance-hero"><div><span>H1 2026</span><h2>{fmt(h.actions)}</h2><p>acciones de financiamiento</p></div><Stat label="Monto financiado" value={compactMXN(h.amount_mxn)} note={`${yoy.amount_pct>=0?'+':''}${pct(yoy.amount_pct,1)} vs H1 2025`}/><Stat label="Ticket promedio" value={compactMXN(h.avg_amount_per_action)} note={`${yoy.avg_ticket_pct>=0?'+':''}${pct(yoy.avg_ticket_pct,1)} vs H1 2025`}/><Stat label="Acciones" value={`${yoy.actions_pct>=0?'+':''}${pct(yoy.actions_pct,1)}`} note="variación interanual H1"/></section>
    <section className="indicator-block"><div className="block-head"><div><span>01</span><h3>Flujo mensual de financiamiento</h3></div><div className="mini-tabs">{Object.entries({actions:'Acciones',amount_mxn:'Monto',avg_amount_per_action:'Ticket'}).map(([k,l])=><button className={seriesKey===k?'active':''} onClick={()=>setSeriesKey(k)} key={k}>{l}</button>)}</div></div><LineChart series={financing.monthly} valueKey={seriesKey} formatValue={cfg.format}/></section>
    <div className="two-blocks">
      <section className="indicator-block"><div className="block-head"><div><span>02</span><h3>Edad de las personas financiadas</h3></div><small>acciones acumuladas del archivo</small></div><div className="horizontal-bars">{financing.age_profile.filter(d=>d.code!==null).map(d=><div key={d.label}><div><span>{d.label}</span><strong>{pct(d.actions/ageTotal*100,1)}</strong></div><i><em style={{width:`${d.actions/ageTotal*100}%`}}/></i><small>{fmt(d.actions)} acciones</small></div>)}</div></section>
      <section className="indicator-block"><div className="block-head"><div><span>03</span><h3>Demanda potencial INFONAVIT</h3></div><small>{demand.period} · {fmt(demand.total)} beneficiarios</small></div><div className="demand-list">{demand.bands.map(d=><div key={d.label}><span>{d.label}</span><i><em style={{width:`${d.beneficiaries/maxDemand*100}%`}}/></i><strong>{fmt(d.beneficiaries)}</strong></div>)}</div></section>
    </div>
    <div className="method-note"><b>Para qué sirve</b><p>Permite seguir profundidad del crédito formal, ticket financiado y composición de la demanda potencial. Es contexto de mercado municipal, no una predicción de ventas de un desarrollo.</p><span>Fuente: {financing.source} · observado hasta {financing.observed_through}</span></div>
  </div>
}

function Indicators({financing}) {
  const [section,setSection]=useState('construction')
  return <main className="indicators-page"><div className="page-intro indicator-intro"><div><span className="kicker">INDICADORES</span><h1>Lo que cambia la viabilidad de un proyecto.</h1><p>Costos de construcción, presión de insumos y profundidad del financiamiento. Cada indicador conserva su escala geográfica real.</p></div></div>
    <div className="indicator-nav"><button className={section==='construction'?'active':''} onClick={()=>setSection('construction')}><Building2 size={17}/><div><strong>Construcción y economía</strong><span>INPP · materiales · mano de obra</span></div></button><button className={section==='finance'?'active':''} onClick={()=>setSection('finance')}><Landmark size={17}/><div><strong>Financiamiento</strong><span>SNIIV / SEDATU · Mazatlán</span></div></button></div>
    {section==='construction'?<ConstructionIndicators/>:<FinancingIndicators financing={financing}/>} 
  </main>
}

function App() {
  const [page,setPageState]=useState(()=>location.hash==='#indicadores'?'indicadores':'territorio')
  const [state,setState]=useState({loading:true,error:'',records:null,geometry:null,financing:null})
  const setPage=(p)=>{setPageState(p);history.replaceState(null,'',p==='indicadores'?'#indicadores':'#territorio')}
  useEffect(()=>{
    const controller=new AbortController()
    Promise.all([
      fetch('/data/ageb-core.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('AGEB core');return r.json()}),
      fetch('/data/ageb-profile-extra.json',{signal:controller.signal}).then(r=>r.json()),
      fetch('/data/ageb-geometry-2020.geojson',{signal:controller.signal}).then(r=>r.json()),
      fetch('/data/financing-summary.json',{signal:controller.signal}).then(r=>r.json()),
    ]).then(([core,extra,geometry,financing])=>setState({loading:false,error:'',records:derive(unpackCore(core),extra),geometry,financing})).catch(e=>{if(!controller.signal.aborted)setState(s=>({...s,loading:false,error:String(e)}))})
    return()=>controller.abort()
  },[])
  return <div className="app"><Header page={page} setPage={setPage}/>{state.loading?<div className="loading"><i/> Cargando territorio e indicadores…</div>:state.error?<div className="loading error">No se pudo cargar la base territorial. {state.error}</div>:page==='territorio'?<Territory data={state.records} geometry={state.geometry}/>:<Indicators financing={state.financing}/>}</div>
}

createRoot(document.getElementById('root')).render(<App/>)
