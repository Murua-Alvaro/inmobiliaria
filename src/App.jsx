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
  getMarketPulse,getMarketSummary,getDistricts,getDistrict,getProperties,searchAll
} from './apiClient'
import './app.css'

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

function Header({page}){
  const [open,setOpen]=useState(false)
  return <header className="gi-header">
    <button className="gi-brand" onClick={()=>go('home')}>
      <span>G</span><div><strong>GROWA</strong><small>INMOBILIARIO</small></div><em>Insights</em>
    </button>
    <nav className="gi-nav">
      <div className="gi-nav-dd">
        <button className={page==='platform'?'active':''} onClick={()=>setOpen(v=>!v)}>Plataforma <ChevronDown size={12}/></button>
        {open&&<div className="gi-mega-mini" onMouseLeave={()=>setOpen(false)}>
          <button onClick={()=>{go('platform');setOpen(false)}}><Database size={15}/><div><strong>Explora la plataforma</strong><span>Datos, scores y casos de uso</span></div></button>
          <button onClick={()=>{go('locations');setOpen(false)}}><MapPin size={15}/><div><strong>Ubicaciones</strong><span>Perfiles territoriales</span></div></button>
          <button onClick={()=>{go('market');setOpen(false)}}><TrendingUp size={15}/><div><strong>Mercado</strong><span>Indicadores inmobiliarios</span></div></button>
        </div>}
      </div>
      <button className={page==='locations'||page==='district'?'active':''} onClick={()=>go('locations')}>Ubicaciones</button>
      <button className={page==='market'?'active':''} onClick={()=>go('market')}>Mercado</button>
      <button className={page==='properties'?'active':''} onClick={()=>go('properties')}>Propiedades</button>
    </nav>
    <div className="gi-header-actions">
      <button className="gi-link">Ingresar</button>
      <button className="gi-demo" onClick={()=>go('platform')}>Solicitar demo</button>
    </div>
  </header>
}

function SearchBox({large=false,onSelect}){
  const [q,setQ]=useState('')
  const [rows,setRows]=useState([])
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    if(!q.trim()){setRows([]);return}
    const t=setTimeout(async()=>{
      setBusy(true)
      try{const r=await searchAll(q,7);setRows(r.rows||[])}
      finally{setBusy(false)}
    },180)
    return()=>clearTimeout(t)
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

function Home(){
  const [metric,setMetric]=useState('opportunity')
  const [ranking,setRanking]=useState({rows:[],methodology:''})
  const [districts,setDistricts]=useState([])
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    let active=true
    setLoading(true)
    getRankings(metric,10).then(r=>active&&setRanking(r)).finally(()=>active&&setLoading(false))
    return()=>{active=false}
  },[metric])
  useEffect(()=>{
    let active=true
    getDistricts().then(r=>active&&setDistricts((r.rows||[]).slice(0,6))).catch(()=>{})
    return()=>{active=false}
  },[])
  const def=RANK_METRICS.find(x=>x.key===metric)||RANK_METRICS[0]
  const valueOf=row=>({
    opportunity:row.opportunity_score,
    population:row.population,
    households:row.households,
    adults:row.adult_share,
    mobility:row.recent_mobility_share,
  }[metric])
  return <main className="gi-home">
    <section className="gi-hero">
      <div className="gi-map-pattern">{Array.from({length:12},(_,i)=><i key={i} className={'r'+(i+1)}/>)}</div>
      <div className="gi-hero-inner">
        <span className="gi-kicker">GROWA · LOCATION INTELLIGENCE</span>
        <h1>Insights Atlas</h1>
        <p>Inteligencia de ubicación para evaluar AGEB, distritos, mercados y oportunidades inmobiliarias en Mazatlán.</p>
        <SearchBox large/>
      </div>
    </section>

    <section className="gi-ranking">
      <div className="gi-ranking-head">
        <div><h2>Top 10 zonas</h2><p>Explora y compara AGEB urbanas con indicadores territoriales.</p></div>
        <div className="gi-market-pills"><button className="active">Mazatlán</button><button>Mercado urbano</button></div>
        <button className="gi-add" onClick={()=>go('locations')}>+ Añadir una zona</button>
      </div>
      <div className="gi-metric-tabs">
        {RANK_METRICS.map(m=><button key={m.key} className={metric===m.key?'active':''} onClick={()=>setMetric(m.key)}>{m.label}</button>)}
      </div>
      {loading?<div className="gi-loading-grid">{Array.from({length:10},(_,i)=><i key={i}/>)}</div>:
      <div className="gi-ranking-grid">
        {(ranking.rows||[]).map((row,i)=><button key={row.id} className="gi-rank-row" onClick={()=>go('location',row.id)}>
          <span>{String(i+1).padStart(2,'0')}</span>
          <div><strong>{row.label||('AGEB '+row.id.slice(-4))}</strong><small>Mazatlán, Sinaloa</small></div>
          <em>{def.note}</em>
          <b>{def.format(valueOf(row))}</b>
        </button>)}
      </div>}
      <div className="gi-method"><Info size={13}/><span>{ranking.methodology||'Indicadores territoriales descriptivos.'}</span></div>
    </section>

    {!!districts.length&&<section className="gi-home-districts">
      <div className="gi-section-head"><div><span>TERRITORIOS</span><h2>Distritos de Mazatlán</h2></div><button onClick={()=>go('locations')}>Ver todos <ArrowRight size={12}/></button></div>
      <div className="gi-district-strip">
        {districts.map(d=><button key={d.slug} onClick={()=>go('district',d.slug)}>
          <span>{d.ageb_count||'—'} AGEB</span><strong>{d.name}</strong>
          <div><em>{d.population?fmt(d.population)+' hab.':'CODESIN'}</em>{d.opportunity_score!==null&&d.opportunity_score!==undefined?<b>{d.opportunity_score}/100</b>:null}</div>
        </button>)}
      </div>
    </section>}

    <section className="gi-intel-strip">
      <div><span>01</span><strong>Compara ubicaciones</strong><p>Contrasta población, hogares, movilidad y señales de mercado.</p></div>
      <div><span>02</span><strong>Evalúa contexto</strong><p>Integra demografía, vivienda, actividad y financiamiento.</p></div>
      <div><span>03</span><strong>Detecta oportunidades</strong><p>Convierte datos territoriales en un flujo de prospección.</p></div>
    </section>
  </main>
}

function Platform(){
  const [section,setSection]=useState('data')
  const cards=section==='data'?PLATFORM_CARDS:USE_CASES
  return <main className="gi-platform">
    <aside className="gi-filters">
      <h3>Filtros</h3>
      <label><Search size={13}/><input placeholder="Buscar..."/></label>
      <section><span>Industria</span><button className="active">Comercial</button><button>Residencial</button><button>Desarrollo</button></section>
      <section><span>Mercado</span><button>Mazatlán</button><button>Sinaloa</button></section>
    </aside>
    <aside className="gi-platform-nav">
      <span>EXPLORA PLATAFORMA</span>
      <button className={section==='data'?'active':''} onClick={()=>setSection('data')}>Datos</button>
      <button className={section==='use'?'active':''} onClick={()=>setSection('use')}>Casos de uso</button>
      <button>Soluciones</button>
      <button>Industrias</button>
    </aside>
    <section className="gi-card-stage">
      <header><span>{section==='data'?'DATOS':'CASOS DE USO'}</span><button>Ver todo <ArrowRight size={12}/></button></header>
      <div className="gi-platform-grid">
        {cards.map(([title,text,Icon])=><button key={title} className="gi-platform-card">
          <span><Icon size={18}/></span><div><strong>{title}</strong><p>{text}</p></div>
        </button>)}
      </div>
    </section>
    <aside className="gi-platform-promo">
      <div><small>GROWA</small><strong>Location Intelligence</strong><p>Convierte datos territoriales en decisiones de desarrollo.</p><button onClick={()=>go('locations')}>Explorar</button></div>
    </aside>
  </main>
}


function LocationMapExplorer({mode,rows,metric='opportunity'}){
  const node=useRef(null), mapRef=useRef(null), layerRef=useRef(null)
  const geometryUrl=mode==='district'?'/data/codesin-districts.geojson':'/data/ageb-geometry-2020.geojson'

  useEffect(()=>{
    if(!node.current||mapRef.current)return
    const map=L.map(node.current,{zoomControl:false,attributionControl:false,minZoom:9,maxZoom:17})
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20}).addTo(map)
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

  return <main className="gi-locations">
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
  return <main className="gi-profile gi-district-profile">
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
      const map=L.map(node.current,{zoomControl:false,attributionControl:false,scrollWheelZoom:false})
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20}).addTo(map)
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
  return <main className="gi-profile">
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

  return <main className="gi-market">
    <section className="gi-market-hero">
      <div><span>MARKET INTELLIGENCE</span><h1>Mercado inmobiliario.</h1><p>Financiamiento de vivienda y profundidad de demanda para Mazatlán, con la escala municipal claramente separada del análisis AGEB.</p></div>
      <div className="gi-market-meta"><div className="gi-live-chip"><i/> {data.observed_through||'última observación'}</div><small>{data.source}</small></div>
    </section>

    <div className="gi-market-grid">
      <article className="gi-market-card featured"><span>MONTO · ÚLTIMO MES</span><strong>{mxn(latest.amount_mxn)}</strong><small>{latest.period||'—'}</small></article>
      <article className="gi-market-card"><span>ACCIONES · ÚLTIMO MES</span><strong>{fmt(latest.actions)}</strong><small>financiamientos</small></article>
      <article className="gi-market-card"><span>H1 2026 · ACCIONES</span><strong>{cmp.actions_pct>=0?'+':''}{pct(cmp.actions_pct)}</strong><small>vs H1 2025</small></article>
      <article className="gi-market-card"><span>H1 2026 · MONTO</span><strong>{cmp.amount_pct>=0?'+':''}{pct(cmp.amount_pct)}</strong><small>vs H1 2025</small></article>
    </div>

    <section className="gi-market-block">
      <header><div><span>01</span><h2>Flujo mensual de financiamiento</h2></div><small>SNIIV / SEDATU · Mazatlán</small></header>
      <MarketTrend rows={data.monthly||[]}/>
    </section>

    <section className="gi-market-block">
      <header><div><span>02</span><h2>Estructura de la demanda financiada</h2></div><div className="gi-block-tabs"><button className={tab==='modalities'?'active':''} onClick={()=>setTab('modalities')}>Modalidad</button><button className={tab==='segments'?'active':''} onClick={()=>setTab('segments')}>Segmento vivienda nueva</button></div></header>

      {tab==='modalities'?<div className="gi-market-bars">
        {modalities.map(m=><div key={m.label} className="gi-market-bar">
          <div className="gi-market-bar-copy"><strong>{m.label}</strong><span>{fmt(m.actions_h1_2026)} acciones · {pct(m.share_h1_2026_pct)} del H1 2026</span></div>
          <i><em style={{width:(Number(m.actions_h1_2026)/maxModal*100)+'%'}}/></i>
          <b className={(Number(m.actions_yoy_pct)||0)>=0?'positive':'negative'}>{Number(m.actions_yoy_pct)>=0?'+':''}{pct(m.actions_yoy_pct)} a/a</b>
          <small>{mxn(m.avg_financing_h1_2026_mxn)} promedio</small>
        </div>)}
      </div>:<div className="gi-market-bars">
        {segments.map(s=><div key={s.label} className="gi-market-bar">
          <div className="gi-market-bar-copy"><strong>{s.label}</strong><span>{fmt(s.actions_h1_2026)} acciones · {pct(s.share_new_h1_2026_pct)} de vivienda nueva</span></div>
          <i><em style={{width:(Number(s.actions_h1_2026)/maxSegment*100)+'%'}}/></i>
          <b className={(Number(s.actions_yoy_pct)||0)>=0?'positive':'negative'}>{Number(s.actions_yoy_pct)>=0?'+':''}{pct(s.actions_yoy_pct)} a/a</b>
          <small>{mxn(s.avg_financing_h1_2026_mxn)} promedio</small>
        </div>)}
      </div>}
    </section>

    <div className="gi-market-two">
      <section className="gi-market-block">
        <header><div><span>03</span><h2>Demanda potencial INFONAVIT</h2></div><small>{demand.period}</small></header>
        <div className="gi-demand-total"><span>Total beneficiarios</span><strong>{fmt(demand.total)}</strong></div>
        <div className="gi-demand-bands">{(demand.bands||[]).map(b=><div key={b.label}><span>{b.label}</span><i><em style={{width:(Number(b.beneficiaries)/(Number(demand.total)||1)*100)+'%'}}/></i><b>{fmt(b.beneficiaries)}</b></div>)}</div>
      </section>
      <section className="gi-market-block">
        <header><div><span>04</span><h2>Lectura de mercado</h2></div></header>
        <div className="gi-market-insights">
          <p><TrendingUp size={14}/><span>Las acciones de financiamiento del <b>H1 2026 aumentaron {pct(cmp.actions_pct)}</b> frente al H1 2025.</span></p>
          <p><BarChart3 size={14}/><span>El monto financiado creció <b>{pct(cmp.amount_pct)}</b>, mientras el ticket promedio cambió <b>{pct(cmp.avg_ticket_pct)}</b>.</span></p>
          <p><HomeIcon size={14}/><span>La vivienda nueva representa <b>{pct(modalities.find(x=>x.label==='Vivienda nueva')?.share_h1_2026_pct)}</b> de las acciones del H1 2026.</span></p>
        </div>
      </section>
    </div>

    <div className="gi-market-note"><Info size={13}/><span>{(data.notes||[])[0]||'Los indicadores municipales no deben atribuirse directamente a una AGEB.'} Los datos de financiamiento son municipales y no se imputan a zonas intraurbanas.</span></div>
  </main>
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
  return <div className="gi-property-drawer-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <aside className="gi-property-drawer">
      <div className="gi-property-drawer-top"><span>ACTIVO DEMO</span><button onClick={onClose}><X size={15}/></button></div>
      <div className="gi-property-drawer-hero"><span>{property.type}</span><h2>{property.title}</h2><p>AGEB {property.location_id.slice(-4)} · Mazatlán, Sinaloa</p><b>{property.opportunity_score}<em>/100</em></b></div>
      <div className="gi-property-drawer-value"><span>Valor de referencia simulado</span><strong>{mxn(property.estimated_value)}</strong><small>{mxn(property.price_m2)} / m²</small></div>
      <div className="gi-property-drawer-kpis"><div><span>Superficie</span><strong>{fmt(property.area_m2)} m²</strong></div><div><span>Tipo</span><strong>{property.type}</strong></div></div>
      <div className="gi-property-drawer-actions"><button className={saved?'saved':''} onClick={toggle}><Bookmark size={13}/>{saved?' Guardada':' Guardar'}</button><button onClick={()=>go('location',property.location_id)}>Abrir ubicación <ArrowRight size={12}/></button></div>
      <section className="gi-property-drawer-section"><span>CONTEXTO</span><p>Este activo es sintético y existe para probar el flujo de producto. El score sí se vincula al perfil territorial de su AGEB; superficie y valores son datos simulados.</p></section>
      <section className="gi-property-drawer-section"><span>PRÓXIMAS CAPAS</span><div className="gi-property-roadmap"><p><Check size={12}/> Contexto territorial</p><p><Check size={12}/> Score de ubicación</p><p><Plus size={12}/> Predio catastral real</p><p><Plus size={12}/> Historial transaccional</p><p><Plus size={12}/> Propietario / contacto</p></div></section>
    </aside>
  </div>
}

function Properties(){
  const [rows,setRows]=useState([])
  const [type,setType]=useState('Todos')
  const [minScore,setMinScore]=useState(0)
  const [area,setArea]=useState('all')
  const [selected,setSelected]=useState(null)
  const [loading,setLoading]=useState(true)

  const areaFilter=area==='small'?{maxArea:1200}:area==='medium'?{minArea:1200,maxArea:3000}:area==='large'?{minArea:3000}:{}

  useEffect(()=>{
    let active=true
    setLoading(true)
    getProperties(60,{type,minScore,...areaFilter}).then(r=>active&&setRows(r.rows||[])).finally(()=>active&&setLoading(false))
    return()=>{active=false}
  },[type,minScore,area])

  return <main className="gi-properties">
    <section className="gi-properties-head"><div><span>PROPERTY INTELLIGENCE</span><h1>Oportunidades inmobiliarias.</h1><p>Prototipo de activos conectado al contexto territorial. La capa de propiedad es simulada hasta integrar información predial observada.</p></div><span className="gi-demo-badge">DATOS DE ACTIVO SIMULADOS</span></section>

    <div className="gi-property-filterbar">
      <div className="gi-property-filter-group"><span>Tipo</span>{['Todos','Terreno','Uso mixto','Comercial','Residencial'].map(t=><button key={t} className={type===t?'active':''} onClick={()=>setType(t)}>{t}</button>)}</div>
      <label><span>Score mínimo</span><select value={minScore} onChange={e=>setMinScore(Number(e.target.value))}><option value="0">Todos</option><option value="60">60+</option><option value="70">70+</option><option value="80">80+</option></select></label>
      <label><span>Superficie</span><select value={area} onChange={e=>setArea(e.target.value)}><option value="all">Todas</option><option value="small">&lt; 1,200 m²</option><option value="medium">1,200–3,000 m²</option><option value="large">3,000+ m²</option></select></label>
      <b>{rows.length} activos</b>
    </div>

    {loading?<div className="gi-property-skeleton">{Array.from({length:9},(_,i)=><i key={i}/>)}</div>:<section className="gi-property-grid">
      {rows.map(p=><article key={p.id} className="gi-property-card">
        <button className="gi-property-visual" onClick={()=>setSelected(p)}><span>{p.type}</span><b>{p.opportunity_score}/100</b><MapIcon size={28}/><em>Vista de activo</em></button>
        <div className="gi-property-body"><span>{p.id}</span><h3>{p.title}</h3><p>AGEB {p.location_id.slice(-4)} · Mazatlán, Sinaloa</p>
          <div><span><Ruler size={12}/>{fmt(p.area_m2)} m²</span><span>{mxn(p.price_m2)}/m²</span></div>
          <strong>{mxn(p.estimated_value)}</strong>
          <button onClick={()=>setSelected(p)}>Ver oportunidad <ArrowRight size={12}/></button>
        </div>
      </article>)}
    </section>}
    {selected&&<PropertyDrawer property={selected} onClose={()=>setSelected(null)}/>}
  </main>
}

function App(){
  const [route,setRoute]=useState(routeFromHash)
  useEffect(()=>{
    const handler=()=>setRoute(routeFromHash())
    addEventListener('hashchange',handler)
    if(!location.hash)location.hash='home'
    return()=>removeEventListener('hashchange',handler)
  },[])
  const status=apiStatus()
  const page=route.page
  let content=<Home/>
  if(page==='platform')content=<Platform/>
  else if(page==='locations')content=<Locations/>
  else if(page==='location'&&route.id)content=<LocationProfile id={route.id}/>
  else if(page==='district'&&route.id)content=<DistrictProfile slug={route.id}/>
  else if(page==='market')content=<Market/>
  else if(page==='properties')content=<Properties/>
  return <div className="gi-app">
    <Header page={page}/>
    {content}
    <footer className="gi-footer"><div><span>G</span><strong>GROWA INMOBILIARIO</strong></div><p>Location intelligence para desarrollo, inversión y mercado.</p><em className={status.connected?'connected':''}>{status.connected?'API conectada':'modo local'}</em></footer>
  </div>
}

export default App
