import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  Search, SlidersHorizontal, Layers3, Users, Store, Hotel, Utensils,
  Building2, MapPinned, Crosshair, Download, Plus, X, TrendingUp,
  Home, BriefcaseBusiness, Info, ArrowUpRight, BarChart3, Map as MapIcon,
  Satellite, Bookmark, Ruler, Clock3, Eye, ListFilter
} from 'lucide-react'
import './propertyExplorer.css'

const fmt = (v, d = 0) => Number.isFinite(Number(v))
  ? Number(v).toLocaleString('es-MX', { minimumFractionDigits:d, maximumFractionDigits:d })
  : '—'
const pct = (v, d = 1) => Number.isFinite(Number(v)) ? fmt(v,d) + '%' : '—'
const money = v => Number.isFinite(Number(v))
  ? new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v))
  : '—'
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
  const opportunity = clamp(Math.round(mixed * .36 + commercial * .24 + residential * .18 + tourist * .12 + Math.max(0,growth) * .1))
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
    business, residential, tourist, commercial, mixed, opportunity, vacancy, avgDaily, history
  }
}

function prospectsFor(record, market) {
  if (!record || !market) return []
  const id = String(record.cvegeo_ageb || '')
  const types = ['Terreno','Local comercial','Uso mixto','Edificio','Terreno']
  const labels = ['Corredor principal','Esquina comercial','Nodo de servicios','Frente urbano','Reserva de suelo']
  return Array.from({length:5},(_,i)=>{
    const s = seed(id,60+i)
    const area = Math.round(420 + s*5200)
    const priceM2 = Math.round(7200 + seed(id,80+i)*24500)
    const score = clamp(Math.round(market.opportunity - 5 + seed(id,90+i)*12))
    return {
      id:id+'-'+(i+1),
      type:types[i],
      label:labels[i],
      address:'AGEB '+id.slice(-4)+' · Mazatlán, Sinaloa',
      area,
      priceM2,
      price:area*priceM2,
      score,
      tenure:Math.round(2+seed(id,100+i)*16),
      status:i<2?'Alta afinidad':'Explorar'
    }
  }).sort((a,b)=>b.score-a.score)
}

const PROFILES = {
  mixed:{label:'Uso mixto',icon:Building2,key:'mixed'},
  residential:{label:'Residencial',icon:Home,key:'residential'},
  tourist:{label:'Turístico',icon:Hotel,key:'tourist'},
  commercial:{label:'Comercial',icon:BriefcaseBusiness,key:'commercial'}
}

const LAYERS = {
  opportunity:{label:'Opportunity Score',source:'Modelo Growa · prototipo',format:v=>fmt(v)},
  population:{label:'Población',source:'INEGI 2020',format:v=>fmt(v)},
  denue:{label:'Establecimientos',source:'DENUE · prototipo',format:v=>fmt(v)},
  tourism:{label:'Intensidad turística',source:'Índice Growa · prototipo',format:v=>fmt(v)},
  growth:{label:'Crecimiento empresarial',source:'DENUE · prototipo',format:v=>pct(v,1)}
}

function metricValue(record, market, layer) {
  if (layer === 'population') return num(record.pobtot)
  if (layer === 'denue') return market.establishments
  if (layer === 'tourism') return market.tourism
  if (layer === 'growth') return market.growth
  return market.opportunity
}

function scaleColor(value, min, max, active) {
  if (active) return '#0f5960'
  const t = clamp((value-min)/(max-min || 1),0,1)
  const colors = ['#edf7f6','#d8eeec','#b5dedb','#82c7c2','#49a8a4','#217b7d']
  return colors[Math.min(colors.length-1, Math.floor(t*colors.length))]
}

function Badge({children, tone='demo'}) {
  return <span className={'reo-badge ' + tone}>{children}</span>
}

function TinyTrend({history}) {
  const max = Math.max(...history.map(d=>d.value),1)
  return <div className="reo-trend" aria-label="Evolución de establecimientos">
    {history.map(d=><div key={d.year} className="reo-trend-col"><i style={{height:String(Math.max(8,d.value/max*100))+'%'}}/><span>{String(d.year).slice(-2)}</span></div>)}
  </div>
}

function ScoreBar({label,value}) {
  const v=clamp(num(value))
  return <div className="reo-scorebar"><div><span>{label}</span><strong>{fmt(v)}/100</strong></div><i><em style={{width:v+'%'}}/></i></div>
}

function FilterSection({title,children,icon:Icon=ListFilter}) {
  return <section className="reo-filter-section">
    <label><Icon size={13}/>{title}</label>
    {children}
  </section>
}

function MapCanvas({geometry,records,marketById,selectedId,onSelect,layer,mapMode,showProspects}) {
  const node=useRef(null), mapRef=useRef(null), polygonRef=useRef(null), pointsRef=useRef(null), tileRef=useRef(null), firstFit=useRef(true)

  const cityFeatures=useMemo(()=>geometry?.features?.filter(f=>{
    const id=String(f.properties?.cvegeo_ageb||f.properties?.CVEGEO||'').slice(0,13)
    return records[id] && isCity(records[id])
  })||[],[geometry,records])

  const values=useMemo(()=>cityFeatures.map(f=>{
    const id=String(f.properties?.cvegeo_ageb||f.properties?.CVEGEO||'').slice(0,13)
    return metricValue(records[id],marketById[id],layer)
  }).filter(Number.isFinite).sort((a,b)=>a-b),[cityFeatures,records,marketById,layer])

  const lo=values[Math.floor(values.length*.04)]??0
  const hi=values[Math.floor(values.length*.96)]??1

  useEffect(()=>{
    if (!node.current || mapRef.current) return
    const map=L.map(node.current,{zoomControl:false,attributionControl:false,minZoom:10,maxZoom:18})
    L.control.zoom({position:'bottomright'}).addTo(map)
    mapRef.current=map
    return()=>{map.remove();mapRef.current=null}
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map)return
    if(tileRef.current) tileRef.current.remove()
    const url=mapMode==='satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    tileRef.current=L.tileLayer(url,{subdomains:'abcd',maxZoom:20}).addTo(map)
    tileRef.current.bringToBack()
  },[mapMode])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!geometry)return
    if(polygonRef.current) polygonRef.current.remove()
    if(pointsRef.current) pointsRef.current.remove()

    const fc={type:'FeatureCollection',features:cityFeatures}
    const layerGroup=L.geoJSON(fc,{
      style:(feature)=>{
        const id=String(feature?.properties?.cvegeo_ageb||feature?.properties?.CVEGEO||'').slice(0,13)
        const active=id===selectedId
        const value=metricValue(records[id],marketById[id],layer)
        return {
          color:active?'#0b3f44':'#ffffff',
          weight:active?2.3:.85,
          fillColor:scaleColor(value,lo,hi,active),
          fillOpacity:mapMode==='satellite'?(active?.72:.58):(active?.92:.82)
        }
      },
      onEachFeature:(feature,l)=>{
        const id=String(feature?.properties?.cvegeo_ageb||feature?.properties?.CVEGEO||'').slice(0,13)
        const r=records[id], m=marketById[id]
        if(!r||!m)return
        const value=metricValue(r,m,layer)
        l.bindTooltip('<div class="reo-map-tip"><small>AGEB '+id.slice(-4)+'</small><strong>'+LAYERS[layer].format(value)+'</strong><span>'+LAYERS[layer].label+'</span></div>',{sticky:true,direction:'top',opacity:1})
        l.on('click',()=>onSelect(id))
      }
    }).addTo(map)
    polygonRef.current=layerGroup

    if(showProspects){
      const pts=L.layerGroup()
      layerGroup.eachLayer(l=>{
        const id=String(l.feature?.properties?.cvegeo_ageb||l.feature?.properties?.CVEGEO||'').slice(0,13)
        const m=marketById[id]
        if(!m || m.opportunity<70)return
        const c=l.getBounds().getCenter()
        L.circleMarker(c,{radius:4.5,color:'#fff',weight:1.5,fillColor:'#103f48',fillOpacity:.95})
          .bindTooltip('<div class="reo-dot-tip"><b>Oportunidad detectada</b><span>Score '+fmt(m.opportunity)+'/100 · prototipo</span></div>',{direction:'top'})
          .on('click',()=>onSelect(id))
          .addTo(pts)
      })
      pts.addTo(map)
      pointsRef.current=pts
    }

    if(firstFit.current && layerGroup.getBounds().isValid()){
      map.fitBounds(layerGroup.getBounds(),{padding:[18,18]})
      firstFit.current=false
    }
  },[geometry,cityFeatures,records,marketById,selectedId,layer,lo,hi,mapMode,showProspects,onSelect])

  useEffect(()=>{
    const group=polygonRef.current, map=mapRef.current
    if(!group||!map||!selectedId)return
    group.eachLayer(l=>{
      const id=String(l.feature?.properties?.cvegeo_ageb||l.feature?.properties?.CVEGEO||'').slice(0,13)
      if(id===selectedId) map.fitBounds(l.getBounds(),{padding:[90,90],maxZoom:14})
    })
  },[selectedId])

  return <div ref={node} className="reo-map"/>
}

function ZoneDetail({record,market,profile,onSelectProperty}) {
  if(!record||!market)return null
  const id=String(record.cvegeo_ageb)
  const props=prospectsFor(record,market)
  return <>
    <div className="reo-detail-head">
      <div><span>PERFIL DE UBICACIÓN · AGEB {id.slice(-4)}</span><h2>Mazatlán urbano</h2><small>{id} · radio analítico seleccionado</small></div>
      <div className="reo-score"><strong>{fmt(market.opportunity)}</strong><span>/100</span><small>Opportunity Score</small></div>
    </div>
    <div className="reo-detail-actions">
      <button><Bookmark size={13}/> Guardar</button>
      <button><Download size={13}/> Exportar</button>
    </div>
    <div className="reo-tabs">
      <button className="active">Resumen</button><button>Demografía</button><button>Negocios</button><button>Turismo</button>
    </div>

    <div className="reo-kpi-grid">
      <div className="reo-metric"><div className="reo-metric-top"><Users size={14}/><span>Población</span></div><strong>{fmt(record.pobtot)}</strong><small>INEGI 2020</small></div>
      <div className="reo-metric"><div className="reo-metric-top"><Store size={14}/><span>Establecimientos</span></div><strong>{fmt(market.establishments)}</strong><small>prototipo territorial</small></div>
      <div className="reo-metric"><div className="reo-metric-top"><TrendingUp size={14}/><span>Crecimiento</span></div><strong>{pct(market.growth)}</strong><small>señal 2020–2025</small></div>
      <div className="reo-metric"><div className="reo-metric-top"><Eye size={14}/><span>Flujo diario</span></div><strong>{fmt(market.avgDaily)}</strong><small>estimación demo</small></div>
    </div>

    <section className="reo-section">
      <div className="reo-section-title"><span>Ajuste por estrategia</span><Badge>MODELO DEMO</Badge></div>
      <ScoreBar label="Residencial" value={market.residential}/>
      <ScoreBar label="Comercial" value={market.commercial}/>
      <ScoreBar label="Turístico" value={market.tourist}/>
      <ScoreBar label="Uso mixto" value={market.mixed}/>
    </section>

    <section className="reo-section">
      <div className="reo-section-title"><span>Señales de mercado</span><ArrowUpRight size={13}/></div>
      <div className="reo-signals">
        <p><TrendingUp size={13}/><span><b>{fmt(market.newBusinesses)} aperturas potenciales</b> dentro del universo demo y crecimiento de {pct(market.growth)}.</span></p>
        <p><Utensils size={13}/><span><b>{fmt(market.restaurants)} establecimientos de alimentos</b> y {fmt(market.hotels)} señales vinculadas con hospedaje.</span></p>
        <p><MapPinned size={13}/><span><b>Acceso a servicios {fmt(market.serviceAccess)}/100</b> y diversidad comercial {fmt(market.diversity)}/100.</span></p>
      </div>
    </section>

    <section className="reo-section">
      <div className="reo-section-title"><span>Actividad económica</span><small>2020–2025</small></div>
      <TinyTrend history={market.history}/>
      <div className="reo-trend-summary"><span>establecimientos · serie prototipo</span><b>{market.history[0].value} → {market.history.at(-1).value}</b></div>
    </section>

    <section className="reo-section reo-properties">
      <div className="reo-section-title"><span>Oportunidades detectadas</span><Badge tone="real">5 ACTIVOS</Badge></div>
      {props.slice(0,4).map(p=><button key={p.id} onClick={()=>onSelectProperty(p)}>
        <div><b>{p.label}</b><span>{p.type} · {fmt(p.area)} m²</span></div>
        <strong>{p.score}</strong>
        <ArrowUpRight size={13}/>
      </button>)}
    </section>

    <div className="reo-note"><Info size={13}/><span>Interfaz de prototipo. Demografía proviene de INEGI; indicadores de negocio, oportunidades y activos mostrados aquí se presentan como simulación visual hasta conectar las fuentes inmobiliarias definitivas.</span></div>
  </>
}

function PropertyDetail({property,record,market,onBack}) {
  if(!property)return null
  return <>
    <div className="reo-property-back"><button onClick={onBack}>← Volver a ubicación</button><Badge>ACTIVO SIMULADO</Badge></div>
    <div className="reo-detail-head reo-property-head">
      <div><span>{property.type.toUpperCase()}</span><h2>{property.label}</h2><small>{property.address}</small></div>
      <div className="reo-score"><strong>{property.score}</strong><span>/100</span><small>afinidad</small></div>
    </div>
    <div className="reo-property-value"><span>Valor de referencia</span><strong>{money(property.price)}</strong><small>{money(property.priceM2)} / m²</small></div>
    <div className="reo-detail-actions">
      <button><Bookmark size={13}/> Guardar activo</button>
      <button className="primary"><Plus size={13}/> Crear prospecto</button>
    </div>
    <div className="reo-tabs"><button className="active">Resumen</button><button>Propiedad</button><button>Mercado</button><button>Ubicación</button></div>

    <div className="reo-kpi-grid">
      <div className="reo-metric"><div className="reo-metric-top"><Ruler size={14}/><span>Superficie</span></div><strong>{fmt(property.area)} m²</strong><small>simulada</small></div>
      <div className="reo-metric"><div className="reo-metric-top"><Building2 size={14}/><span>Tipo</span></div><strong className="small-value">{property.type}</strong><small>clasificación demo</small></div>
      <div className="reo-metric"><div className="reo-metric-top"><Clock3 size={14}/><span>Tenencia</span></div><strong>{property.tenure} años</strong><small>simulada</small></div>
      <div className="reo-metric"><div className="reo-metric-top"><BarChart3 size={14}/><span>Zona</span></div><strong>{fmt(market?.opportunity)}/100</strong><small>Opportunity Score</small></div>
    </div>

    <section className="reo-section">
      <div className="reo-section-title"><span>Contexto Growa</span><Badge tone="real">TERRITORIO</Badge></div>
      <ScoreBar label="Demanda residencial" value={market?.demand}/>
      <ScoreBar label="Actividad comercial" value={market?.business}/>
      <ScoreBar label="Intensidad turística" value={market?.tourism}/>
      <ScoreBar label="Acceso a servicios" value={market?.serviceAccess}/>
    </section>

    <section className="reo-section">
      <div className="reo-section-title"><span>Mercado inmediato</span></div>
      <div className="reo-mix-grid">
        <div><span>Población</span><strong>{fmt(record?.pobtot)}</strong></div>
        <div><span>Establecimientos</span><strong>{fmt(market?.establishments)}</strong></div>
        <div><span>Restaurantes</span><strong>{fmt(market?.restaurants)}</strong></div>
        <div><span>Hoteles / hospedaje</span><strong>{fmt(market?.hotels)}</strong></div>
      </div>
    </section>

    <section className="reo-section">
      <div className="reo-section-title"><span>Propietario y contacto</span><Badge>PRÓXIMA CAPA</Badge></div>
      <div className="reo-owner-placeholder">
        <Building2 size={18}/><div><b>Resolución de propietario</b><span>Este bloque quedará conectado a registros de propiedad, estructura corporativa y datos de contacto cuando integremos la fuente correspondiente.</span></div>
      </div>
    </section>

    <div className="reo-note"><Info size={13}/><span>El activo y los valores inmobiliarios son simulados para diseñar el flujo Reonomy → análisis Growa. No deben interpretarse como una oferta, avalúo ni propiedad real.</span></div>
  </>
}

export default function PropertyExplorer({records,geometry,mode='explorar'}) {
  const [query,setQuery]=useState('')
  const [layer,setLayer]=useState('opportunity')
  const [profile,setProfile]=useState('mixed')
  const [radius,setRadius]=useState('1 km')
  const [selectedId,setSelectedId]=useState(null)
  const [selectedProperty,setSelectedProperty]=useState(null)
  const [minScore,setMinScore]=useState(0)
  const [growthFilter,setGrowthFilter]=useState('all')
  const [mapMode,setMapMode]=useState('map')
  const [showProspects,setShowProspects]=useState(true)

  const city=useMemo(()=>Object.values(records||{}).filter(isCity),[records])
  const marketById=useMemo(()=>{
    const out={}
    city.forEach(r=>{out[String(r.cvegeo_ageb)]=marketFor(r,radius)})
    return out
  },[city,radius])

  const ranked=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return city.map(r=>{
      const id=String(r.cvegeo_ageb)
      const m=marketById[id]
      return {r,m,id,score:m?.[PROFILES[profile].key] ?? m?.opportunity ?? 0}
    }).filter(x=>{
      const queryOk=!q || x.id.toLowerCase().includes(q) || x.id.slice(-4).includes(q)
      const scoreOk=(x.m?.opportunity||0)>=minScore
      const growthOk=growthFilter==='all' || (growthFilter==='positive' ? x.m.growth>0 : x.m.growth>=15)
      return queryOk && scoreOk && growthOk
    }).sort((a,b)=>b.score-a.score)
  },[city,marketById,profile,query,minScore,growthFilter])

  useEffect(()=>{
    if(!selectedId && ranked.length) setSelectedId(ranked[0].id)
  },[ranked,selectedId])

  useEffect(()=>{setSelectedProperty(null)},[selectedId,radius])

  const selected=selectedId?records?.[selectedId]:null
  const market=selectedId?marketById[selectedId]:null
  const layerValues=ranked.map(x=>metricValue(x.r,x.m,layer))
  const layerMin=Math.min(...layerValues,0), layerMax=Math.max(...layerValues,100)
  const modeLabel={explorar:'Explorar mercado',propiedades:'Propiedades',prospectos:'Prospectos',reportes:'Reportes'}[mode]||'Explorar mercado'

  const selectZone=id=>{setSelectedId(id);setSelectedProperty(null)}

  return <main className="reo-page">
    <div className="reo-workbar">
      <div><span>GROWA INMOBILIARIO</span><b>/</b><strong>{modeLabel}</strong></div>
      <div className="reo-workbar-actions"><Badge tone="real">MAZATLÁN</Badge><span>Prototipo de producto · interfaz 01</span></div>
    </div>

    <div className="reo-shell">
      <aside className="reo-filter">
        <div className="reo-filter-head"><SlidersHorizontal size={16}/><div><strong>Buscar oportunidades</strong><span>Zonas, activos y señales</span></div></div>

        <div className="reo-search">
          <Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Dirección, colonia, AGEB o activo"/><button>Buscar</button>
        </div>

        <div className="reo-search-scope"><button className="active">Todo</button><button>Zonas</button><button>Propiedades</button></div>

        <FilterSection title="Estrategia" icon={Layers3}>
          <div className="reo-profile-grid">{Object.entries(PROFILES).map(([key,p])=>{
            const Icon=p.icon
            return <button key={key} className={profile===key?'active':''} onClick={()=>setProfile(key)}><Icon size={14}/><span>{p.label}</span></button>
          })}</div>
        </FilterSection>

        <FilterSection title="Radio de mercado" icon={Crosshair}>
          <div className="reo-radius">{Object.keys(radiusFactor).map(r=><button key={r} className={radius===r?'active':''} onClick={()=>setRadius(r)}>{r}</button>)}</div>
        </FilterSection>

        <FilterSection title="Filtros de oportunidad">
          <div className="reo-filter-row"><span>Opportunity Score</span><select value={minScore} onChange={e=>setMinScore(Number(e.target.value))}><option value="0">Todos</option><option value="60">60+</option><option value="70">70+</option><option value="80">80+</option></select></div>
          <div className="reo-filter-row"><span>Crecimiento</span><select value={growthFilter} onChange={e=>setGrowthFilter(e.target.value)}><option value="all">Cualquiera</option><option value="positive">Positivo</option><option value="high">15%+</option></select></div>
          <div className="reo-filter-row"><span>Tipo de activo</span><select><option>Todos</option><option>Terreno</option><option>Comercial</option><option>Uso mixto</option></select></div>
          <div className="reo-filter-row"><span>Precio / m²</span><select><option>Sin límite</option><option>&lt; $10 mil</option><option>$10–20 mil</option><option>$20 mil+</option></select></div>
        </FilterSection>

        <div className="reo-results">
          <div className="reo-results-head"><div><strong>{fmt(ranked.length)}</strong><span>zonas encontradas</span></div><button title="Ordenar"><ListFilter size={14}/></button></div>
          <div className="reo-results-list">
            {ranked.slice(0,14).map((x,i)=><button key={x.id} className={selectedId===x.id?'active':''} onClick={()=>selectZone(x.id)}>
              <span className="reo-rank">{String(i+1).padStart(2,'0')}</span>
              <div><b>AGEB {x.id.slice(-4)}</b><small>{fmt(x.r.pobtot)} hab. · {fmt(x.m.establishments)} establecimientos</small></div>
              <strong>{fmt(x.score)}</strong>
            </button>)}
            {!ranked.length&&<div className="reo-no-results">No hay zonas con estos filtros.</div>}
          </div>
        </div>
      </aside>

      <section className="reo-map-zone">
        <div className="reo-map-toolbar">
          <div className="reo-map-switch">
            <button className={mapMode==='map'?'active':''} onClick={()=>setMapMode('map')}><MapIcon size={13}/> Mapa</button>
            <button className={mapMode==='satellite'?'active':''} onClick={()=>setMapMode('satellite')}><Satellite size={13}/> Satélite</button>
            <i/>
            <button className="active">AGEB</button>
            <button className={showProspects?'active':''} onClick={()=>setShowProspects(v=>!v)}>Predios</button>
          </div>
          <div className="reo-layer-select"><span>Visualizar por</span><select value={layer} onChange={e=>setLayer(e.target.value)}>{Object.entries(LAYERS).map(([k,l])=><option key={k} value={k}>{l.label}</option>)}</select></div>
        </div>
        <MapCanvas geometry={geometry} records={records} marketById={marketById} selectedId={selectedId} onSelect={selectZone} layer={layer} mapMode={mapMode} showProspects={showProspects}/>
        <div className="reo-map-legend"><span>{LAYERS[layer].label}</span><div><i/><i/><i/><i/><i/><i/></div><small><b>{LAYERS[layer].format(layerMin)}</b><b>{LAYERS[layer].format(layerMax)}</b></small><em>{LAYERS[layer].source}</em></div>
        <div className="reo-map-count">{fmt(city.length)} AGEB · {showProspects?'oportunidades visibles':'sin predios'}</div>
      </section>

      <aside className="reo-detail">
        {selectedProperty
          ? <PropertyDetail property={selectedProperty} record={selected} market={market} onBack={()=>setSelectedProperty(null)}/>
          : selected
            ? <ZoneDetail record={selected} market={market} profile={profile} onSelectProperty={setSelectedProperty}/>
            : <div className="reo-detail-empty"><MapPinned size={26}/><span>INTELIGENCIA DE UBICACIÓN</span><h2>Selecciona una zona.</h2><p>El panel combina demografía, actividad económica, turismo y señales inmobiliarias en un solo flujo de trabajo.</p></div>}
      </aside>
    </div>
  </main>
}
