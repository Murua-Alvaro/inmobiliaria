import React,{useEffect,useMemo,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Search,ChevronDown,MapPin,ArrowRight,Users,Home as HomeIcon,Building2,BarChart3,
  Store,School,CloudSun,Target,Layers3,Download,Bookmark,X,Plus,Database,
  BriefcaseBusiness,TrendingUp,ArrowUpRight,LayoutGrid,ListFilter,Ruler,
  Info,Map as MapIcon,Check,PanelTop,MessageSquareText,Sparkles
} from 'lucide-react'
import {
  apiStatus,getRankings,searchLocations,getLocation,compareLocations,
  getMarketPulse,getMarketSummary,getDistricts,getDistrict,getProperties,searchAll,getOverview,getPropertyDetail
} from './apiClient'
import './app.css'
import { Landing, SiteHeader, SiteFooter, DataPlatform } from './Experience'
import './experience.css'
import { TerritoryWorkspace } from './Professional'
import { Portfolio } from './Portfolio'

const fmt=(v,d=0)=>Number.isFinite(Number(v))
  ? Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d})
  :'—'
const pct=(v,d=1)=>Number.isFinite(Number(v))?fmt(v,d)+'%':'—'
const mxn=v=>Number.isFinite(Number(v))
  ?new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v))
  :'—'

const RANK_METRICS=[
  {key:'opportunity',label:'Oportunidad',format:v=>fmt(v),note:'Proxy Growa'},
  {key:'population',label:'Población',format:v=>fmt(v),note:'INEGI 2020'},
  {key:'households',label:'Hogares',format:v=>fmt(v),note:'INEGI 2020'},
  {key:'adults',label:'Adultos',format:v=>pct(v),note:'18 años y más'},
  {key:'mobility',label:'Movilidad',format:v=>pct(v),note:'Residía en otra entidad en 2015'},
]

const PLATFORM_CARDS=[
  ['Demografía','Datos demográficos detallados por ubicación, AGEB y mercado.',Users],
  ['Location Scores','Puntuaciones comparables para evaluar el carácter de cada zona.',BarChart3],
  ['Perfiles','Perfiles territoriales y sociodemográficos para cada área.',Target],
  ['Puntos de interés','Comercio, servicios y amenidades alrededor de una ubicación.',MapPin],
  ['Location Snapshot','Resumen inmediato de contexto territorial y de mercado.',PanelTop],
  ['Market Stats','Señales económicas, vivienda y dinámica territorial.',TrendingUp],
  ['School Data','Oferta educativa y accesibilidad a equipamiento escolar.',School],
  ['Climate Risk','Capas ambientales y exposición territorial.',CloudSun],
]

const USE_CASES=[
  ['Selección de sitios','Compara ubicaciones para inversión, expansión y desarrollo.',Target],
  ['Contexto para listados','Enriquece cada inmueble con señales territoriales.',Layers3],
  ['Reportes de vecindario','Perfiles de zona listos para clientes y desarrolladores.',MapPin],
  ['Búsqueda de estilo de vida','Explora zonas por atributos y contexto.',Search],
  ['Captura de leads','Convierte interés territorial en oportunidades comerciales.',BriefcaseBusiness],
  ['Contenido con datos','Genera descripciones basadas en evidencia territorial.',Sparkles],
]

function routeFromHash(){
  const raw=location.hash.replace(/^#/,'')||'home'
  if(raw.startsWith('location/'))return {page:'location',id:decodeURIComponent(raw.slice(9))}
  if(raw.startsWith('district/'))return {page:'district',id:decodeURIComponent(raw.slice(9))}
  return {page:raw,id:null}
}
function go(page,id){
  location.hash=(page==='location'||page==='district')&&id?page+'/'+encodeURIComponent(id):page
}

function PropertyIntelligenceRedirect(){
  useEffect(()=>{
    window.location.replace('https://growa-territorial.onrender.com/#/inmobiliario')
  },[])
  return <main tabIndex={-1} className="gi-page-loading"><i/> Abriendo inteligencia inmobiliaria…</main>
}

function SearchBox({large=false,onSelect}){
  const [q,setQ]=useState('')
  const [rows,setRows]=useState([])
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    if(!q.trim()){setRows([]);return}
    let active=true
    const t=setTimeout(async()=>{
      setBusy(true)
      try{const r=await searchAll(q,7);if(active)setRows(r.rows||[])}
      catch{if(active)setRows([])}
      finally{if(active)setBusy(false)}
    },180)
    return()=>{active=false;clearTimeout(t)}
  },[q])
  const choose=row=>{
    setQ('')
    setRows([])
    if(onSelect)onSelect(row)
    else if(row.kind==='district')go('district',row.id)
    else go('location',row.id)
  }
  return <div className={'gi-search '+(large?'large':'')}>
    <div className="gi-search-line">
      <MapPin size={large?17:14}/>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar AGEB o distrito"/>
      {busy&&<i className="gi-spinner"/>}
      {q&&<button className="gi-clear" onClick={()=>setQ('')}><X size={13}/></button>}
    </div>
    {large&&<button className="gi-search-cta" onClick={()=>rows[0]&&choose(rows[0])}><Search size={14}/> Obtener insights</button>}
    {!!rows.length&&<div className="gi-suggestions">
      {rows.map(row=><button key={row.id} onClick={()=>choose(row)}>
        <MapPin size={13}/><div><strong>{row.label}</strong><span>{row.subtitle}</span></div><ArrowRight size={13}/>
      </button>)}
    </div>}
  </div>
}

function LocationMapExplorer({mode,rows,metric='opportunity'}){
  const node=useRef(null), mapRef=useRef(null), layerRef=useRef(null)
  const geometryUrl=mode==='district'?'/data/codesin-districts.geojson':'/data/ageb-geometry-2020.geojson'

  useEffect(()=>{
    if(!node.current||mapRef.current)return
    const map=L.map(node.current,{zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,zoomControl:false,attributionControl:true,minZoom:9,maxZoom:17})
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(map)
    L.control.zoom({position:'bottomright'}).addTo(map)
    map.setView([23.245,-106.425],11)
    mapRef.current=map
    return()=>{map.remove();mapRef.current=null}
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!rows?.length)return
    let cancelled=false
    fetch(geometryUrl).then(r=>r.json()).then(geo=>{
      if(cancelled)return
      if(layerRef.current)layerRef.current.remove()
      const byKey=new Map(rows.map(r=>[
        mode==='district'?String(r.name||'').toLowerCase():String(r.id||''),
        r
      ]))
      const metricField={
        opportunity:'opportunity_score',
        population:'population',
        households:'households',
        adults:'adult_share',
        mobility:'recent_mobility_share'
      }[metric]||'opportunity_score'
      const vals=rows.map(r=>Number(r[metricField])).filter(Number.isFinite).sort((a,b)=>a-b)
      const lo=vals[Math.floor(vals.length*.05)]??0, hi=vals[Math.floor(vals.length*.95)]??1
      const palette=['#edf8f7','#d6efed','#afdeda','#7dc7c1','#43a7a3','#16777b']
      const color=v=>{
        if(!Number.isFinite(Number(v)))return '#f1f4f4'
        const t=Math.max(0,Math.min(1,(Number(v)-lo)/(hi-lo||1)))
        return palette[Math.min(palette.length-1,Math.floor(t*palette.length))]
      }
      const featureRows=(geo.features||[]).filter(ft=>{
        const key=mode==='district'
          ?String(ft.properties?.district||'').toLowerCase()
          :String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
        return byKey.has(key)
      })
      const layer=L.geoJSON({type:'FeatureCollection',features:featureRows},{
        style:ft=>{
          const key=mode==='district'
            ?String(ft.properties?.district||'').toLowerCase()
            :String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
          const row=byKey.get(key)
          return {color:'#fff',weight:1,fillColor:color(row?.[metricField]),fillOpacity:.82}
        },
        onEachFeature:(ft,l)=>{
          const key=mode==='district'
            ?String(ft.properties?.district||'').toLowerCase()
            :String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
          const row=byKey.get(key)
          if(!row)return
          const title=mode==='district'?row.name:'AGEB '+row.id.slice(-4)
          const value=row[metricField]
          const label=mode==='district'?'Opportunity Score':(RANK_METRICS.find(m=>m.key===metric)?.label||'Oportunidad')
          l.bindTooltip('<div class="gi-map-tip"><small>'+title+'</small><strong>'+fmt(value,metric==='opportunity'?0:1)+'</strong><span>'+label+'</span></div>',{sticky:true,direction:'top'})
          l.on('click',()=>mode==='district'?go('district',row.slug):go('location',row.id))
        }
      }).addTo(map)
      layerRef.current=layer
      if(layer.getBounds().isValid())map.fitBounds(layer.getBounds(),{padding:[20,20]})
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[geometryUrl,mode,rows,metric])

  return <div className="gi-location-map-wrap">
    <div ref={node} className="gi-location-map"/>
    <div className="gi-location-map-legend"><span>{mode==='district'?'Score distrital':(RANK_METRICS.find(m=>m.key===metric)?.label||'Oportunidad')}</span><div><i/><i/><i/><i/><i/><i/></div><small><b>menor</b><b>mayor</b></small></div>
  </div>
}

function Locations(){
  const [mode,setMode]=useState('ageb')
  const [view,setView]=useState('grid')
  const [rows,setRows]=useState([])
  const [districts,setDistricts]=useState([])
  const [q,setQ]=useState('')
  const [metric,setMetric]=useState('opportunity')
  const [compare,setCompare]=useState([])

  useEffect(()=>{
    let active=true
    const t=setTimeout(()=>{
      if(mode==='ageb'){
        const request=q.trim()?searchLocations(q,60):getRankings(metric,60)
        request.then(r=>active&&setRows(r.rows||[]))
      } else getDistricts(q).then(r=>active&&setDistricts(r.rows||[]))
    },120)
    return()=>{active=false;clearTimeout(t)}
  },[q,mode,metric])

  const toggle=id=>setCompare(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length>=3?prev:[...prev,id])
  const count=mode==='ageb'?rows.length:districts.length

  return <main tabIndex={-1} className="gi-locations">
    <section className="gi-locations-top">
      <div><span>LOCATION INTELLIGENCE</span><h1>Explora ubicaciones.</h1><p>Analiza Mazatlán en dos escalas: AGEB urbana para detalle fino y distritos CODESIN para lectura estratégica.</p></div>
      <div className="gi-search compact"><div className="gi-search-line"><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={mode==='ageb'?'Buscar AGEB':'Buscar distrito'}/></div></div>
    </section>

    <div className="gi-scale-switch">
      <button className={mode==='ageb'?'active':''} onClick={()=>{setMode('ageb');setQ('')}}>AGEB urbana</button>
      <button className={mode==='district'?'active':''} onClick={()=>{setMode('district');setQ('');setCompare([])}}>Distritos CODESIN</button>
    </div>

    {mode==='ageb'?<>
      <div className="gi-location-toolbar">
        <div>{RANK_METRICS.map(m=><button key={m.key} className={metric===m.key?'active':''} onClick={()=>setMetric(m.key)}>{m.label}</button>)}</div>
        <div className="gi-view-switch"><button className={view==='grid'?'active':''} onClick={()=>setView('grid')}><LayoutGrid size={12}/> Lista</button><button className={view==='map'?'active':''} onClick={()=>setView('map')}><MapIcon size={12}/> Mapa</button></div>
        <span>{fmt(count)} ubicaciones</span>
      </div>
      {view==='map'?<LocationMapExplorer mode="ageb" rows={rows} metric={metric}/>:<section className="gi-location-list">
        {rows.map(row=><article key={row.id} className="gi-location-card">
          <div className="gi-location-card-head"><div><span>AGEB URBANA</span><h3>{row.id.slice(-4)}</h3><small>{row.id}</small></div><b>{row.opportunity_score}<em>/100</em></b></div>
          <div className="gi-location-kpis"><div><span>Población</span><strong>{fmt(row.population)}</strong></div><div><span>Hogares</span><strong>{fmt(row.households)}</strong></div><div><span>Movilidad</span><strong>{pct(row.recent_mobility_share)}</strong></div></div>
          <div className="gi-location-actions"><button onClick={()=>toggle(row.id)} className={compare.includes(row.id)?'selected':''}>{compare.includes(row.id)?<Check size={13}/>:<Plus size={13}/>} Comparar</button><button onClick={()=>go('location',row.id)}>Ver perfil <ArrowRight size={12}/></button></div>
        </article>)}
      </section>}
      {!!compare.length&&<CompareTray ids={compare} onRemove={id=>toggle(id)} onClose={()=>setCompare([])}/>}
    </>:<>
      <div className="gi-location-toolbar"><div><button className="active">Contexto distrital</button></div><div className="gi-view-switch"><button className={view==='grid'?'active':''} onClick={()=>setView('grid')}><LayoutGrid size={12}/> Lista</button><button className={view==='map'?'active':''} onClick={()=>setView('map')}><MapIcon size={12}/> Mapa</button></div><span>{fmt(count)} distritos</span></div>
      {view==='map'?<LocationMapExplorer mode="district" rows={districts}/>:<section className="gi-district-grid">
        {districts.map((d,i)=><article key={d.slug} className="gi-district-card">
          <header><span>{String(i+1).padStart(2,'0')}</span><div><strong>{d.name}</strong><small>DISTRITO CODESIN</small></div>{d.opportunity_score!==null&&d.opportunity_score!==undefined?<b>{d.opportunity_score}<em>/100</em></b>:null}</header>
          <div className="gi-district-kpis"><div><span>AGEB</span><strong>{fmt(d.ageb_count)}</strong></div><div><span>Población</span><strong>{d.population?fmt(d.population):'—'}</strong></div><div><span>Hogares</span><strong>{d.households?fmt(d.households):'—'}</strong></div></div>
          <button onClick={()=>go('district',d.slug)}>Abrir distrito <ArrowRight size={12}/></button>
        </article>)}
      </section>}
    </>}
  </main>
}

function CompareTray({ids,onRemove,onClose}){
  const [rows,setRows]=useState([])
  useEffect(()=>{compareLocations(ids).then(r=>setRows(r.rows||[]))},[ids])
  return <aside className="gi-compare-tray">
    <div className="gi-compare-head"><div><span>COMPARADOR</span><strong>{rows.length}/3 ubicaciones</strong></div><button onClick={onClose}><X size={14}/></button></div>
    <div className="gi-compare-grid">
      {rows.map(r=><div key={r.id}><button onClick={()=>onRemove(r.id)}><X size={11}/></button><b>AGEB {r.id.slice(-4)}</b><strong>{r.opportunity_score}/100</strong><span>{fmt(r.population)} hab.</span><span>{pct(r.recent_mobility_share)} movilidad</span></div>)}
    </div>
  </aside>
}

function DistrictProfile({slug}){
  const [data,setData]=useState(null)
  useEffect(()=>{getDistrict(slug).then(setData)},[slug])
  if(!data)return <div className="gi-page-loading"><i/> Cargando distrito…</div>
  const d=data.district||{}
  const locations=data.locations||[]
  return <main tabIndex={-1} className="gi-profile gi-district-profile">
    <div className="gi-profile-crumb"><button onClick={()=>go('locations')}>Ubicaciones</button><span>/</span><b>{d.name}</b></div>
    <section className="gi-profile-hero">
      <div><span>DISTRITO CODESIN · MAZATLÁN</span><h1>{d.name}</h1><p>{fmt(d.ageb_count)} AGEB integradas · lectura territorial agregada</p></div>
      {d.opportunity_score!==null&&d.opportunity_score!==undefined?<div className="gi-profile-score"><strong>{d.opportunity_score}</strong><span>/100</span><small>score medio AGEB</small></div>:null}
    </section>
    <div className="gi-district-summary">
      <div><span>Población agregada</span><strong>{fmt(d.population)}</strong></div>
      <div><span>Hogares</span><strong>{fmt(d.households)}</strong></div>
      <div><span>Viviendas habitadas</span><strong>{fmt(d.occupied_housing)}</strong></div>
      <div><span>Movilidad media</span><strong>{pct(d.mobility_share)}</strong></div>
      <div><span>Adultos</span><strong>{pct(d.adult_share)}</strong></div>
    </div>
    <section className="gi-market-block">
      <header><div><span>01</span><h2>AGEB dentro del distrito</h2></div><small>{locations.length} perfiles disponibles</small></header>
      <div className="gi-district-agebs">
        {locations.sort((a,b)=>(b.opportunity_score||0)-(a.opportunity_score||0)).map((r,i)=><button key={r.id} onClick={()=>go('location',r.id)}>
          <span>{String(i+1).padStart(2,'0')}</span><div><strong>AGEB {r.id.slice(-4)}</strong><small>{fmt(r.population)} hab. · {fmt(r.households)} hogares</small></div><b>{r.opportunity_score}/100</b><ArrowRight size={12}/>
        </button>)}
      </div>
    </section>
    <div className="gi-method"><Info size={13}/><span>La agregación distrital asigna cada AGEB urbana al polígono CODESIN que contiene su centro geométrico. El score distrital es la media de los scores AGEB; es descriptivo y no constituye un avalúo.</span></div>
  </main>
}

function MiniMap({id}){
  const node=useRef(null),mapRef=useRef(null)
  useEffect(()=>{
    let cancelled=false
    fetch('/data/ageb-geometry-2020.geojson').then(r=>r.json()).then(geo=>{
      if(cancelled||!node.current)return
      const feature=(geo.features||[]).find(f=>String(f.properties?.cvegeo_ageb||f.properties?.CVEGEO||'').slice(0,13)===id)
      if(!feature)return
      const map=L.map(node.current,{zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,zoomControl:false,attributionControl:true,scrollWheelZoom:false})
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(map)
      const layer=L.geoJSON(feature,{style:{color:'#0a8588',weight:2,fillColor:'#76c4c0',fillOpacity:.35}}).addTo(map)
      map.fitBounds(layer.getBounds(),{padding:[26,26],maxZoom:14})
      mapRef.current=map
    })
    return()=>{cancelled=true;if(mapRef.current){mapRef.current.remove();mapRef.current=null}}
  },[id])
  return <div ref={node} className="gi-mini-map"/>
}

function ScoreBar({label,value}){
  const v=Math.max(0,Math.min(100,Number(value)||0))
  return <div className="gi-scorebar"><div><span>{label}</span><b>{fmt(v)}</b></div><i><em style={{width:v+'%'}}/></i></div>
}

function LocationProfile({id}){
  const [data,setData]=useState(null)
  const [tab,setTab]=useState('overview')
  const [saved,setSaved]=useState(()=>{try{return JSON.parse(localStorage.getItem('growa_saved_locations')||'[]').includes(id)}catch{return false}})
  const toggleSaved=()=>{
    try{
      const current=JSON.parse(localStorage.getItem('growa_saved_locations')||'[]')
      const next=current.includes(id)?current.filter(x=>x!==id):[...current,id]
      localStorage.setItem('growa_saved_locations',JSON.stringify(next))
      setSaved(next.includes(id))
    }catch{}
  }
  useEffect(()=>{getLocation(id).then(setData)},[id])
  if(!data)return <div className="gi-page-loading"><i/> Cargando perfil territorial…</div>
  const r=data.location
  const c=r.score_components||{}
  return <main tabIndex={-1} className="gi-profile">
    <div className="gi-profile-crumb"><button onClick={()=>go('locations')}>Ubicaciones</button><span>/</span><b>AGEB {r.id.slice(-4)}</b></div>
    <section className="gi-profile-hero">
      <div><span>LOCATION PROFILE · MAZATLÁN</span><h1>AGEB {r.id.slice(-4)}</h1><p>{r.id} · perfil territorial urbano</p></div>
      <div className="gi-profile-score"><strong>{r.opportunity_score}</strong><span>/100</span><small>Opportunity Score</small></div>
    </section>
    <div className="gi-profile-actions"><button className={saved?'saved':''} onClick={toggleSaved}><Bookmark size={13}/>{saved?' Guardada':' Guardar'}</button><button onClick={()=>window.print()}><Download size={13}/> Exportar / PDF</button><button onClick={()=>go('locations')}><Plus size={13}/> Comparar</button></div>
    <div className="gi-profile-tabs">
      {[['overview','Resumen'],['demography','Demografía'],['market','Mercado'],['method','Metodología']].map(([k,l])=><button className={tab===k?'active':''} key={k} onClick={()=>setTab(k)}>{l}</button>)}
    </div>
    <div className="gi-profile-layout">
      <section className="gi-profile-main">
        {tab==='overview'&&<>
          <div className="gi-kpi-grid">
            <div><span>Población</span><strong>{fmt(r.population)}</strong><small>INEGI 2020</small></div>
            <div><span>Hogares</span><strong>{fmt(r.households)}</strong><small>hogares censales</small></div>
            <div><span>Ocupantes / vivienda</span><strong>{fmt(r.household_size,1)}</strong><small>promedio</small></div>
            <div><span>Movilidad reciente</span><strong>{pct(r.recent_mobility_share)}</strong><small>otra entidad en 2015</small></div>
          </div>
          <section className="gi-profile-section"><header><span>SEÑALES DEL SCORE</span><small>proxy demográfico</small></header>
            <ScoreBar label="Escala poblacional" value={(c.population||0)*100}/>
            <ScoreBar label="Profundidad de hogares" value={(c.households||0)*100}/>
            <ScoreBar label="Población adulta" value={(c.adults||0)*100}/>
            <ScoreBar label="Movilidad reciente" value={(c.mobility||0)*100}/>
            <ScoreBar label="Origen externo" value={(c.external_origin||0)*100}/>
          </section>
          <section className="gi-profile-section"><header><span>LECTURA TERRITORIAL</span></header>
            <div className="gi-insights">
              <p><Users size={14}/><span><b>{fmt(r.population)} residentes</b> conforman la base poblacional observada en el Censo 2020.</span></p>
              <p><HomeIcon size={14}/><span><b>{fmt(r.households)} hogares</b> y {fmt(r.household_size,1)} ocupantes por vivienda habitada.</span></p>
              <p><TrendingUp size={14}/><span><b>{pct(r.recent_mobility_share)} de movilidad interestatal reciente</b>, usada como una señal descriptiva de atracción residencial.</span></p>
            </div>
          </section>
        </>}
        {tab==='demography'&&<section className="gi-profile-section gi-demography"><header><span>COMPOSICIÓN DEMOGRÁFICA</span></header>
          <div className="gi-demog-grid"><div><span>18 años y más</span><strong>{pct(r.adult_share)}</strong></div><div><span>Nacidos en otra entidad</span><strong>{pct(r.external_origin_share)}</strong></div><div><span>Mujeres</span><strong>{pct(r.women_share)}</strong></div><div><span>Hombres</span><strong>{pct(r.men_share)}</strong></div><div><span>Viviendas habitadas</span><strong>{fmt(r.occupied_housing)}</strong></div><div><span>Hogares</span><strong>{fmt(r.households)}</strong></div></div>
        </section>}
        {tab==='market'&&<section className="gi-profile-section"><header><span>CONTEXTO DE MERCADO</span></header>
          <div className="gi-market-placeholder"><TrendingUp size={20}/><div><strong>Conexión de mercado activa</strong><p>Esta ubicación puede combinarse con financiamiento, construcción, huella urbana y señales económicas desde el módulo Mercado.</p><button onClick={()=>go('market')}>Abrir Mercado <ArrowRight size={12}/></button></div></div>
        </section>}
        {tab==='method'&&<section className="gi-profile-section"><header><span>METODOLOGÍA</span></header>
          <div className="gi-method-copy"><p>El Opportunity Score actual es un <b>proxy demográfico</b>, no un avalúo, precio estimado ni predicción de ventas. Normaliza indicadores territoriales entre percentiles 10 y 90 y combina población (32%), hogares (26%), población adulta (14%), movilidad reciente (16%) y origen externo (12%).</p><p>El propósito de esta primera versión es ordenar ubicaciones de forma reproducible mientras se integran variables inmobiliarias observadas.</p></div>
        </section>}
      </section>
      <aside className="gi-profile-side">
        <MiniMap id={r.id}/>
        <div className="gi-side-box"><span>FUENTE PRINCIPAL</span><strong>INEGI · Censo 2020</strong><p>La ficha conserva la escala AGEB urbana y separa indicadores observados de scores derivados.</p></div>
      </aside>
    </div>
  </main>
}

function MarketTrend({rows=[]}){
  if(!rows.length)return null
  const vals=rows.map(r=>Number(r.amount_mxn)||0)
  const min=Math.min(...vals),max=Math.max(...vals),range=max-min||1
  const w=880,h=160,p=12
  const pts=rows.map((r,i)=>[
    p+(i/(rows.length-1||1))*(w-p*2),
    p+(1-(Number(r.amount_mxn)-min)/range)*(h-p*2)
  ])
  const d=pts.map((pt,i)=>(i?'L':'M')+pt[0].toFixed(1)+','+pt[1].toFixed(1)).join(' ')
  return <div className="gi-market-trend">
    <svg viewBox={'0 0 '+w+' '+h} preserveAspectRatio="none">
      <line x1={p} y1={h-p} x2={w-p} y2={h-p}/>
      <path d={d}/>
    </svg>
    <div><span>{rows[0]?.period}</span><b>{rows.at(-1)?.period} · {mxn(rows.at(-1)?.amount_mxn)}</b></div>
  </div>
}

function Market(){
  const [data,setData]=useState(null)
  const [tab,setTab]=useState('modalities')
  useEffect(()=>{getMarketSummary().then(setData)},[])
  if(!data)return <div className="gi-page-loading"><i/> Cargando mercado…</div>

  const latest=data.latest_month||{}
  const cmp=data.h1_comparison||{}
  const modalities=data.modalities||[]
  const segments=data.segments||[]
  const demand=data.potential_demand||{}
  const maxModal=Math.max(...modalities.map(x=>Number(x.actions_h1_2026)||0),1)
  const maxSegment=Math.max(...segments.map(x=>Number(x.actions_h1_2026)||0),1)
  const h1=data.h1||{}
  return <main tabIndex={-1} className="gi-market-v2">
    <aside className="gm-side">
      <div><span>MARKET</span><h3>Mazatlán</h3><small>Sinaloa · México</small></div>
      <nav><button onClick={()=>document.querySelector('.gm-head')?.scrollIntoView({behavior:'smooth'})}><BarChart3 size={15}/> Resumen</button><button onClick={()=>document.querySelector('.gm-trend-card')?.scrollIntoView({behavior:'smooth'})}><TrendingUp size={15}/> Financiamiento</button><button onClick={()=>{setTab('segments');document.querySelector('.gm-structure')?.scrollIntoView({behavior:'smooth'})}}><HomeIcon size={15}/> Vivienda</button><button onClick={()=>document.querySelector('.gm-grid.lower')?.scrollIntoView({behavior:'smooth'})}><Users size={15}/> Demanda</button></nav>
      <section><span>COBERTURA</span><strong>{data.observed_through||'Último periodo'}</strong><p>Los indicadores de esta vista son municipales y no se imputan automáticamente a una AGEB.</p></section>
    </aside>

    <section className="gm-main">
      <header className="gm-head">
        <div><span>MARKET INTELLIGENCE</span><h1>Mercado inmobiliario</h1><p>Financiamiento, composición de la demanda y señales de profundidad del mercado residencial de Mazatlán.</p></div>
        <button onClick={()=>window.print()}><Download size={14}/> Exportar reporte</button>
      </header>

      <div className="gm-kpis">
        <article className="hero"><span>MONTO · ÚLTIMO MES</span><strong>{mxn(latest.amount_mxn)}</strong><p>{latest.period||'—'}</p></article>
        <article><span>ACCIONES · ÚLTIMO MES</span><strong>{fmt(latest.actions)}</strong><p>financiamientos</p></article>
        <article><span>H1 2026 · ACCIONES</span><strong className={(Number(cmp.actions_pct)||0)>=0?'up':'down'}>{Number(cmp.actions_pct)>=0?'+':''}{pct(cmp.actions_pct)}</strong><p>vs H1 2025</p></article>
        <article><span>H1 2026 · MONTO</span><strong className={(Number(cmp.amount_pct)||0)>=0?'up':'down'}>{Number(cmp.amount_pct)>=0?'+':''}{pct(cmp.amount_pct)}</strong><p>vs H1 2025</p></article>
      </div>

      <div className="gm-grid">
        <section className="gm-card gm-trend-card">
          <header><div><span>01</span><h2>Flujo mensual de financiamiento</h2></div><small>SNIIV / SEDATU</small></header>
          <MarketTrend rows={data.monthly||[]}/>
        </section>
        <aside className="gm-card gm-readout">
          <header><div><span>02</span><h2>Lectura rápida</h2></div></header>
          <div className="gm-readout-score"><strong>{Number(cmp.actions_pct)>=0?'↑':'↓'} {Math.abs(Number(cmp.actions_pct)||0).toFixed(1)}%</strong><span>acciones H1 a/a</span></div>
          <p>El mercado combina el cambio en número de operaciones con el movimiento del monto financiado y del ticket promedio.</p>
          <div className="gm-readout-row"><span>Monto H1</span><b>{Number(cmp.amount_pct)>=0?'+':''}{pct(cmp.amount_pct)}</b></div>
          <div className="gm-readout-row"><span>Ticket promedio</span><b>{Number(cmp.avg_ticket_pct)>=0?'+':''}{pct(cmp.avg_ticket_pct)}</b></div>
          <div className="gm-readout-row"><span>Vivienda nueva</span><b>{pct(modalities.find(x=>x.label==='Vivienda nueva')?.share_h1_2026_pct)}</b></div>
        </aside>
      </div>

      <section className="gm-card gm-structure">
        <header>
          <div><span>03</span><h2>Estructura de la demanda financiada</h2></div>
          <div className="gm-tabs"><button className={tab==='modalities'?'active':''} onClick={()=>setTab('modalities')}>Modalidad</button><button className={tab==='segments'?'active':''} onClick={()=>setTab('segments')}>Segmento vivienda nueva</button></div>
        </header>
        <div className="gm-bars">
          {(tab==='modalities'?modalities:segments).map(x=>{
            const actions=Number(x.actions_h1_2026)||0
            const share=tab==='modalities'?x.share_h1_2026_pct:x.share_new_h1_2026_pct
            const max=tab==='modalities'?maxModal:maxSegment
            return <div className="gm-bar" key={x.label}>
              <div><strong>{x.label}</strong><span>{fmt(actions)} acciones</span></div>
              <i><em style={{width:(actions/max*100)+'%'}}/></i>
              <b>{pct(share)}</b>
              <small className={(Number(x.actions_yoy_pct)||0)>=0?'positive':'negative'}>{Number(x.actions_yoy_pct)>=0?'+':''}{pct(x.actions_yoy_pct)} a/a</small>
            </div>
          })}
        </div>
      </section>

      <div className="gm-grid lower">
        <section className="gm-card">
          <header><div><span>04</span><h2>Demanda potencial INFONAVIT</h2></div><small>{demand.period}</small></header>
          <div className="gm-demand-total"><span>Total beneficiarios</span><strong>{fmt(demand.total)}</strong></div>
          <div className="gm-demand-bands">{(demand.bands||[]).map(b=><div key={b.label}><span>{b.label}</span><i><em style={{width:(Number(b.beneficiaries)/(Number(demand.total)||1)*100)+'%'}}/></i><b>{fmt(b.beneficiaries)}</b></div>)}</div>
        </section>
        <section className="gm-card gm-method">
          <header><div><span>05</span><h2>Uso analítico</h2></div></header>
          <p>Esta vista funciona como capa municipal de contexto. Para evaluar una ubicación concreta, Growa la combina con variables intraurbanas de AGEB y distrito en los módulos de Propiedades y Ubicaciones.</p>
          <button onClick={()=>go('properties')}>Cruzar con propiedades <ArrowRight size={13}/></button>
          <button className="secondary" onClick={()=>go('locations')}>Cruzar con zonas</button>
        </section>
      </div>
    </section>
  </main>
}

const PROPERTY_GEOCODE_CACHE='growa_property_geocode_v10'
const MAZATLAN_BOUNDS={south:23.10,north:23.36,west:-106.56,east:-106.30}

function cleanGeocodeText(value=''){
  return String(value)
    .replace(/\bNA\b/gi,'')
    .replace(/#S\/N/gi,'')
    .replace(/\s+/g,' ')
    .replace(/^\s*[\/,-]+|[\/,-]+\s*$/g,'')
    .trim()
}
function normalizeToken(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
}
function isInsideMazatlan(lat,lng){
  return Number(lat)>=MAZATLAN_BOUNDS.south&&Number(lat)<=MAZATLAN_BOUNDS.north&&
    Number(lng)>=MAZATLAN_BOUNDS.west&&Number(lng)<=MAZATLAN_BOUNDS.east
}
function readGeocodeCache(){
  try{return JSON.parse(localStorage.getItem(PROPERTY_GEOCODE_CACHE)||'{}')}
  catch{return {}}
}
function writeGeocodeCache(cache){
  try{localStorage.setItem(PROPERTY_GEOCODE_CACHE,JSON.stringify(cache))}catch{}
}
function expectedStreetNumber(property){
  const text=String(property.address||'')
  const hash=text.match(/#\s*(\d{1,6})\b/)
  if(hash)return hash[1]
  const plain=text.match(/\b(\d{3,6})\b/)
  return plain?plain[1]:null
}
function hasSpecificLocation(property){
  const address=cleanGeocodeText(property.address||'')
  if(!address||/^s\/c$/i.test(address))return false
  const generic=[
    'marina mazatlán','mazatlán marina mazatlán','fraccionamiento marina mazatlán',
    'sábalo country','sabalo country','centro','na / marina mazatlán'
  ]
  const folded=normalizeToken(address)
  if(generic.some(x=>folded===normalizeToken(x)))return false
  return address.length>=5
}
function arcgisQueries(property){
  const address=cleanGeocodeText(property.address||'')
  if(!hasSpecificLocation(property))return []
  const zone=cleanGeocodeText(property.zone||'')
  const out=[
    address+', Mazatlán, Sinaloa, México',
    address+(zone?', '+zone:'')+', Mazatlán, Sinaloa, México'
  ]
  if(address.includes('/')){
    for(const part of address.split('/').map(x=>x.trim()).filter(Boolean)){
      out.push(part+', '+zone+', Mazatlán, Sinaloa, México')
    }
  }
  return [...new Set(out)]
}
function candidateNumber(candidate){
  const attrs=candidate?.attributes||{}
  const direct=String(attrs.AddNum||attrs.AddrNum||attrs.HouseNum||'').trim()
  if(direct)return direct
  const match=String(attrs.StAddr||attrs.Match_addr||candidate?.address||'').match(/\b(\d{1,6})\b/)
  return match?match[1]:null
}
function candidateType(candidate){
  return String(candidate?.attributes?.Addr_type||'').trim()
}
function candidateIsPrecise(candidate,property){
  const score=Number(candidate?.score)||0
  const type=candidateType(candidate)
  const allowed=['PointAddress','Subaddress','StreetAddress','POI','Premise']
  if(score<90||!allowed.includes(type))return false

  const lat=Number(candidate?.location?.y),lng=Number(candidate?.location?.x)
  if(!isInsideMazatlan(lat,lng))return false

  const expected=expectedStreetNumber(property)
  if(expected){
    const returned=candidateNumber(candidate)
    if(!returned||returned!==expected)return false
    return ['PointAddress','Subaddress','StreetAddress'].includes(type)
  }

  const wanted=normalizeToken(cleanGeocodeText(property.address||''))
    .split(' ').filter(t=>t.length>=4&&!['calle','avenida','blvd','boulevard','paseo','fraccionamiento','residencial','mazatlan'].includes(t))
  const hay=normalizeToken(candidate?.address||candidate?.attributes?.Match_addr||'')
  const matched=wanted.filter(t=>hay.includes(t)).length
  if(type==='POI'||type==='Premise')return matched>=1
  return type==='PointAddress'&&matched>=1
}
async function arcgisGeocodeQuery(property,query){
  try{
    const params=new URLSearchParams({
      f:'json',
      singleLine:query,
      outFields:'Match_addr,Addr_type,StAddr,AddNum,City,Subregion,Region,Postal,Country',
      maxLocations:'5',
      locationType:'rooftop',
      searchExtent:'-106.56,23.10,-106.30,23.36'
    })
    const url='https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?'+params.toString()
    const response=await fetch(url,{headers:{Accept:'application/json'}})
    if(!response.ok)return null
    const data=await response.json()
    for(const candidate of data?.candidates||[]){
      if(!candidateIsPrecise(candidate,property))continue
      const lat=Number(candidate.location.y),lng=Number(candidate.location.x)
      return {
        lat,lng,
        precision:'arcgis_rooftop',
        score:Number(candidate.score)||0,
        addr_type:candidateType(candidate),
        label:candidate.address||candidate.attributes?.Match_addr||query,
        query,
        house_number:candidateNumber(candidate)
      }
    }
  }catch{}
  return null
}
async function geocodeProperty(property){
  for(const query of arcgisQueries(property)){
    const hit=await arcgisGeocodeQuery(property,query)
    if(hit)return hit
  }
  return null
}

function PropertyMap({rows=[],selected,onSelect}){
  const node=useRef(null),mapRef=useRef(null),layerRef=useRef(null)
  const [geoPoints,setGeoPoints]=useState({})
  const [geocoding,setGeocoding]=useState(false)

  useEffect(()=>{
    if(!node.current||mapRef.current)return
    const map=L.map(node.current,{
      zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,
      zoomControl:false,attributionControl:true,minZoom:10,maxZoom:18
    })
    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {maxZoom:19,subdomains:'abc',attribution:'© OpenStreetMap contributors'}
    ).addTo(map)
    L.control.zoom({position:'bottomright'}).addTo(map)
    map.setView([23.238,-106.438],12)
    mapRef.current=map
    const resize=new ResizeObserver(()=>map.invalidateSize())
    resize.observe(node.current)
    return()=>{resize.disconnect();map.remove();mapRef.current=null}
  },[])

  useEffect(()=>{
    let cancelled=false
    const cache=readGeocodeCache()
    const valid={}
    rows.forEach(p=>{
      const hit=cache[String(p.id)]
      if(hit?.precision==='arcgis_rooftop'&&isInsideMazatlan(hit.lat,hit.lng)){
        valid[String(p.id)]=hit
      }
    })
    setGeoPoints(valid)

    ;(async()=>{
      setGeocoding(true)
      const pending=rows.filter(p=>{
        const hit=cache[String(p.id)]
        return hasSpecificLocation(p)&&!(hit?.precision==='arcgis_rooftop'&&isInsideMazatlan(hit.lat,hit.lng))
      })

      for(let i=0;i<pending.length&&!cancelled;i+=5){
        const batch=pending.slice(i,i+5)
        const resolved=await Promise.all(batch.map(async property=>{
          const result=await geocodeProperty(property)
          return {property,result}
        }))
        if(cancelled)break
        const patch={}
        for(const {property,result} of resolved){
          const key=String(property.id)
          if(result){
            cache[key]=result
            patch[key]=result
          }else{
            cache[key]={precision:'no_geocodificado'}
          }
        }
        writeGeocodeCache(cache)
        if(Object.keys(patch).length)setGeoPoints(prev=>({...prev,...patch}))
        await new Promise(r=>setTimeout(r,180))
      }
      if(!cancelled)setGeocoding(false)
    })()

    return()=>{cancelled=true}
  },[rows])

  useEffect(()=>{
    const map=mapRef.current
    if(!map)return
    if(layerRef.current)layerRef.current.remove()

    const layer=L.layerGroup().addTo(map)
    const points=[]

    rows.forEach(p=>{
      const resolved=geoPoints[String(p.id)]
      if(!resolved||resolved.precision!=='arcgis_rooftop')return
      const lat=Number(resolved.lat),lng=Number(resolved.lng)
      if(!isInsideMazatlan(lat,lng))return

      points.push([lat,lng])
      const active=selected&&String(selected.id)===String(p.id)
      const marker=L.circleMarker([lat,lng],{
        radius:active?8:6,
        color:active?'#073f46':'#ffffff',
        weight:active?3:2,
        fillColor:p.operation==='Renta'?'#b98235':'#0b8588',
        fillOpacity:.96
      }).addTo(layer)

      const price=p.currency==='USD'?'$'+fmt(p.price)+' USD':mxn(p.price)
      marker.bindTooltip(
        '<div class="gi-map-tip"><small>'+String(p.operation||'Oferta')+' · '+String(p.zone||'Mazatlán')+
        '</small><strong>'+price+'</strong><span>'+String(p.address||p.type||'Propiedad')+
        '</span><em>'+String(resolved.addr_type||'dirección')+' · '+Math.round(resolved.score||0)+'%</em></div>',
        {direction:'top',offset:[0,-5]}
      )
      marker.on('click',()=>onSelect?.({...p,map_location:resolved}))
    })

    layerRef.current=layer

    if(points.length&&!selected){
      const bounds=L.latLngBounds(points)
      if(bounds.isValid())map.fitBounds(bounds.pad(.15),{maxZoom:14,padding:[34,34]})
    }else if(!points.length){
      map.setView([23.238,-106.438],12)
    }

    if(selected){
      const resolved=geoPoints[String(selected.id)]||selected.map_location
      if(resolved?.precision==='arcgis_rooftop'&&isInsideMazatlan(resolved.lat,resolved.lng)){
        map.panTo([Number(resolved.lat),Number(resolved.lng)],{animate:false})
      }
    }

    return()=>{
      if(layerRef.current===layer){
        layer.remove()
        layerRef.current=null
      }
    }
  },[rows,selected,onSelect,geoPoints])

  const mapped=rows.filter(p=>geoPoints[String(p.id)]?.precision==='arcgis_rooftop').length
  return <div className="gi-property-map-wrap">
    <div className="gi-property-map" ref={node}/>
    <div className="gr-map-geocode-status">
      <strong>{mapped}</strong><span> de {rows.length} ofertas con domicilio geocodificado</span>
      {geocoding&&<em> · verificando domicilios…</em>}
    </div>
  </div>
}

function formatObservedDate(value){
  if(!value)return null
  try{return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'))}
  catch{return value}
}
function propertyMoney(property,value){
  if(value===null||value===undefined||value==='')return null
  return property.currency==='USD'?'$'+fmt(value)+' USD':mxn(value)
}
function PropertyDrawer({property,onClose}){
  const [saved,setSaved]=useState(()=>{try{return JSON.parse(localStorage.getItem('growa_saved_properties')||'[]').includes(property.id)}catch{return false}})
  const toggle=()=>{
    try{
      const current=JSON.parse(localStorage.getItem('growa_saved_properties')||'[]')
      const next=current.includes(property.id)?current.filter(x=>x!==property.id):[...current,property.id]
      localStorage.setItem('growa_saved_properties',JSON.stringify(next))
      setSaved(next.includes(property.id))
    }catch{}
  }
  const price=propertyMoney(property,property.price)
  const observed=formatObservedDate(property.observed_at)
  const amenities=String(property.features||'').split(';').map(x=>x.trim()).filter(Boolean)
  const specs=[
    property.area_m2!=null&&['Superficie',fmt(property.area_m2,1)+' m²'],
    property.land_m2!=null&&Number(property.land_m2)!==Number(property.area_m2)&&['Terreno',fmt(property.land_m2,1)+' m²'],
    property.price_m2!=null&&[property.operation==='Renta'?'Renta / m² / mes':'Precio / m²',propertyMoney(property,property.price_m2)],
    property.bedrooms!=null&&['Recámaras',property.bedrooms],
    property.bathrooms!=null&&['Baños',property.bathrooms],
    property.parking!=null&&['Estacionamientos',property.parking],
    property.maintenance_mxn!=null&&['Mantenimiento',mxn(property.maintenance_mxn)+' / mes'],
    property.condition&&['Condición',property.condition],
  ].filter(Boolean)
  const publication=[
    property.source&&['Fuente',property.source],
    property.franchise&&property.franchise!==property.source&&['Inmobiliaria',property.franchise],
    property.office_agent&&['Oficina / agente',property.office_agent],
    property.external_key&&['Clave externa',property.external_key],
    property.listing_id&&['ID anuncio',property.listing_id],
    observed&&['Fecha de consulta',observed],
    property.zone&&['Zona publicada',property.zone],
  ].filter(Boolean)
  const precision=property.map_location?.precision
  const locationText=
    precision==='arcgis_rooftop'
      ?'Ubicación obtenida con geocodificación de alta confianza y preferencia de localización tipo rooftop.'
      :'La fuente no publica un domicilio que pueda resolverse con suficiente precisión; esta oferta no debe interpretarse como un punto exacto.'

  return <aside className="gi-reonomy-drawer gi-property-detail-v2">
    <div className="gi-reonomy-drawer-top">
      <button onClick={onClose} aria-label="Cerrar ficha"><X size={17}/></button>
      <div><span>{property.operation} · {property.type}</span><small>{property.source}{property.listing_id?' · '+property.listing_id:''}</small></div>
      <button className={saved?'saved':''} onClick={toggle} aria-label={saved?'Quitar de guardados':'Guardar propiedad'} aria-pressed={saved}><Bookmark size={16}/></button>
    </div>

    <div className="gi-reonomy-photo real-listing"><Building2 size={34}/><span>OFERTA PUBLICADA</span><b>{property.operation}</b></div>

    <div className="gi-reonomy-title">
      <span>{property.zone} · Mazatlán</span>
      <h2>{property.address||property.title}</h2>
      <strong>{price}{property.operation==='Renta'?<small> / mes</small>:null}</strong>
      {observed&&<small>Consultado {observed}</small>}
    </div>

    {specs.length>0&&<section className="gi-reonomy-section">
      <header><span>CARACTERÍSTICAS</span></header>
      <div className="gi-reonomy-specs">
        {specs.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>}

    {amenities.length>0&&<section className="gi-reonomy-section">
      <header><span>AMENIDADES / EQUIPAMIENTO</span></header>
      <div className="gr-amenity-chips">{amenities.map(item=><span key={item}>{item}</span>)}</div>
    </section>}

    <section className="gi-reonomy-section">
      <header><span>PUBLICACIÓN</span><small>{property.source}</small></header>
      <div className="gr-publication-list">
        {publication.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      {property.address_note&&<p className="gr-address-note"><Info size={13}/><span>{property.address_note}</span></p>}
      <p className="gi-reonomy-copy">{locationText}</p>
      {property.listing_url&&<a className="gi-reonomy-primary gr-external-link" href={property.listing_url} target="_blank" rel="noreferrer">Abrir anuncio original <ArrowUpRight size={13}/></a>}
    </section>
  </aside>
}

function readStored(key,fallback){try{const data=JSON.parse(localStorage.getItem(key));return data??fallback}catch{return fallback}}
function medianNumber(values=[]){
  const clean=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b)
  if(!clean.length)return null
  const mid=Math.floor(clean.length/2)
  return clean.length%2?clean[mid]:(clean[mid-1]+clean[mid])/2
}
function exportProperties(rows){
  const keys=['id','zone','operation','type','address','price','currency','area_m2','price_m2','bedrooms','bathrooms','parking','source','franchise','observed_at','listing_url']
  const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"'
  const csv='\ufeff'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n')
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}))
  const a=document.createElement('a');a.href=url;a.download='Growa_oferta_inmobiliaria.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function Properties(){
  const [allRows,setRows]=useState([])
  const [savedOnly,setSavedOnly]=useState(false)
  const [savedIds,setSavedIds]=useState(()=>readStored('growa_saved_properties',[]))
  const [toast,setToast]=useState('')
  const [error,setError]=useState('')
  const [operation,setOperation]=useState('Todos')
  const [zone,setZone]=useState('Todas')
  const [type,setType]=useState('Todos')
  const [query,setQuery]=useState('')
  const [sort,setSort]=useState('date_desc')
  const [view,setView]=useState('map')
  const [selected,setSelected]=useState(null)
  const [loading,setLoading]=useState(true)
  const [filtersOpen,setFiltersOpen]=useState(()=>window.innerWidth>1480)
  const rows=savedOnly?allRows.filter(p=>savedIds.includes(p.id)):allRows

  useEffect(()=>{
    let active=true
    const t=setTimeout(()=>{
      setLoading(true);setError('')
      getProperties(200,{type,operation,zone,q:query,sort}).then(r=>{
        if(!active)return
        setRows(r.rows||[])
        if(selected&&!((r.rows||[]).some(x=>String(x.id)===String(selected.id))))setSelected(null)
      }).catch(()=>{if(active){setError('No se pudo cargar la oferta inmobiliaria.');setRows([])}}).finally(()=>active&&setLoading(false))
    },120)
    return()=>{active=false;clearTimeout(t)}
  },[type,operation,zone,query,sort])

  const sale=rows.filter(p=>p.operation==='Venta')
  const rent=rows.filter(p=>p.operation==='Renta')
  const medianSaleM2=medianNumber(sale.map(p=>p.price_m2))
  const medianRent=medianNumber(rent.map(p=>p.price))
  const latestObserved=[...rows].map(p=>p.observed_at).filter(Boolean).sort().at(-1)||null
  const sourceCount=new Set(rows.map(p=>p.source).filter(Boolean)).size
  const typeOptions=[...new Set(allRows.map(p=>p.type).filter(Boolean))].sort()
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),3000);return()=>clearTimeout(timer)},[toast])
  const clear=()=>{setOperation('Todos');setZone('Todas');setType('Todos');setQuery('')}
  return <main tabIndex={-1} className="gi-reonomy gi-reonomy-v2">
    <section className="gr-offer-head gr-offer-head-v3">
      <div className="gr-offer-head-copy">
        <span className="gr-eyebrow">OFERTA INMOBILIARIA · MAZATLÁN</span>
        <h1>Oferta inmobiliaria</h1>
        <p>Inventario de anuncios publicados de venta y renta. Cada registro conserva su fuente, fecha de consulta y enlace individual.</p>
      </div>
      <div className="gr-offer-head-status">
        <div><span>INVENTARIO</span><strong>{rows.length}</strong><small>ofertas visibles</small></div>
        <div><span>FUENTES</span><strong>{sourceCount}</strong><small>plataformas</small></div>
        {latestObserved&&<div><span>ÚLTIMA CONSULTA</span><strong>{formatObservedDate(latestObserved)}</strong><small>fecha de captura</small></div>}
      </div>
    </section>

    <div className="gr-searchbar gr-searchbar-v3">
      <div className="gr-search">
        <Search size={17}/>
        <input aria-label="Buscar propiedades" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Dirección, desarrollo, zona, inmobiliaria o ID"/>
        {query&&<button onClick={()=>setQuery('')} aria-label="Limpiar búsqueda"><X size={14}/></button>}
      </div>
      <div className="gr-searchbar-actions">
        <span className="gr-location"><MapPin size={15}/> Mazatlán, Sinaloa</span>
        <button className="gr-save" onClick={()=>{exportProperties(rows);setToast('CSV exportado con la oferta visible.')}}><Download size={14}/> Exportar</button>
      </div>
    </div>

    <div className="gr-toolbar gr-toolbar-v3">
      <div className="gr-toolbar-main">
        <button className={filtersOpen?'active':''} onClick={()=>setFiltersOpen(v=>!v)}><ListFilter size={15}/> Filtros</button>
        <button className={savedOnly?'active':''} onClick={()=>{setSavedIds(readStored('growa_saved_properties',[]));setSavedOnly(v=>!v)}}><Bookmark size={15}/> Guardados</button>
        <span className="gr-visible-count"><b>{rows.length}</b> resultados</span>
      </div>
      <div className="gr-toolbar-side">
        <div className="gr-view">
          <button className={view==='map'?'active':''} onClick={()=>setView('map')}><MapIcon size={14}/> Mapa</button>
          <button className={'gr-mobile-only '+(view==='list'?'active':'')} onClick={()=>setView('list')}><LayoutGrid size={14}/> Lista</button>
          <button className={view==='table'?'active':''} onClick={()=>setView('table')}><ListFilter size={14}/> Tabla</button>
        </div>
        <label className="gr-sort">Ordenar<select value={sort} onChange={e=>setSort(e.target.value)}><option value="date_desc">Más reciente</option><option value="price_asc">Menor precio</option><option value="price_desc">Mayor precio</option><option value="price_m2_asc">Menor $/m²</option><option value="area_desc">Mayor superficie</option></select></label>
      </div>
    </div>

    <div className={'gr-shell '+(view==='table'?'table-mode ':view==='list'?'list-mode ':'')+(!filtersOpen?'filters-collapsed ':'')+(selected?'has-drawer':'')}>
      {filtersOpen&&<aside className="gr-filters gr-filters-v3">
        <div className="gr-filter-head">
          <div><strong>Filtros</strong><span>Ajusta el inventario visible</span></div>
          <button onClick={clear}>Restablecer</button>
        </div>
        <section><span>OPERACIÓN</span><div className="gr-filter-pills">{['Todos','Venta','Renta'].map(v=><button key={v} className={operation===v?'active':''} onClick={()=>setOperation(v)}>{v}</button>)}</div></section>
        <section><span>ZONA</span><div className="gr-filter-pills gr-filter-pills-stack">{['Todas','Centro','Marina Mazatlán','Sábalo Country'].map(v=><button key={v} className={zone===v?'active':''} onClick={()=>setZone(v)}>{v}</button>)}</div></section>
        {typeOptions.length>1&&<section><span>TIPO DE INMUEBLE</span><div className="gr-filter-pills">{['Todos',...typeOptions].map(v=><button key={v} className={type===v?'active':''} onClick={()=>setType(v)}>{v}</button>)}</div></section>}
        <div className="gr-data-note"><Database size={15}/><div><strong>Acerca de los datos</strong><p>Son precios publicados de oferta. La ficha individual conserva la fuente y la fecha de consulta.</p></div></div>
      </aside>}

      <section className="gr-results">
        <div className="gr-summary gr-summary-v3">
          <div><span>TOTAL</span><strong>{rows.length}</strong><small>ofertas visibles</small></div>
          <div><span>VENTA</span><strong>{sale.length}</strong><small>publicadas</small></div>
          <div><span>RENTA</span><strong>{rent.length}</strong><small>publicadas</small></div>
          <div><span>VENTA · MEDIANA $/m²</span><strong>{medianSaleM2?mxn(Math.round(medianSaleM2)):'—'}</strong><small>{medianRent?'Renta mediana '+mxn(Math.round(medianRent))+' / mes':'mercado observado'}</small></div>
        </div>
        <div className="gr-result-head gr-result-head-v3"><div><strong>Inventario</strong><span>Selecciona una propiedad para ver su ficha</span></div><button onClick={()=>exportProperties(rows)} disabled={!rows.length}><Download size={13}/> CSV</button></div>
        {loading?<div className="gr-loading">{Array.from({length:6},(_,i)=><i key={i}/>)}</div>:
        <div className="gr-result-list">
          {rows.map(p=><button key={p.id} className={'gr-result gr-result-v3 '+(selected?.id===p.id?'active':'')} onClick={()=>setSelected(p)}>
            <div className="gr-thumb gr-thumb-v3"><Building2 size={19}/><span>{p.operation}</span></div>
            <div className="gr-result-copy">
              <div className="gr-result-kicker"><span className={'gr-op-badge '+(p.operation==='Renta'?'rent':'sale')}>{p.operation}</span><small>{p.source}{p.listing_id?' · '+p.listing_id:' · '+p.id}</small></div>
              <strong>{p.address||p.title}</strong>
              <span>{p.zone} · {p.type}</span>
              <div className="gr-result-facts">
                {p.area_m2!=null&&<em>{fmt(p.area_m2,1)} m²</em>}
                {p.bedrooms!=null&&<em>{p.bedrooms} rec.</em>}
                {p.bathrooms!=null&&<em>{p.bathrooms} baños</em>}
                {p.parking!=null&&<em>{p.parking} estac.</em>}
              </div>
              {p.observed_at&&<small className="gr-result-date">Consultado {formatObservedDate(p.observed_at)}</small>}
            </div>
            <div className="gr-result-metric"><strong>{p.currency==='USD'?'
          {!rows.length&&<div className="gr-empty"><Search size={24}/><strong>{error||'No hay ofertas con estos filtros'}</strong><span>Prueba otra zona u operación.</span></div>}
        </div>}
      </section>

      <section className="gr-mapstage">
        {view!=='table'?<>
          <PropertyMap rows={rows} selected={selected} onSelect={setSelected}/>
          <div className="gr-map-legend real-offer"><strong>Oferta publicada</strong><span><i className="sale"/> Venta</span><span><i className="rent"/> Renta</span></div>
          <div className="gr-map-count"><MapPin size={13}/>{rows.length} ofertas en inventario</div>
          <div className="gr-map-precision-note">Ubicación por prioridad: dirección o desarrollo publicado → colonia/zona → referencia aproximada. El mapa indica el nivel de precisión de cada punto.</div>
        </>:<div className="gr-table">
          <div className="gr-table-head"><span>Propiedad</span><span>Operación</span><span>Zona</span><span>Área</span><span>Precio</span><span>Fecha</span></div>
          {rows.map(p=><button key={p.id} onClick={()=>setSelected(p)}><span><b>{p.address||p.title}</b><small>{p.source} · {p.id}</small></span><span>{p.operation}</span><span>{p.zone}</span><span>{p.area_m2?fmt(p.area_m2,1)+' m²':'—'}</span><span>{p.currency==='USD'?'$'+fmt(p.price)+' USD':mxn(p.price)}</span><strong>{p.observed_at||'—'}</strong></button>)}
        </div>}
      </section>
      {selected&&<PropertyDrawer key={selected.id} property={selected} onClose={()=>setSelected(null)}/>}
    </div>
    {toast&&<div className="gr-toast" role="status">{toast}</div>}
  </main>
}

function App(){
  const [route,setRoute]=useState(routeFromHash)
  useEffect(()=>{
    const handler=()=>{setRoute(routeFromHash());window.scrollTo(0,0)}
    addEventListener('hashchange',handler)
    if(!location.hash)location.hash='home'
    return()=>removeEventListener('hashchange',handler)
  },[])
  const status=apiStatus()
  const page=route.page
  let content=<Landing/>
  if(page==='platform')content=<DataPlatform/>
  else if(page==='property-intelligence')content=<PropertyIntelligenceRedirect/>
  else if(page==='locations')content=<Locations/>
  else if(page==='location'&&route.id)content=<LocationProfile key={route.id} id={route.id}/>
  else if(page==='district'&&route.id)content=<DistrictProfile key={route.id} slug={route.id}/>
  else if(page==='market')content=<Market/>
  else if(page==='offers'||page==='properties')content=<Properties/>
  else if(page==='territory')content=<TerritoryWorkspace/>
  else if(page.split('?')[0]==='portfolio')content=<Portfolio/>
  return <div className="gi-app">
    <a className="gl-skip" href="#main-content" onClick={e=>{e.preventDefault();document.querySelector('main')?.focus()}}>Ir al contenido</a>
    <SiteHeader page={page}/>
    {content}
    <SiteFooter/>
  </div>
}

export default App
+fmt(p.price)+' USD':mxn(p.price)}</strong><span>{p.operation==='Renta'?'al mes':(p.price_m2?mxn(p.price_m2)+'/m²':'precio publicado')}</span></div>
          </button>)}
          {!rows.length&&<div className="gr-empty"><Search size={24}/><strong>{error||'No hay ofertas con estos filtros'}</strong><span>Prueba otra zona u operación.</span></div>}
        </div>}
      </section>

      <section className="gr-mapstage">
        {view!=='table'?<>
          <PropertyMap rows={rows} selected={selected} onSelect={setSelected}/>
          <div className="gr-map-legend real-offer"><strong>Oferta publicada</strong><span><i className="sale"/> Venta</span><span><i className="rent"/> Renta</span></div>
          <div className="gr-map-count"><MapPin size={13}/>{rows.length} ofertas en inventario</div>
          <div className="gr-map-precision-note">Ubicación por prioridad: dirección o desarrollo publicado → colonia/zona → referencia aproximada. El mapa indica el nivel de precisión de cada punto.</div>
        </>:<div className="gr-table">
          <div className="gr-table-head"><span>Propiedad</span><span>Operación</span><span>Zona</span><span>Área</span><span>Precio</span><span>Fecha</span></div>
          {rows.map(p=><button key={p.id} onClick={()=>setSelected(p)}><span><b>{p.address||p.title}</b><small>{p.source} · {p.id}</small></span><span>{p.operation}</span><span>{p.zone}</span><span>{p.area_m2?fmt(p.area_m2,1)+' m²':'—'}</span><span>{p.currency==='USD'?'$'+fmt(p.price)+' USD':mxn(p.price)}</span><strong>{p.observed_at||'—'}</strong></button>)}
        </div>}
      </section>
      {selected&&<PropertyDrawer key={selected.id} property={selected} onClose={()=>setSelected(null)}/>}
    </div>
    {toast&&<div className="gr-toast" role="status">{toast}</div>}
  </main>
}

function App(){
  const [route,setRoute]=useState(routeFromHash)
  useEffect(()=>{
    const handler=()=>{setRoute(routeFromHash());window.scrollTo(0,0)}
    addEventListener('hashchange',handler)
    if(!location.hash)location.hash='home'
    return()=>removeEventListener('hashchange',handler)
  },[])
  const status=apiStatus()
  const page=route.page
  let content=<Landing/>
  if(page==='platform')content=<DataPlatform/>
  else if(page==='property-intelligence')content=<PropertyIntelligenceRedirect/>
  else if(page==='locations')content=<Locations/>
  else if(page==='location'&&route.id)content=<LocationProfile key={route.id} id={route.id}/>
  else if(page==='district'&&route.id)content=<DistrictProfile key={route.id} slug={route.id}/>
  else if(page==='market')content=<Market/>
  else if(page==='offers'||page==='properties')content=<Properties/>
  else if(page==='territory')content=<TerritoryWorkspace/>
  else if(page.split('?')[0]==='portfolio')content=<Portfolio/>
  return <div className="gi-app">
    <a className="gl-skip" href="#main-content" onClick={e=>{e.preventDefault();document.querySelector('main')?.focus()}}>Ir al contenido</a>
    <SiteHeader page={page}/>
    {content}
    <SiteFooter/>
  </div>
}

export default App
