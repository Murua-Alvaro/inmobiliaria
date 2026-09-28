import React,{useMemo,useState} from 'react'
import {
  Search,MapPin,Footprints,Bike,TrainFront,ShoppingBag,Coffee,Utensils,
  School,CloudSun,Users,BarChart3,Target,MapPinned,PanelTop,ArrowRight,
  Bot,MessageSquareText,Sparkles,Layers3,Home,Building2,BriefcaseBusiness,
  Database,ChevronDown
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
function isCity(r){
  const id=String(r?.cvegeo_ageb||'')
  return id.slice(5,9)==='0001'&&Number(r?.pobtot||0)>0
}
function scoreFor(r,salt=0){
  const id=String(r?.cvegeo_ageb||'')
  const pop=Number(r?.pobtot||0)
  return Math.max(5,Math.min(10,Math.round((6.1+Math.min(1.7,pop/7000)+seed(id,17+salt)*1.8)*10)/10))
}

const scoreTabs=[
  {k:'walk',label:'Caminar',icon:Footprints},
  {k:'bike',label:'Ciclismo',icon:Bike},
  {k:'transit',label:'Transporte',icon:TrainFront},
  {k:'grocery',label:'Comercio',icon:ShoppingBag},
  {k:'coffee',label:'Cafés',icon:Coffee},
  {k:'dining',label:'Restaurantes',icon:Utensils},
  {k:'schools',label:'Escuelas',icon:School},
]

const dataCards=[
  ['Demografía','Datos demográficos detallados para una ubicación, AGEB o mercado.',Users],
  ['Location Scores','Puntuaciones comparables de accesibilidad, servicios y entorno.',BarChart3],
  ['Perfiles','Perfiles territoriales y sociodemográficos para cada zona.',Target],
  ['Puntos de interés','Amenidades, comercio y servicios alrededor de una ubicación.',MapPinned],
  ['Location Snapshot','Resumen inmediato de contexto territorial y de mercado.',PanelTop],
  ['Market Stats','Indicadores de actividad económica y desempeño territorial.',BarChart3],
  ['School Data','Oferta educativa y accesibilidad a equipamiento escolar.',School],
  ['Climate Risk','Capas ambientales y exposición territorial para desarrollo.',CloudSun],
]
const useCases=[
  ['Agente local experto','Contexto territorial listo para explicar una ubicación a un cliente.',Bot],
  ['Búsqueda conversacional','Explora ubicaciones con preguntas naturales y criterios de mercado.',MessageSquareText],
  ['Contenido con datos','Descripciones de mercado basadas en señales territoriales verificables.',Sparkles],
  ['Recomendaciones locales','Relaciona proyectos con el contexto económico del entorno.',Target],
  ['Contexto para listados','Añade información territorial directamente a cada propiedad.',Layers3],
  ['Selección de sitios','Compara ubicaciones para inversión, expansión y desarrollo.',MapPin],
]
const solutionCards=[
  ['Community Pages','Páginas de ubicación para desarrollos, colonias y mercados.',Home],
  ['Lifestyle Search','Búsqueda por atributos, amenidades y características del entorno.',Search],
  ['Listing Experience','Inteligencia de ubicación integrada a fichas inmobiliarias.',Building2],
  ['Lead Capture','Convierte interés territorial en oportunidades comerciales.',Target],
  ['Neighborhood Reports','Reportes de zona listos para clientes y desarrolladores.',MapPin],
]
function ProductCard({title,text,Icon}){
  return <button className="ll-mega-card">
    <span><Icon size={17}/></span>
    <div><strong>{title}</strong><p>{text}</p></div>
  </button>
}

function PlatformMega(){
  const [section,setSection]=useState('data')
  const cards=section==='data'?dataCards:section==='solutions'?solutionCards:useCases
  const eyebrow=section==='data'?'DATOS':section==='solutions'?'SOLUCIONES':'CASOS DE USO'
  return <section className="ll-mega-wrap">
    <aside className="ll-mega-filters">
      <h3>Filtros</h3>
      <label><Search size={13}/><input placeholder="Buscar..."/></label>
      <div><span>Industria</span><button>Comercial</button><button>Otro</button><button>Residencial</button></div>
      <div><span>Solución</span><button className="select">Overview <ChevronDown size={11}/></button></div>
    </aside>
    <aside className="ll-mega-nav">
      <span>EXPLORA PLATAFORMA</span>
      <button className={section==='mcp'?'active':''} onClick={()=>setSection('mcp')}>MCP <em>NEW</em></button>
      <button className={section==='usecases'?'active':''} onClick={()=>setSection('usecases')}>Casos de uso</button>
      <button className={section==='solutions'?'active':''} onClick={()=>setSection('solutions')}>Soluciones</button>
      <button className={section==='data'?'active':''} onClick={()=>setSection('data')}>Datos</button>
      <button>Industrias <em>NEW</em></button>
    </aside>
    <div className="ll-mega-main">
      <header><span>{eyebrow}</span><button>Ver todo <ArrowRight size={12}/></button></header>
      <div className="ll-mega-grid">{cards.map(([t,d,I])=><ProductCard key={t} title={t} text={d} Icon={I}/>)}</div>
    </div>
    <aside className="ll-mega-ad">
      <div><small>GROWA</small><strong>Inteligencia de ubicación</strong><p>Datos territoriales para mejores decisiones inmobiliarias.</p><button>Conocer más</button></div>
    </aside>
  </section>
}

function Atlas({records}){
  const [query,setQuery]=useState('')
  const [scoreKey,setScoreKey]=useState('walk')
  const [market,setMarket]=useState('mazatlan')

  const ranked=useMemo(()=>{
    const all=Object.values(records||{}).filter(isCity).map(r=>{
      const id=String(r.cvegeo_ageb)
      const salt=scoreTabs.findIndex(x=>x.k===scoreKey)
      return {
        id,
        score:scoreFor(r,salt),
        pop:Number(r.pobtot||0),
        label:'AGEB '+id.slice(-4)
      }
    }).sort((a,b)=>b.score-a.score)
    return all.slice(0,10)
  },[records,scoreKey])

  const filtered=ranked.filter(x=>!query.trim() || x.id.includes(query.trim()) || x.label.toLowerCase().includes(query.trim().toLowerCase()))
  const tab=scoreTabs.find(x=>x.k===scoreKey)||scoreTabs[0]
  const TabIcon=tab.icon

  return <section className="ll-atlas-page">
    <div className="ll-hero">
      <div className="ll-city-map" aria-hidden="true">
        <span className="road r1"/><span className="road r2"/><span className="road r3"/><span className="road r4"/>
        <span className="road r5"/><span className="road r6"/><span className="road r7"/><span className="road r8"/>
        <span className="road r9"/><span className="road r10"/><span className="road r11"/><span className="road r12"/>
        <i className="block b1"/><i className="block b2"/><i className="block b3"/><i className="block b4"/><i className="block b5"/>
      </div>

      <div className="ll-hero-copy">
        <span className="ll-eyebrow">GROWA · LOCATION INTELLIGENCE</span>
        <h1>Insights Atlas</h1>
        <p>Obtén inteligencia de ubicación para cualquier dirección, colonia, AGEB o zona de Mazatlán.</p>

        <div className="ll-search-row">
          <label>
            <MapPin size={15}/>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Buscar una dirección, colonia, AGEB o zona"
            />
          </label>
          <button><Search size={14}/> Obtener insights</button>
        </div>
      </div>
    </div>

    <div className="ll-ranking">
      <div className="ll-ranking-top">
        <h2>Top 10 Zonas</h2>

        <div className="ll-country-toggle">
          <button className={market==='mazatlan'?'active':''} onClick={()=>setMarket('mazatlan')}>Mazatlán</button>
          <button className={market==='metro'?'active':''} onClick={()=>setMarket('metro')}>Mercado urbano</button>
        </div>

        <div className="ll-ranking-actions">
          <button className="ll-add">+ Añadir tu zona</button>
          <button className="ll-learn">Más información <ArrowRight size={11}/></button>
        </div>
      </div>

      <div className="ll-score-tabs">
        {scoreTabs.map(({k,label,icon:Icon})=><button
          key={k}
          className={scoreKey===k?'active':''}
          onClick={()=>setScoreKey(k)}
        ><Icon size={11}/>{label}</button>)}
      </div>

      <div className="ll-ranking-grid">
        {filtered.map((x,i)=><button className="ll-ranking-row" key={x.id}>
          <span className="rank">{i+1}</span>
          <div className="place">
            <strong>{x.label}</strong>
            <small>Mazatlán, Sinaloa</small>
          </div>
          <span className="metric"><TabIcon size={11}/>{tab.label}</span>
          <b>{fmt(x.score,1)}</b>
        </button>)}
      </div>

      {!filtered.length && <div className="ll-empty-search">No encontramos una zona con ese criterio.</div>}
    </div>
  </section>
}

export default function PropertyExplorer({records,mode='explorar'}){
  return <main className="ll-root">
    {mode==='platform'
      ? <><PlatformMega/><footer className="ll-footer-mini"><Database size={16}/><div><strong>Growa Location Intelligence</strong><span>Datos territoriales, mercado e inteligencia inmobiliaria.</span></div></footer></>
      : <Atlas records={records}/>}
  </main>
}
