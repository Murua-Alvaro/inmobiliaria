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
  return <header className="gi-header gi-header-v2">
    <button className="gi-brand gi-brand-v2" onClick={()=>go('home')}>
      <span>G</span>
      <div><strong>GROWA</strong><small>PROPERTY INTELLIGENCE</small></div>
    </button>
    <nav className="gi-nav gi-nav-v2">
      <button className={page==='locations'||page==='district'||page==='location'?'active':''} onClick={()=>go('locations')}><MapPin size={15}/> Explorar</button>
      <button className={page==='properties'?'active':''} onClick={()=>go('properties')}><Building2 size={15}/> Propiedades</button>
      <button className={page==='market'?'active':''} onClick={()=>go('market')}><TrendingUp size={15}/> Mercado</button>
      <button className={page==='platform'?'active':''} onClick={()=>go('platform')}><Database size={15}/> Datos & producto</button>
    </nav>
    <div className="gi-header-actions gi-header-actions-v2">
      <span className="gi-territory-chip"><MapPin size={13}/> Mazatlán, Sinaloa</span>
      <button className="gi-demo" onClick={()=>go('properties')}>Abrir workspace <ArrowRight size={13}/></button>
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
  const [ranking,setRanking]=useState([])
  const [districts,setDistricts]=useState([])
  const [market,setMarket]=useState(null)
  useEffect(()=>{
    let active=true
    Promise.all([
      getRankings('opportunity',8).catch(()=>({rows:[]})),
      getDistricts().catch(()=>({rows:[]})),
      getMarketSummary().catch(()=>null)
    ]).then(([r,d,m])=>{
      if(!active)return
      setRanking(r.rows||[])
      setDistricts(d.rows||[])
      setMarket(m)
    })
    return()=>{active=false}
  },[])
  const top=ranking[0]
  const latest=market?.latest_month||{}
  return <main className="gi-platform-v2">
    <section className="gp-hero">
      <div className="gp-hero-copy">
        <span className="gp-eyebrow">GROWA · REAL ESTATE INTELLIGENCE</span>
        <h1>Un workspace para entender <em>propiedad, ubicación y mercado.</em></h1>
        <p>La plataforma conecta información territorial, demográfica y de vivienda para investigar zonas, filtrar oportunidades y construir perfiles de mercado sin saltar entre distintas fuentes.</p>
        <div className="gp-hero-actions">
          <button className="primary" onClick={()=>go('properties')}>Explorar propiedades <ArrowRight size={15}/></button>
          <button onClick={()=>go('locations')}>Abrir Location Intelligence</button>
        </div>
      </div>
      <div className="gp-hero-product">
        <div className="gp-product-top"><span>LIVE WORKSPACE</span><b>Mazatlán</b></div>
        <div className="gp-product-search"><Search size={14}/><span>AGEB, zona, activo o distrito</span></div>
        <div className="gp-product-map">
          {Array.from({length:18},(_,i)=><i key={i} style={{left:(8+(i*37)%84)+'%',top:(12+(i*23)%74)+'%',width:(18+(i*7)%28)+'px',height:(14+(i*11)%25)+'px'}}/>)}
          <span className="hot a">78</span><span className="hot b">84</span><span className="hot c">71</span>
        </div>
        <div className="gp-product-foot"><span><i/> Opportunity layer</span><b>{ranking.length?ranking.length+' zonas cargadas':'Cargando…'}</b></div>
      </div>
    </section>

    <section className="gp-kpis">
      <article><span>COBERTURA TERRITORIAL</span><strong>{ranking.length?ranking.length+'+':'—'}</strong><p>zonas listas para exploración</p></article>
      <article><span>DISTRITOS</span><strong>{districts.length||'—'}</strong><p>agregados territoriales CODESIN</p></article>
      <article><span>TOP OPPORTUNITY</span><strong>{top?.opportunity_score??'—'}</strong><p>{top?('AGEB '+top.id.slice(-4)):'score territorial'}</p></article>
      <article><span>FINANCIAMIENTOS · ÚLTIMO MES</span><strong>{fmt(latest.actions)}</strong><p>{market?.observed_through||'SNIIV / SEDATU'}</p></article>
    </section>

    <section className="gp-modules">
      <header><div><span>PRODUCTOS</span><h2>Investiga desde lo macro hasta el activo.</h2></div><p>Un flujo continuo: mercado → zona → activo → perfil.</p></header>
      <div className="gp-module-grid">
        <button className="gp-module featured" onClick={()=>go('properties')}>
          <div className="gp-module-visual property"><div className="fake-side"/><div className="fake-map"><i/><i/><i/><i/><i/><i/></div></div>
          <span>01 · PROPERTY INTELLIGENCE</span><h3>Búsqueda de activos y oportunidades</h3>
          <p>Filtros, mapa, tabla, scoring territorial, fichas de activo y preparación para predios, propietarios y comparables.</p>
          <b>Abrir workspace <ArrowRight size={14}/></b>
        </button>
        <button className="gp-module" onClick={()=>go('locations')}>
          <div className="gp-module-icon"><MapPin size={22}/></div>
          <span>02 · LOCATION INTELLIGENCE</span><h3>Perfiles territoriales</h3>
          <p>AGEB y distritos con población, hogares, movilidad y señales comparables de contexto.</p>
          <b>Explorar zonas <ArrowRight size={14}/></b>
        </button>
        <button className="gp-module" onClick={()=>go('market')}>
          <div className="gp-module-icon"><TrendingUp size={22}/></div>
          <span>03 · MARKET INTELLIGENCE</span><h3>Demanda y financiamiento</h3>
          <p>Serie mensual, estructura de financiamiento, segmentos y profundidad de demanda municipal.</p>
          <b>Ver mercado <ArrowRight size={14}/></b>
        </button>
      </div>
    </section>

    <section className="gp-data-stack">
      <div className="gp-data-copy"><span>DATA FOUNDATION</span><h2>La ventaja está en la capa de datos.</h2><p>Growa separa dato observado, indicador derivado y activo simulado para que cada resultado conserve trazabilidad.</p></div>
      <div className="gp-data-table">
        <div><span>INEGI · Censo 2020</span><b>AGEB</b><em>Demografía y vivienda</em><i className="live">Observado</i></div>
        <div><span>CODESIN</span><b>Distrito</b><em>Polígonos territoriales</em><i className="live">Observado</i></div>
        <div><span>SNIIV / SEDATU</span><b>Municipio</b><em>Financiamiento de vivienda</em><i className="live">Observado</i></div>
        <div><span>Growa Territorial</span><b>AGEB / distrito</b><em>Scores y agregados</em><i>Derivado</i></div>
        <div><span>Property layer</span><b>Activo</b><em>Prototipo para flujo de producto</em><i className="demo">Simulado</i></div>
      </div>
    </section>
  </main>
}

function LocationMapExplorer({mode,rows,metric='opportunity'}){
  const node=useRef(null), mapRef=useRef(null), layerRef=useRef(null)
  const geometryUrl=mode==='district'?'/data/codesin-districts.geojson':'/data/ageb-geometry-2020.geojson'

  useEffect(()=>{
    if(!node.current||mapRef.current)return
    const map=L.map(node.current,{zoomControl:false,attributionControl:false,minZoom:9,maxZoom:17})
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
  const h1=data.h1||{}
  return <main className="gi-market-v2">
    <aside className="gm-side">
      <div><span>MARKET</span><h3>Mazatlán</h3><small>Sinaloa · México</small></div>
      <nav><button className="active"><BarChart3 size={15}/> Resumen</button><button><TrendingUp size={15}/> Financiamiento</button><button><HomeIcon size={15}/> Vivienda</button><button><Users size={15}/> Demanda</button></nav>
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

function PropertyMap({rows=[],selected,onSelect}){
  const node=useRef(null),mapRef=useRef(null),layerRef=useRef(null)
  useEffect(()=>{
    if(!node.current||mapRef.current)return
    const map=L.map(node.current,{zoomControl:false,attributionControl:false,minZoom:9,maxZoom:18})
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(map)
    L.control.zoom({position:'bottomright'}).addTo(map)
    map.setView([23.245,-106.425],11)
    mapRef.current=map
    return()=>{map.remove();mapRef.current=null}
  },[])
  useEffect(()=>{
    const map=mapRef.current
    if(!map)return
    let cancelled=false
    fetch('/data/ageb-geometry-2020.geojson').then(r=>r.json()).then(geo=>{
      if(cancelled)return
      if(layerRef.current)layerRef.current.remove()
      const byId=new Map()
      rows.forEach(p=>{
        const id=String(p.location_id||'')
        if(!byId.has(id))byId.set(id,[])
        byId.get(id).push(p)
      })
      const features=(geo.features||[]).filter(ft=>byId.has(String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)))
      const layer=L.geoJSON({type:'FeatureCollection',features},{
        style:ft=>{
          const id=String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
          const group=byId.get(id)||[]
          const maxScore=Math.max(...group.map(x=>Number(x.opportunity_score)||0),0)
          const active=selected&&String(selected.location_id)===id
          return {color:active?'#083f47':'#fff',weight:active?2:1,fillColor:maxScore>=80?'#0b777d':maxScore>=65?'#5ca7a7':'#b8d7d5',fillOpacity:active ? .92 : .78}
        },
        onEachFeature:(ft,l)=>{
          const id=String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
          const group=byId.get(id)||[]
          const best=[...group].sort((a,b)=>b.opportunity_score-a.opportunity_score)[0]
          if(!best)return
          l.bindTooltip('<div class="gi-map-tip"><small>AGEB '+id.slice(-4)+'</small><strong>'+group.length+' activo'+(group.length===1?'':'s')+'</strong><span>Score '+best.opportunity_score+'/100</span></div>',{sticky:true,direction:'top'})
          l.on('click',()=>onSelect?.(best))
        }
      }).addTo(map)
      layerRef.current=layer
      if(layer.getBounds().isValid())map.fitBounds(layer.getBounds(),{padding:[24,24]})
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[rows,selected,onSelect])
  return <div className="gi-property-map" ref={node}/>
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
  return <aside className="gi-reonomy-drawer">
    <div className="gi-reonomy-drawer-top">
      <button onClick={onClose}><X size={15}/></button>
      <div><span>{property.type}</span><small>{property.id}</small></div>
      <button className={saved?'saved':''} onClick={toggle}><Bookmark size={14}/></button>
    </div>
    <div className="gi-reonomy-photo"><MapIcon size={30}/><span>PROPERTY INTELLIGENCE</span></div>
    <div className="gi-reonomy-title">
      <span>AGEB {property.location_id.slice(-4)} · Mazatlán</span>
      <h2>{property.title}</h2>
      <strong>{mxn(property.estimated_value)}</strong>
      <small>{mxn(property.price_m2)} / m² · referencia simulada</small>
    </div>
    <div className="gi-reonomy-tabs"><button className="active">Resumen</button><button>Ubicación</button><button>Mercado</button><button>Notas</button></div>
    <section className="gi-reonomy-section">
      <header><span>BUILDING & LOT</span><b>{property.opportunity_score}/100</b></header>
      <div className="gi-reonomy-specs">
        <div><span>Tipo de activo</span><strong>{property.type}</strong></div>
        <div><span>Superficie</span><strong>{fmt(property.area_m2)} m²</strong></div>
        <div><span>Precio / m²</span><strong>{mxn(property.price_m2)}</strong></div>
        <div><span>Valor de referencia</span><strong>{mxn(property.estimated_value)}</strong></div>
      </div>
    </section>
    <section className="gi-reonomy-section">
      <header><span>LOCATION INTELLIGENCE</span></header>
      <div className="gi-location-score-row"><span>Oportunidad territorial</span><i><em style={{width:property.opportunity_score+'%'}}/></i><b>{property.opportunity_score}</b></div>
      <p className="gi-reonomy-copy">El score se vincula con la AGEB observada. Superficie y valor del activo siguen siendo simulados hasta integrar información predial real.</p>
      <button className="gi-reonomy-primary" onClick={()=>go('location',property.location_id)}>Abrir perfil de ubicación <ArrowRight size={12}/></button>
    </section>
    <section className="gi-reonomy-section">
      <header><span>DATA COVERAGE</span></header>
      <div className="gi-property-roadmap"><p><Check size={12}/> Demografía y territorio</p><p><Check size={12}/> Financiamiento municipal</p><p><Check size={12}/> Score de ubicación</p><p><Plus size={12}/> Predio / propietario real</p><p><Plus size={12}/> Transacciones y comparables</p></div>
    </section>
  </aside>
}

function Properties(){
  const [rows,setRows]=useState([])
  const [type,setType]=useState('Todos')
  const [minScore,setMinScore]=useState(0)
  const [area,setArea]=useState('all')
  const [price,setPrice]=useState('all')
  const [query,setQuery]=useState('')
  const [sort,setSort]=useState('score_desc')
  const [view,setView]=useState('map')
  const [selected,setSelected]=useState(null)
  const [loading,setLoading]=useState(true)
  const [filtersOpen,setFiltersOpen]=useState(true)
  const [layersOpen,setLayersOpen]=useState(false)

  const areaFilter=area==='small'?{maxArea:1200}:area==='medium'?{minArea:1200,maxArea:3000}:area==='large'?{minArea:3000}:{}
  const priceFilter=price==='low'?{maxPriceM2:18000}:price==='mid'?{minPriceM2:18000,maxPriceM2:26000}:price==='high'?{minPriceM2:26000}:{}
  useEffect(()=>{
    let active=true
    const t=setTimeout(()=>{
      setLoading(true)
      getProperties(100,{type,minScore,...areaFilter,...priceFilter,q:query,sort}).then(r=>{
        if(!active)return
        setRows(r.rows||[])
        if(selected&&!((r.rows||[]).some(x=>x.id===selected.id)))setSelected(null)
      }).finally(()=>active&&setLoading(false))
    },120)
    return()=>{active=false;clearTimeout(t)}
  },[type,minScore,area,price,query,sort])

  const avgScore=rows.length?Math.round(rows.reduce((a,r)=>a+(Number(r.opportunity_score)||0),0)/rows.length):0
  const avgPrice=rows.length?Math.round(rows.reduce((a,r)=>a+(Number(r.price_m2)||0),0)/rows.length):0
  const totalValue=rows.reduce((a,r)=>a+(Number(r.estimated_value)||0),0)
  const clear=()=>{setType('Todos');setMinScore(0);setArea('all');setPrice('all');setQuery('')}

  return <main className="gi-reonomy gi-reonomy-v2">
    <div className="gr-searchbar">
      <div className="gr-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar AGEB, tipo de activo o identificador"/>{query&&<button onClick={()=>setQuery('')}><X size={14}/></button>}</div>
      <button className="gr-location"><MapPin size={15}/> Mazatlán, Sinaloa <ChevronDown size={13}/></button>
      <button className="gr-save"><Bookmark size={14}/> Guardar búsqueda</button>
    </div>

    <div className="gr-toolbar">
      <div>
        <button className={filtersOpen?'active':''} onClick={()=>setFiltersOpen(v=>!v)}><ListFilter size={15}/> Filtros</button>
        <button className={layersOpen?'active':''} onClick={()=>setLayersOpen(v=>!v)}><Layers3 size={15}/> Capas</button>
        <button><Ruler size={15}/> Dibujar área</button>
      </div>
      <span><b>{rows.length}</b> resultados en Mazatlán</span>
      <div className="gr-view">
        <button className={view==='map'?'active':''} onClick={()=>setView('map')}><MapIcon size={14}/> Mapa</button>
        <button className={view==='table'?'active':''} onClick={()=>setView('table')}><ListFilter size={14}/> Tabla</button>
      </div>
      <label>Ordenar <select value={sort} onChange={e=>setSort(e.target.value)}><option value="score_desc">Mayor oportunidad</option><option value="value_desc">Mayor valor</option><option value="price_asc">Menor $/m²</option><option value="area_desc">Mayor superficie</option></select></label>
    </div>

    <div className={'gr-shell '+(!filtersOpen?'filters-collapsed ':'')+(selected?'has-drawer':'')}>
      {filtersOpen&&<aside className="gr-filters">
        <div className="gr-filter-head"><div><strong>Filtros</strong><span>Construye tu universo objetivo</span></div><button onClick={clear}>Limpiar</button></div>
        <section>
          <span>TIPO DE ACTIVO</span>
          <div className="gr-filter-pills">{['Todos','Terreno','Uso mixto','Comercial','Residencial'].map(t=><button key={t} className={type===t?'active':''} onClick={()=>setType(t)}>{t}</button>)}</div>
        </section>
        <section>
          <span>OPPORTUNITY SCORE</span>
          <div className="gr-range-buttons">{[[0,'Todos'],[60,'60+'],[70,'70+'],[80,'80+']].map(([v,l])=><button key={v} className={minScore===v?'active':''} onClick={()=>setMinScore(v)}>{l}</button>)}</div>
        </section>
        <section>
          <span>SUPERFICIE DE ACTIVO</span>
          <select value={area} onChange={e=>setArea(e.target.value)}><option value="all">Cualquier superficie</option><option value="small">Menos de 1,200 m²</option><option value="medium">1,200–3,000 m²</option><option value="large">Más de 3,000 m²</option></select>
        </section>
        <section>
          <span>PRECIO DE REFERENCIA / m²</span>
          <select value={price} onChange={e=>setPrice(e.target.value)}><option value="all">Cualquier precio</option><option value="low">Menos de $18,000</option><option value="mid">$18,000 – $26,000</option><option value="high">Más de $26,000</option></select>
        </section>
        <section>
          <span>SEÑALES DE UBICACIÓN</span>
          <label><input type="checkbox" defaultChecked/> Densidad residencial</label>
          <label><input type="checkbox" defaultChecked/> Movilidad reciente</label>
          <label><input type="checkbox"/> Expansión urbana</label>
          <label><input type="checkbox"/> Actividad económica</label>
        </section>
        <div className="gr-data-note"><Database size={14}/><div><strong>Data coverage</strong><p>El activo es prototipo; el contexto territorial se vincula a información observada.</p></div></div>
      </aside>}

      <section className="gr-results">
        <div className="gr-summary">
          <div><span>RESULTADOS</span><strong>{rows.length}</strong></div>
          <div><span>SCORE MEDIO</span><strong>{avgScore}<small>/100</small></strong></div>
          <div><span>PRECIO MEDIO</span><strong>{mxn(avgPrice)}<small>/m²</small></strong></div>
          <div><span>VALOR VISIBLE</span><strong>{mxn(totalValue)}</strong></div>
        </div>
        <div className="gr-result-head"><span>ACTIVOS</span><button><Download size={13}/> Exportar</button></div>
        {loading?<div className="gr-loading">{Array.from({length:6},(_,i)=><i key={i}/>)}</div>:
        <div className="gr-result-list">
          {rows.map(p=><button key={p.id} className={'gr-result '+(selected?.id===p.id?'active':'')} onClick={()=>setSelected(p)}>
            <div className="gr-thumb"><Building2 size={20}/><span>{p.type}</span></div>
            <div className="gr-result-copy"><small>{p.id}</small><strong>{p.title}</strong><span>AGEB {p.location_id.slice(-4)} · Mazatlán</span><div><em>{fmt(p.area_m2)} m²</em><em>{mxn(p.price_m2)}/m²</em></div></div>
            <div className="gr-result-metric"><strong>{mxn(p.estimated_value)}</strong><span>Opportunity {p.opportunity_score}</span><i><em style={{width:p.opportunity_score+'%'}}/></i></div>
          </button>)}
          {!rows.length&&<div className="gr-empty"><Search size={24}/><strong>No hay activos con estos filtros</strong><span>Ajusta el universo de búsqueda.</span></div>}
        </div>}
      </section>

      <section className="gr-mapstage">
        {view==='map'?<>
          <PropertyMap rows={rows} selected={selected} onSelect={setSelected}/>
          <div className="gr-map-legend"><strong>Opportunity score</strong><span><i className="hi"/> 80–100</span><span><i className="mid"/> 65–79</span><span><i/> &lt;65</span></div>
          <div className="gr-map-count"><MapPin size={13}/>{rows.length} activos en vista</div>
          {layersOpen&&<div className="gr-layer-menu">
            <header><strong>Capas del mapa</strong><button onClick={()=>setLayersOpen(false)}><X size={14}/></button></header>
            <label><input type="checkbox" defaultChecked/> Opportunity score</label>
            <label><input type="checkbox"/> Densidad de población</label>
            <label><input type="checkbox"/> Vivienda</label>
            <label><input type="checkbox"/> DENUE / actividad</label>
            <label><input type="checkbox"/> Distritos CODESIN</label>
            <small>Las capas adicionales se activarán conforme se incorporen sus geometrías al API de mapas.</small>
          </div>}
        </>:<div className="gr-table">
          <div className="gr-table-head"><span>Activo</span><span>Tipo</span><span>Área</span><span>$/m²</span><span>Valor</span><span>Score</span></div>
          {rows.map(p=><button key={p.id} onClick={()=>setSelected(p)}><span><b>{p.title}</b><small>{p.id}</small></span><span>{p.type}</span><span>{fmt(p.area_m2)} m²</span><span>{mxn(p.price_m2)}</span><span>{mxn(p.estimated_value)}</span><strong>{p.opportunity_score}</strong></button>)}
        </div>}
      </section>
      {selected&&<PropertyDrawer property={selected} onClose={()=>setSelected(null)}/>}
    </div>
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
