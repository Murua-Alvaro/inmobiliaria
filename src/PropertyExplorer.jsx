import React, { useMemo, useState } from 'react'
import {
  Search, ChevronDown, ArrowRight, Database, MapPin, Users, Store,
  School, CloudSun, BarChart3, Layers3, Home, Building2, BriefcaseBusiness,
  Sparkles, Map, Target, LineChart, PanelTop, Bot, MessageSquareText
} from 'lucide-react'
import './propertyExplorer.css'

const fmt=(v,d=0)=>Number.isFinite(Number(v))
  ? Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d})
  :'—'

function seed(id,salt=0){
  const s=String(id)+':'+salt
  let h=2166136261
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return ((h>>>0)%10000)/10000
}

function scoreFor(r){
  const id=String(r?.cvegeo_ageb||'')
  const pop=Number(r?.pobtot||0)
  return Math.max(5,Math.min(10,Math.round((6.2+Math.min(1.8,pop/6500)+seed(id,9)*1.7)*10)/10))
}

const DATA_CARDS=[
  {key:'demografia',title:'Demografía',text:'Datos demográficos detallados por ubicación, AGEB y mercado.',icon:Users},
  {key:'scores',title:'Location Scores',text:'Indicadores comparables para evaluar el carácter y desempeño de cada zona.',icon:BarChart3},
  {key:'perfiles',title:'Perfiles',text:'Perfiles sociodemográficos y económicos para cada área de análisis.',icon:Target},
  {key:'poi',title:'Puntos de interés',text:'Comercio, servicios, amenidades y equipamiento alrededor de una ubicación.',icon:MapPin},
  {key:'snapshot',title:'Location Snapshot',text:'Resumen inmediato de mercado para una ubicación, radio o polígono.',icon:PanelTop},
  {key:'market',title:'Market Stats',text:'Señales de mercado, actividad empresarial, vivienda y dinámica territorial.',icon:LineChart},
  {key:'school',title:'Datos escolares',text:'Oferta educativa, accesibilidad y contexto de servicios educativos.',icon:School},
  {key:'climate',title:'Riesgo climático',text:'Capas ambientales y exposición territorial para decisiones de desarrollo.',icon:CloudSun},
]

const SOLUTION_CARDS=[
  {title:'Páginas de comunidad',text:'Integra perfiles territoriales en páginas de desarrollos e inmuebles.',icon:Home},
  {title:'Búsqueda de estilo de vida',text:'Permite buscar ubicaciones por atributos, amenidades y contexto.',icon:Search},
  {title:'Experiencia de listados',text:'Añade inteligencia de ubicación directamente a cada propiedad.',icon:Building2},
  {title:'Captura de leads',text:'Convierte interés territorial en oportunidades comerciales accionables.',icon:Target},
  {title:'Reportes de vecindario',text:'Genera perfiles de zona listos para clientes, brokers y desarrolladores.',icon:Map},
]

const USE_CASES=[
  {title:'Asistente local para agentes',text:'Contexto territorial listo para explicar una ubicación a un cliente.',icon:Bot},
  {title:'Búsqueda conversacional',text:'Explora zonas con preguntas naturales sobre mercado, servicios y demanda.',icon:MessageSquareText},
  {title:'Contenido con datos reales',text:'Genera descripciones basadas en señales territoriales verificables.',icon:Sparkles},
  {title:'Recomendaciones locales',text:'Relaciona proyectos e inmuebles con el contexto económico de su entorno.',icon:Target},
  {title:'Contexto para listados',text:'Enriquece cada activo con demografía, negocios, turismo y vivienda.',icon:Layers3},
  {title:'Selección y screening de sitios',text:'Compara ubicaciones para expansión, inversión o nuevos desarrollos.',icon:MapPin},
]

function isCity(r){
  const id=String(r?.cvegeo_ageb||'')
  return id.slice(5,9)==='0001'&&Number(r?.pobtot||0)>0
}

function PlatformCard({item,onOpen}){
  const Icon=item.icon
  return <button className="ll-card" onClick={()=>onOpen?.(item)}>
    <span className="ll-card-icon"><Icon size={17}/></span>
    <div><strong>{item.title}</strong><p>{item.text}</p></div>
  </button>
}

function LeftFilters({industry,setIndustry,query,setQuery}){
  return <aside className="ll-filters">
    <h3>Filtros</h3>
    <label className="ll-filter-search"><Search size={13}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar..."/></label>
    <div className="ll-filter-group">
      <span>Industria</span>
      {['Comercial','Otro','Residencial'].map(x=><label key={x}><input type="radio" checked={industry===x} onChange={()=>setIndustry(x)}/><i/>{x}</label>)}
    </div>
    <div className="ll-filter-group ll-filter-bottom">
      <span>Solución</span>
      <button>Overview <ChevronDown size={11}/></button>
    </div>
  </aside>
}

function PlatformNav({section,setSection}){
  const items=[
    ['mcp','MCP','NEW'],
    ['usecases','Casos de uso',''],
    ['solutions','Soluciones',''],
    ['data','Datos',''],
    ['insights','Insights','NEW'],
  ]
  return <aside className="ll-platform-nav">
    <div className="ll-platform-nav-title">EXPLORA PLATAFORMA</div>
    {items.map(([key,label,badge])=><button key={key} className={section===key?'active':''} onClick={()=>setSection(key)}>
      <span>{label}</span>{badge&&<em>{badge}</em>}
    </button>)}
  </aside>
}

function CardExplorer({section,onOpen}){
  const config={
    data:{eyebrow:'DATOS',title:'Ver todo',cards:DATA_CARDS},
    solutions:{eyebrow:'SOLUCIONES',title:'Ver todo',cards:SOLUTION_CARDS},
    usecases:{eyebrow:'CASOS DE USO',title:'Ver todo',cards:USE_CASES},
    mcp:{eyebrow:'MCP',title:'Ver todo',cards:USE_CASES},
  }[section]||{eyebrow:'DATOS',title:'Ver todo',cards:DATA_CARDS}
  return <section className="ll-explorer">
    <div className="ll-explorer-head"><span>{config.eyebrow}</span><button>{config.title} <ArrowRight size={12}/></button></div>
    <div className="ll-card-grid">{config.cards.map(item=><PlatformCard key={item.title} item={item} onOpen={onOpen}/>)}</div>
  </section>
}

function Atlas({records,query,setQuery,onOpen}){
  const ranked=useMemo(()=>Object.values(records||{}).filter(isCity).map(r=>({
    id:String(r.cvegeo_ageb),
    pop:Number(r.pobtot||0),
    score:scoreFor(r)
  })).sort((a,b)=>b.score-a.score).slice(0,10),[records])

  const filtered=ranked.filter(x=>!query.trim()||x.id.includes(query.trim()))
  return <section className="ll-atlas">
    <div className="ll-atlas-hero">
      <div className="ll-atlas-watermark"><span/><span/><span/><span/><span/></div>
      <div className="ll-atlas-copy">
        <span className="ll-atlas-kicker">GROWA LOCATION INTELLIGENCE</span>
        <h1>Insights Atlas</h1>
        <p>Obtén inteligencia de ubicación para cualquier AGEB, zona o mercado de Mazatlán.</p>
        <div className="ll-atlas-search">
          <label><MapPin size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar una dirección, colonia, AGEB o zona"/></label>
          <button><Search size={14}/> Obtener insights</button>
        </div>
      </div>
    </div>
    <div className="ll-atlas-ranking">
      <div className="ll-ranking-head"><h2>Top 10 Zonas</h2><div><button className="active">Mazatlán</button><button>Mercado urbano</button></div><button className="ll-add-area">+ Añadir tu zona</button></div>
      <div className="ll-score-tabs">
        <button className="active">Movilidad</button><button>Ciclismo</button><button>Restaurantes</button><button>Comercio</button><button>Cafés</button><button>Servicios</button><button>Turismo</button>
      </div>
      <div className="ll-ranking-grid">
        {filtered.map((x,i)=><button className="ll-ranking-row" key={x.id} onClick={()=>onOpen?.({title:'AGEB '+x.id.slice(-4),text:'Perfil territorial de Mazatlán',key:x.id})}>
          <span className="ll-rank-num">{i+1}</span>
          <div><strong>AGEB {x.id.slice(-4)}</strong><small>Mazatlán, Sinaloa</small></div>
          <span className="ll-rank-metric"><MapPin size={12}/> Ubicación</span>
          <b>{fmt(x.score,1)}</b>
        </button>)}
      </div>
    </div>
  </section>
}

function DetailDrawer({item,onClose}){
  if(!item)return null
  return <div className="ll-drawer" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <article>
      <button className="ll-drawer-close" onClick={onClose}>×</button>
      <span>GROWA · LOCATION INTELLIGENCE</span>
      <h2>{item.title}</h2>
      <p>{item.text}</p>
      <div className="ll-drawer-card"><strong>Vista de producto</strong><p>Este módulo conservará la misma interfaz limpia de Local Logic y se conectará después con las bases reales de Growa.</p></div>
      <button className="ll-primary">Abrir módulo <ArrowRight size={13}/></button>
    </article>
  </div>
}

export default function PropertyExplorer({records,mode='explorar'}){
  const [section,setSection]=useState(mode==='reportes'?'insights':'data')
  const [industry,setIndustry]=useState('Comercial')
  const [query,setQuery]=useState('')
  const [detail,setDetail]=useState(null)

  const effectiveSection=mode==='prospectos'?'solutions':mode==='propiedades'?'usecases':section

  return <main className="ll-page">
    <div className="ll-content-shell">
      {effectiveSection!=='insights'&&<LeftFilters industry={industry} setIndustry={setIndustry} query={query} setQuery={setQuery}/>}
      <PlatformNav section={effectiveSection} setSection={setSection}/>
      <div className="ll-main">
        {effectiveSection==='insights'
          ? <Atlas records={records} query={query} setQuery={setQuery} onOpen={setDetail}/>
          : <CardExplorer section={effectiveSection} onOpen={setDetail}/>}
      </div>
      <aside className="ll-side-promo">
        <div><span>Growa</span><strong>Location Intelligence</strong><p>Contexto territorial para mejores decisiones inmobiliarias.</p><button>Conocer más</button></div>
      </aside>
    </div>
    <div className="ll-newsletter">
      <Database size={17}/><div><strong>Suscríbete a las actualizaciones de Growa</strong><span>Inteligencia territorial, mercado y desarrollo urbano.</span></div><button>Correo electrónico <ArrowRight size={12}/></button>
    </div>
    <DetailDrawer item={detail} onClose={()=>setDetail(null)}/>
  </main>
}
