import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  Search, SlidersHorizontal, Layers3, Users, Store, Hotel, Utensils,
  Building2, MapPinned, Crosshair, Download, Plus, X, TrendingUp,
  Home, BriefcaseBusiness, Info, ArrowUpRight, BarChart3
} from 'lucide-react'
import './propertyExplorer.css'

const fmt = (v, d = 0) => Number.isFinite(Number(v))
  ? Number(v).toLocaleString('es-MX', { minimumFractionDigits:d, maximumFractionDigits:d })
  : '—'
const pct = (v, d = 1) => Number.isFinite(Number(v)) ? fmt(v,d) + '%' : '—'
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v))
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0
const isCity = record => {
  const id = String(record?.cvegeo_ageb || '')
  return id.slice(5,9) === '0001' && num(record?.pobtot) > 0
}
const radiusFactor = { '500 m':0.62, '1 km':1, '2 km':2.35, '3 km':3.9 }

function seed(id, salt = 0) {
  const s = String(id) + ':' + salt
  let h = 2166136261
  for (let i=0;i<s.length;i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

function marketFor(record, radius = '1 km') {
  const id = String(record?.cvegeo_ageb || '')
  const pop = num(record?.pobtot)
  const households = num(record?.tothog)
  const adults = num(record?.adult_share_pct)
  const f = radiusFactor[radius] || 1

  const establishments = Math.max(14, Math.round((24 + pop * 0.031 + seed(id,1) * 145) * f))
  const restaurants = Math.max(2, Math.round(establishments * (0.075 + seed(id,2) * 0.085)))
  const hotels = Math.max(0, Math.round((seed(id,3) * 12 + (restaurants > 35 ? 4 : 0)) * f))
  const retail = Math.max(3, Math.round(establishments * (0.19 + seed(id,4) * 0.08)))
  const professional = Math.max(2, Math.round(establishments * (0.12 + seed(id,5) * 0.08)))
  const health = Math.max(1, Math.round(establishments * (0.045 + seed(id,6) * 0.04)))
  const education = Math.max(1, Math.round(establishments * (0.03 + seed(id,7) * 0.035)))
  const entertainment = Math.max(1, Math.round(establishments * (0.025 + seed(id,8) * 0.045)))
  const newBusinesses = Math.max(1, Math.round(establishments * (0.08 + seed(id,9) * 0.13)))
  const growth = -3 + seed(id,10) * 38
  const diversity = clamp(Math.round(43 + seed(id,11) * 49 + Math.min(8, establishments / 80)))
  const tourism = clamp(Math.round(19 + hotels * 2.3 + restaurants * 0.24 + entertainment * 0.8 + seed(id,12) * 17))
  const services = retail + professional + health + education + restaurants
  const serviceAccess = clamp(Math.round(34 + Math.min(43, services / Math.max(1,f) / 6) + seed(id,13) * 18))
  const demand = clamp(Math.round(30 + Math.min(30, households / 90) + adults * 0.22 + seed(id,14) * 12))
  const business = clamp(Math.round(30 + Math.min(26, establishments / Math.max(1,f) / 12) + Math.max(0,growth) * 0.7 + diversity * 0.18))
  const residential = clamp(Math.round(demand * 0.48 + serviceAccess * 0.34 + (100-tourism) * 0.08 + diversity * 0.1))
  const tourist = clamp(Math.round(tourism * 0.58 + business * 0.17 + serviceAccess * 0.17 + diversity * 0.08))
  const commercial = clamp(Math.round(business * 0.48 + demand * 0.18 + serviceAccess * 0.2 + diversity * 0.14))
  const mixed = clamp(Math.round(residential * 0.31 + tourist * 0.22 + commercial * 0.31 + diversity * 0.16))
  const vacancy = 7 + seed(id,15) * 24
  const avgDaily = Math.round((pop * 0.72 + establishments * 12 + tourism * 23) * Math.max(0.8, Math.sqrt(f)))

  const history = []
  const end = establishments
  const start = Math.max(10, Math.round(end / (1 + Math.max(-0.15,growth/100))))
  for (let y=2020;y<=2025;y++) {
    const t = (y-2020)/5
    const jitter = 1 + (seed(id,20+y)-0.5)*0.045
    history.push({year:y, value:Math.round((start + (end-start)*t)*jitter)})
  }

  return {
    establishments, restaurants, hotels, retail, professional, health, education,
    entertainment, newBusinesses, growth, diversity, tourism, serviceAccess, demand,
    business, residential, tourist, commercial, mixed, vacancy, avgDaily, history
  }
}

const PROFILE = {
  residential:{label:'Residencial',icon:Home,key:'residential'},
  tourist:{label:'Turístico',icon:Hotel,key:'tourist'},
  commercial:{label:'Comercial',icon:BriefcaseBusiness,key:'commercial'},
  mixed:{label:'Uso mixto',icon:Building2,key:'mixed'}
}

const LAYERS = {
  score:{label:'Ajuste al perfil',source:'Índice demo',format:v=>fmt(v)},
  population:{label:'Población',source:'INEGI 2020',format:v=>fmt(v)},
  denue:{label:'Establecimientos',source:'Demo DENUE',format:v=>fmt(v)},
  tourism:{label:'Intensidad turística',source:'Índice demo',format:v=>fmt(v)},
  growth:{label:'Crecimiento empresarial',source:'Demo DENUE',format:v=>pct(v,1)}
}

function metricValue(record, market, layer, profile) {
  if (layer === 'population') return num(record.pobtot)
  if (layer === 'denue') return market.establishments
  if (layer === 'tourism') return market.tourism
  if (layer === 'growth') return market.growth
  return market[PROFILE[profile].key]
}

function percentileColor(value, min, max, active) {
  if (active) return '#123f48'
  const t = clamp((value-min)/(max-min || 1),0,1)
  const colors = ['#e9f5f4','#cce8e5','#99d5d0','#63bbb6','#2e928f','#17666c']
  return colors[Math.min(colors.length-1, Math.floor(t*colors.length))]
}

function Badge({children, tone='demo'}) {
  return <span className={'reo-badge ' + tone}>{children}</span>
}

function TinyTrend({history}) {
  const max = Math.max(...history.map(d=>d.value),1)
  return <div className="reo-trend" aria-label="Evolución simulada de establecimientos">
    {history.map(d=><div key={d.year} className="reo-trend-col"><i style={{height:String(Math.max(8,d.value/max*100))+'%'}}/><span>{String(d.year).slice(-2)}</span></div>)}
  </div>
}

function ScoreBar({label,value,compact=false}) {
  return <div className={'reo-scorebar ' + (compact?'compact':'')}>
    <div><span>{label}</span><strong>{fmt(value)}</strong></div>
    <i><em style={{width:String(clamp(value))+'%'}}/></i>
  </div>
}

function ExplorerMap({geometry, records, profile, layer, radius, visibleIds, selectedId, onSelect}) {
  const node = useRef(null)
  const mapRef = useRef(null)
  const polygonsRef = useRef(null)
  const markersRef = useRef(null)
  const firstFit = useRef(true)
  const lookupRef = useRef({})

  const features = useMemo(() => (geometry?.features || []).filter(f=>{
    const id = String(f.properties?.cvegeo_ageb || f.properties?.CVEGEO || '').slice(0,13)
    return records[id] && isCity(records[id]) && visibleIds.has(id)
  }),[geometry,records,visibleIds])

  const values = useMemo(()=>features.map(f=>{
    const id=String(f.properties?.cvegeo_ageb || f.properties?.CVEGEO || '').slice(0,13)
    return metricValue(records[id], marketFor(records[id], radius), layer, profile)
  }).filter(Number.isFinite).sort((a,b)=>a-b),[features,records,radius,layer,profile])

  const min = values[Math.floor(values.length*.04)] ?? 0
  const max = values[Math.floor(values.length*.96)] ?? 100

  useEffect(()=>{
    if (!node.current || mapRef.current) return
    const map = L.map(node.current,{zoomControl:false,attributionControl:false,minZoom:10,maxZoom:17})
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20}).addTo(map)
    L.control.zoom({position:'bottomright'}).addTo(map)
    mapRef.current=map
    return()=>{map.remove();mapRef.current=null}
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map || !geometry) return
    if(polygonsRef.current) polygonsRef.current.remove()
    if(markersRef.current) markersRef.current.remove()
    lookupRef.current={}

    const fc={type:'FeatureCollection',features}
    const polygons=L.geoJSON(fc,{
      style:(feature)=>{
        const id=String(feature?.properties?.cvegeo_ageb || feature?.properties?.CVEGEO || '').slice(0,13)
        const r=records[id]
        const m=marketFor(r,radius)
        const v=metricValue(r,m,layer,profile)
        const active=id===selectedId
        return {
          color:active?'#153f48':'#ffffff',
          weight:active?2.6:0.75,
          fillColor:percentileColor(v,min,max,active),
          fillOpacity:active?0.86:0.62
        }
      },
      onEachFeature:(feature,l)=>{
        const id=String(feature?.properties?.cvegeo_ageb || feature?.properties?.CVEGEO || '').slice(0,13)
        const r=records[id]
        if(!r)return
        lookupRef.current[id]=l
        const m=marketFor(r,radius)
        const v=metricValue(r,m,layer,profile)
        l.bindTooltip(
          '<div class="reo-map-tip"><small>AGEB '+id.slice(-4)+'</small><strong>'+LAYERS[layer].format(v)+'</strong><span>'+LAYERS[layer].label+'</span></div>',
          {sticky:true,direction:'top',opacity:1}
        )
        l.on('click',()=>onSelect(id))
      }
    }).addTo(map)
    polygonsRef.current=polygons

    const markers=L.layerGroup()
    polygons.eachLayer(l=>{
      const feature=l.feature
      const id=String(feature?.properties?.cvegeo_ageb || feature?.properties?.CVEGEO || '').slice(0,13)
      const r=records[id]
      if(!r || !l.getBounds) return
      const m=marketFor(r,radius)
      const score=m[PROFILE[profile].key]
      const center=l.getBounds().getCenter()
      const marker=L.circleMarker(center,{
        radius:id===selectedId?6:4,
        color:'#ffffff',
        weight:1.2,
        fillColor:id===selectedId?'#122f37':'#2d7f83',
        fillOpacity:0.92
      })
      marker.bindTooltip('<div class="reo-dot-tip"><b>AGEB '+id.slice(-4)+'</b><span>Ajuste '+score+'/100</span></div>',{direction:'top',offset:[0,-3]})
      marker.on('click',()=>onSelect(id))
      marker.addTo(markers)
    })
    markers.addTo(map)
    markersRef.current=markers

    if(firstFit.current && polygons.getBounds().isValid()) {
      map.fitBounds(polygons.getBounds(),{padding:[20,20]})
      firstFit.current=false
    }
  },[geometry,features,records,profile,layer,radius,selectedId,onSelect,min,max])

  useEffect(()=>{
    const l=lookupRef.current[selectedId]
    const map=mapRef.current
    if(l && map && l.getBounds) map.flyToBounds(l.getBounds(),{padding:[90,90],maxZoom:14,duration:.45})
  },[selectedId])

  return <div ref={node} className="reo-map"/>
}

function Metric({label,value,badge='DEMO',real=false,icon:Icon}) {
  return <div className="reo-metric">
    <div className="reo-metric-top">{Icon&&<Icon size={15}/>}<span>{label}</span><Badge tone={real?'real':'demo'}>{badge}</Badge></div>
    <strong>{value}</strong>
  </div>
}

function CompareBlock({ids,records,radius,profile,onRemove}) {
  if(ids.length<2) return null
  const rows=ids.map(id=>{
    const r=records[id],m=marketFor(r,radius)
    return {id,r,m,score:m[PROFILE[profile].key]}
  })
  return <section className="reo-compare">
    <div className="reo-section-title"><span>Comparación rápida</span><Badge>DEMO + INEGI</Badge></div>
    <div className="reo-compare-grid">
      {rows.map(x=><div key={x.id}>
        <button className="reo-compare-remove" onClick={()=>onRemove(x.id)} aria-label="Quitar de comparación"><X size={12}/></button>
        <b>AGEB {x.id.slice(-4)}</b>
        <strong>{x.score}</strong>
        <span>Ajuste {PROFILE[profile].label.toLowerCase()}</span>
        <small>{fmt(x.r.pobtot)} hab. · {fmt(x.m.establishments)} establecimientos</small>
      </div>)}
    </div>
  </section>
}

function DetailPanel({record, radius, profile, tab, setTab, compared, onCompare, compareIds, records, onRemoveCompare}) {
  if(!record) return <div className="reo-detail-empty"><MapPinned size={26}/><h2>Selecciona una zona</h2><p>Haz clic en un AGEB del mapa o en un resultado para abrir su perfil territorial.</p></div>
  const id=String(record.cvegeo_ageb)
  const m=marketFor(record,radius)
  const score=m[PROFILE[profile].key]
  const profileLabel=PROFILE[profile].label

  return <div className="reo-detail-content">
    <div className="reo-detail-head">
      <div><span>MAZATLÁN · AGEB URBANA</span><h2>AGEB {id.slice(-4)}</h2><small>{id}</small></div>
      <div className="reo-score"><strong>{score}</strong><span>/100</span><small>Ajuste {profileLabel.toLowerCase()}</small></div>
    </div>

    <div className="reo-detail-actions">
      <button className={compared?'active':''} onClick={onCompare}>{compared?'En comparador':'Comparar zona'} <Plus size={14}/></button>
      <button onClick={()=>window.print()}>Ficha <Download size={14}/></button>
    </div>

    <nav className="reo-tabs">
      {['resumen','demografia','actividad','turismo'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}
    </nav>

    {tab==='resumen'&&<>
      <div className="reo-kpi-grid">
        <Metric icon={Users} label="Población AGEB" value={fmt(record.pobtot)} real badge="INEGI 2020"/>
        <Metric icon={Store} label={'Establecimientos · '+radius} value={fmt(m.establishments)}/>
        <Metric icon={TrendingUp} label="Crecimiento empresarial" value={(m.growth>=0?'+':'')+pct(m.growth)}/>
        <Metric icon={Hotel} label="Intensidad turística" value={fmt(m.tourism)+'/100'}/>
      </div>
      <section className="reo-section">
        <div className="reo-section-title"><span>Compatibilidad por producto</span><Badge>MODELO DEMO</Badge></div>
        <ScoreBar label="Residencial" value={m.residential}/>
        <ScoreBar label="Turístico" value={m.tourist}/>
        <ScoreBar label="Comercial" value={m.commercial}/>
        <ScoreBar label="Uso mixto" value={m.mixed}/>
      </section>
      <section className="reo-section">
        <div className="reo-section-title"><span>Lectura para desarrollo</span><Badge>INTERPRETACIÓN</Badge></div>
        <div className="reo-signals">
          <p><ArrowUpRight size={14}/><span><b>Demanda residente.</b> {fmt(record.tothog)} hogares censales y {fmt(record.prom_ocup,1)} ocupantes promedio por vivienda.</span></p>
          <p><ArrowUpRight size={14}/><span><b>Actividad económica.</b> La capa demo estima {fmt(m.newBusinesses)} altas recientes y un crecimiento empresarial de {pct(m.growth)}.</span></p>
          <p><ArrowUpRight size={14}/><span><b>Entorno turístico.</b> Intensidad {m.tourism>=70?'alta':m.tourism>=45?'media':'moderada'} con {fmt(m.hotels)} unidades de alojamiento y {fmt(m.restaurants)} establecimientos gastronómicos simulados en el contexto.</span></p>
        </div>
      </section>
      <CompareBlock ids={compareIds} records={records} radius={radius} profile={profile} onRemove={onRemoveCompare}/>
    </>}

    {tab==='demografia'&&<>
      <div className="reo-kpi-grid">
        <Metric label="Población" value={fmt(record.pobtot)} real badge="INEGI 2020"/>
        <Metric label="Hogares censales" value={fmt(record.tothog)} real badge="INEGI 2020"/>
        <Metric label="Viviendas habitadas" value={fmt(record.vivpar_hab)} real badge="INEGI 2020"/>
        <Metric label="Ocupantes / vivienda" value={fmt(record.prom_ocup,1)} real badge="INEGI 2020"/>
      </div>
      <section className="reo-section">
        <div className="reo-section-title"><span>Perfil residente</span><Badge tone="real">INEGI 2020</Badge></div>
        <ScoreBar label="Población adulta" value={record.adult_share_pct}/>
        <ScoreBar label="Mujeres" value={record.women_share_pct}/>
        <ScoreBar label="Nacidos en otra entidad" value={record.born_elsewhere_pct}/>
        <ScoreBar label="Residía en otra entidad en 2015" value={record.interstate_2015_pct}/>
      </section>
      <div className="reo-note"><Info size={14}/><span>Estas variables describen residentes del AGEB. No equivalen directamente a compradores ni a absorción inmobiliaria.</span></div>
    </>}

    {tab==='actividad'&&<>
      <div className="reo-kpi-grid">
        <Metric icon={Store} label="Establecimientos" value={fmt(m.establishments)}/>
        <Metric icon={Utensils} label="Restaurantes" value={fmt(m.restaurants)}/>
        <Metric icon={Building2} label="Comercio" value={fmt(m.retail)}/>
        <Metric icon={BriefcaseBusiness} label="Servicios prof." value={fmt(m.professional)}/>
      </div>
      <section className="reo-section">
        <div className="reo-section-title"><span>Mix económico simulado</span><Badge>DEMO DENUE</Badge></div>
        <div className="reo-mix-grid">
          <div><span>Salud</span><strong>{fmt(m.health)}</strong></div>
          <div><span>Educación</span><strong>{fmt(m.education)}</strong></div>
          <div><span>Entretenimiento</span><strong>{fmt(m.entertainment)}</strong></div>
          <div><span>Diversidad</span><strong>{fmt(m.diversity)}/100</strong></div>
        </div>
      </section>
      <section className="reo-section">
        <div className="reo-section-title"><span>Evolución de establecimientos</span><Badge>SIMULACIÓN 2020–2025</Badge></div>
        <TinyTrend history={m.history}/>
        <div className="reo-trend-summary"><span>2020</span><b>{fmt(m.history[0].value)} → {fmt(m.history.at(-1).value)}</b><span>2025</span></div>
      </section>
    </>}

    {tab==='turismo'&&<>
      <div className="reo-kpi-grid">
        <Metric icon={Hotel} label="Alojamiento" value={fmt(m.hotels)}/>
        <Metric icon={Utensils} label="Gastronomía" value={fmt(m.restaurants)}/>
        <Metric icon={BarChart3} label="Índice turístico" value={fmt(m.tourism)+'/100'}/>
        <Metric icon={Users} label="Población diaria" value={fmt(m.avgDaily)} badge="DEMO"/>
      </div>
      <section className="reo-section">
        <div className="reo-section-title"><span>Señales territoriales</span><Badge>DEMO</Badge></div>
        <ScoreBar label="Intensidad turística" value={m.tourism}/>
        <ScoreBar label="Acceso a servicios" value={m.serviceAccess}/>
        <ScoreBar label="Diversidad económica" value={m.diversity}/>
        <ScoreBar label="Demanda residente" value={m.demand}/>
      </section>
      <div className="reo-note"><Info size={14}/><span>La intensidad turística es un indicador demostrativo. En producción se calcularía con DENUE real, inventario hotelero y las series municipales de turismo conectadas a la base.</span></div>
    </>}

    <footer className="reo-provenance">
      <b>Proveniencia</b>
      <span><i className="real"/> Demografía: INEGI Censo 2020</span>
      <span><i className="demo"/> Actividad, turismo e índices: datos simulados para prototipo</span>
    </footer>
  </div>
}

export default function PropertyExplorer({records,geometry}) {
  const [profile,setProfile]=useState('mixed')
  const [layer,setLayer]=useState('score')
  const [radius,setRadius]=useState('1 km')
  const [selectedId,setSelectedId]=useState(null)
  const [tab,setTab]=useState('resumen')
  const [query,setQuery]=useState('')
  const [minPop,setMinPop]=useState(0)
  const [minBiz,setMinBiz]=useState(0)
  const [minTourism,setMinTourism]=useState(0)
  const [compareIds,setCompareIds]=useState([])

  const city = useMemo(()=>Object.values(records||{}).filter(isCity),[records])

  const ranked = useMemo(()=>city.map(r=>{
    const m=marketFor(r,radius)
    const score=m[PROFILE[profile].key]
    return {id:String(r.cvegeo_ageb),record:r,market:m,score}
  }).filter(x=>num(x.record.pobtot)>=minPop && x.market.establishments>=minBiz && x.market.tourism>=minTourism)
    .sort((a,b)=>b.score-a.score),[city,radius,profile,minPop,minBiz,minTourism])

  const visibleIds=useMemo(()=>new Set(ranked.map(x=>x.id)),[ranked])
  const selected=selectedId ? records?.[selectedId] : null

  useEffect(()=>{
    if(!ranked.length){setSelectedId(null);return}
    if(!selectedId || !visibleIds.has(selectedId)) setSelectedId(ranked[0].id)
  },[ranked,selectedId,visibleIds])

  const submitSearch=e=>{
    e.preventDefault()
    const term=query.trim().toLowerCase()
    if(!term)return
    const hit=city.find(r=>{
      const id=String(r.cvegeo_ageb)
      return id.toLowerCase().includes(term) || id.slice(-4).toLowerCase()===term
    })
    if(hit){setSelectedId(String(hit.cvegeo_ageb));setTab('resumen')}
  }

  const toggleCompare=id=>{
    setCompareIds(prev=>{
      if(prev.includes(id)) return prev.filter(x=>x!==id)
      if(prev.length<2) return [...prev,id]
      return [prev[1],id]
    })
  }

  return <main className="reo-page">
    <div className="reo-demo-banner"><span>PROTOTIPO FUNCIONAL</span><p>Demografía real de INEGI + DENUE, turismo e índices simulados para probar el flujo de decisión inmobiliaria.</p></div>
    <div className="reo-shell">
      <aside className="reo-filter">
        <div className="reo-filter-head"><SlidersHorizontal size={16}/><div><strong>Explorar mercado</strong><span>Mazatlán, Sinaloa</span></div></div>

        <form className="reo-search" onSubmit={submitSearch}>
          <Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar AGEB, ej. 1234"/><button>Ir</button>
        </form>

        <section className="reo-filter-section">
          <label>Perfil del proyecto</label>
          <div className="reo-profile-grid">
            {Object.entries(PROFILE).map(([key,p])=>{
              const Icon=p.icon
              return <button key={key} className={profile===key?'active':''} onClick={()=>setProfile(key)}><Icon size={15}/><span>{p.label}</span></button>
            })}
          </div>
        </section>

        <section className="reo-filter-section">
          <label><Layers3 size={13}/> Capa del mapa</label>
          <select value={layer} onChange={e=>setLayer(e.target.value)}>
            {Object.entries(LAYERS).map(([k,v])=><option value={k} key={k}>{v.label}</option>)}
          </select>
          <div className="reo-layer-source">{LAYERS[layer].source}</div>
        </section>

        <section className="reo-filter-section">
          <label><Crosshair size={13}/> Contexto alrededor</label>
          <div className="reo-radius">
            {Object.keys(radiusFactor).map(r=><button key={r} className={radius===r?'active':''} onClick={()=>setRadius(r)}>{r}</button>)}
          </div>
          <small>Los conteos demo de actividad y turismo cambian con el radio.</small>
        </section>

        <section className="reo-filter-section">
          <label>Filtros mínimos</label>
          <div className="reo-filter-row"><span>Población AGEB</span><select value={minPop} onChange={e=>setMinPop(Number(e.target.value))}><option value="0">Cualquiera</option><option value="2000">2,000+</option><option value="5000">5,000+</option><option value="8000">8,000+</option></select></div>
          <div className="reo-filter-row"><span>Establecimientos</span><select value={minBiz} onChange={e=>setMinBiz(Number(e.target.value))}><option value="0">Cualquiera</option><option value="75">75+</option><option value="150">150+</option><option value="250">250+</option></select></div>
          <div className="reo-filter-row"><span>Intensidad turística</span><select value={minTourism} onChange={e=>setMinTourism(Number(e.target.value))}><option value="0">Cualquiera</option><option value="40">40+</option><option value="60">60+</option><option value="75">75+</option></select></div>
        </section>

        <section className="reo-results">
          <div className="reo-results-head"><div><strong>{fmt(ranked.length)}</strong><span>zonas encontradas</span></div><Badge>DEMO</Badge></div>
          <div className="reo-results-list">
            {ranked.slice(0,12).map((x,i)=><button key={x.id} className={selectedId===x.id?'active':''} onClick={()=>{setSelectedId(x.id);setTab('resumen')}}>
              <span className="reo-rank">{String(i+1).padStart(2,'0')}</span>
              <div><b>AGEB {x.id.slice(-4)}</b><small>{fmt(x.record.pobtot)} hab. · {fmt(x.market.establishments)} estab.</small></div>
              <strong>{x.score}</strong>
            </button>)}
            {!ranked.length&&<div className="reo-no-results">No hay zonas que cumplan los filtros.</div>}
          </div>
        </section>
      </aside>

      <section className="reo-map-zone">
        <div className="reo-map-toolbar">
          <div><MapPinned size={14}/><strong>Visor de oportunidad</strong><span>{PROFILE[profile].label}</span></div>
          <div className="reo-map-tags"><Badge tone="real">CENSO REAL</Badge><Badge>CAPAS DEMO</Badge></div>
        </div>
        <ExplorerMap geometry={geometry} records={records} profile={profile} layer={layer} radius={radius} visibleIds={visibleIds} selectedId={selectedId} onSelect={id=>{setSelectedId(id);setTab('resumen')}}/>
        <div className="reo-map-legend">
          <span>{LAYERS[layer].label}</span>
          <div><i/><i/><i/><i/><i/><i/></div>
          <small><b>menor</b><b>mayor</b></small>
        </div>
        <div className="reo-map-count">{fmt(ranked.length)} AGEB visibles</div>
      </section>

      <aside className="reo-detail">
        <DetailPanel
          record={selected}
          radius={radius}
          profile={profile}
          tab={tab}
          setTab={setTab}
          compared={selectedId?compareIds.includes(selectedId):false}
          onCompare={()=>selectedId&&toggleCompare(selectedId)}
          compareIds={compareIds}
          records={records}
          onRemoveCompare={id=>setCompareIds(prev=>prev.filter(x=>x!==id))}
        />
      </aside>
    </div>
  </main>
}
