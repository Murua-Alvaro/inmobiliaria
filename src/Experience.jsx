import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, MapPin, ChevronDown, Users, Home, Building2, TrendingUp, Layers3, Search, Menu, X, Database, Check, Compass, Bookmark, BarChart3, MoveUpRight } from 'lucide-react'
import { getOverview, getRankings } from './apiClient'

const number = value => value == null ? '—' : Number(value).toLocaleString('es-MX')
const navigate = (page) => { location.hash = page }
const products = [
  { title: 'Inteligencia de ubicación', text: 'Explora y compara el contexto de cada zona.', icon: MapPin, route: 'locations' },
  { title: 'Explorador de propiedades', text: 'Filtra activos y descubre su entorno.', icon: Building2, route: 'properties' },
  { title: 'Inteligencia de mercado', text: 'Lee las señales del mercado de vivienda.', icon: TrendingUp, route: 'market' },
  { title: 'Datos y metodología', text: 'Conoce las fuentes detrás de cada indicador.', icon: Database, route: 'platform' },
]

export function Brand() { return <a href="#home" className="gl-brand" aria-label="Growa Inmobiliario, inicio"><span className="gl-mark"><i/><i/><i/></span><span>GROWA<small>INTELIGENCIA INMOBILIARIA</small></span></a> }

export function SiteHeader({ page }) {
  const [open, setOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const node = useRef(null)
  const marketing = ['home','platform'].includes(page)
  useEffect(() => { setOpen(false); setMobile(false) }, [page])
  useEffect(() => {
    const close = e => { if (!node.current?.contains(e.target)) setOpen(false) }
    const escape = e => { if (e.key === 'Escape') { setOpen(false); setMobile(false) } }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [])
  return <>
    {marketing && <div className="gl-announcement"><span>Una nueva perspectiva del mercado inmobiliario de Mazatlán.</span><a href="#locations">Explorar datos <ArrowRight size={14}/></a></div>}
    <header className={'gl-header ' + (marketing ? 'marketing' : 'workspace')} ref={node}>
      <div className="gl-nav-wrap"><Brand/>
        <div className="gl-audience"><a href="#home" className={page==='home'?'selected':''}>Descubre</a><a href="#properties" className={page==='properties'?'selected':''}>Explora</a></div>
        <button className="gl-menu-toggle" aria-label={mobile?'Cerrar menú':'Abrir menú'} aria-expanded={mobile} onClick={()=>setMobile(!mobile)}>{mobile?<X/>:<Menu/>}</button>
        <nav className={mobile?'is-open':''} aria-label="Navegación principal">
          <div className="gl-menu-parent"><button onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="platform-menu">Plataforma <ChevronDown size={15} className={open?'turned':''}/></button>
            {open && <div className="gl-mega" id="platform-menu"><div className="gl-mega-intro"><span>LA PLATAFORMA GROWA</span><h3>Cada ubicación cuenta una historia.</h3><p>Encuentra los datos para entenderla.</p><a href="#platform">Conoce la plataforma <ArrowRight size={16}/></a></div><div className="gl-mega-links">{products.map(({title,text,icon:Icon,route})=><a key={route} href={'#'+route}><Icon size={22}/><span><strong>{title}</strong><small>{text}</small></span><ArrowUpRight size={16}/></a>)}</div></div>}
          </div>
          <a href="#locations" aria-current={page==='locations'?'page':undefined}>Ubicaciones</a>
          <a href="#market" aria-current={page==='market'?'page':undefined}>Mercado</a>
          <a href="#platform" aria-current={page==='platform'?'page':undefined}>Nuestros datos</a>
          <a className="gl-button" href="#properties">Explorar plataforma <ArrowUpRight size={17}/></a>
        </nav>
      </div>
    </header>
  </>
}

function ScorePanel({ row, compact=false }) {
  const metrics = row ? [['Población', number(row.population), Users],['Hogares',number(row.households),Home],['Score territorial',`${row.opportunity_score}/100`,BarChart3]] : [['Demografía','Por AGEB',Users],['Vivienda','Por zona',Home],['Mercado','Municipal',TrendingUp]]
  return <div className={'gl-score-panel '+(compact?'compact':'')}><span className="gl-panel-caption">CONTEXTO DE UBICACIÓN</span>{metrics.map(([label,value,Icon])=><div key={label}><Icon size={17}/><span>{label}</span><b>{value}</b></div>)}<small>{row?'INEGI 2020 · score derivado Growa':'Explora las fuentes en la plataforma'}</small></div>
}

const solutions = [
  { label:'Inteligencia de ubicación', title:'El entorno también es parte de la propiedad.', text:'Comprende quién vive alrededor, cómo se distribuyen los hogares y qué distingue a cada zona antes de elegir una ubicación.', action:'Explorar ubicaciones', route:'locations', icon:MapPin },
  { label:'Búsqueda de propiedades', title:'Encuentra un activo. Entiende su contexto.', text:'Cruza filtros de superficie, tipo de activo y precio de referencia con un perfil territorial. Explora el catálogo demostrativo en mapa o tabla.', action:'Explorar propiedades', route:'properties', icon:Building2 },
  { label:'Análisis de mercado', title:'Decisiones con perspectiva de mercado.', text:'Consulta el financiamiento de vivienda y sus cambios en el tiempo. Identifica la escala y el periodo de cada señal.', action:'Consultar el mercado', route:'market', icon:TrendingUp },
  { label:'Comparación de zonas', title:'La ubicación correcta empieza con una comparación.', text:'Contrasta hasta tres AGEB y evalúa población, hogares y movilidad con una misma base de información.', action:'Comparar ubicaciones', route:'locations', icon:Layers3 },
]
const categories = [
  { title:'Población y hogares', text:'Entiende la composición de la comunidad y la escala de su demanda residencial.', tags:['Población total','Hogares censales','Población adulta','Composición por sexo'], icon:Users },
  { title:'Vivienda y entorno residencial', text:'Consulta viviendas habitadas y ocupación promedio para caracterizar la estructura residencial de una zona.', tags:['Viviendas habitadas','Ocupantes por vivienda','Escala AGEB','Distritos CODESIN'], icon:Home },
  { title:'Movilidad y origen', text:'Explora la composición territorial de la población con indicadores censales de origen y residencia anterior.', tags:['Origen externo','Movilidad interestatal','Residencia en 2015'], icon:Compass },
]

export function Landing() {
  const [solution,setSolution]=useState(0)
  const [category,setCategory]=useState(0)
  const [overview,setOverview]=useState(null)
  const [rows,setRows]=useState([])
  const [failed,setFailed]=useState(false)
  useEffect(()=>{
    let active=true
    Promise.allSettled([getOverview(),getRankings('opportunity',3)]).then(([a,b])=>{
      if(!active)return
      if(a.status==='fulfilled')setOverview(a.value)
      if(b.status==='fulfilled')setRows(b.value.rows||[])
      setFailed(a.status==='rejected'&&b.status==='rejected')
    })
    return()=>{active=false}
  },[])
  const current=solutions[solution], Icon=current.icon, top=rows[0], coverage=overview?.coverage
  return <main tabIndex={-1} className="gl-landing" id="main-content">
    <section className="gl-hero gl-map-texture">
      <div className="gl-container gl-hero-grid">
        <div className="gl-hero-copy"><span className="gl-eyebrow"><span/> INTELIGENCIA LOCAL. MEJORES DECISIONES.</span><h1>Una propiedad.<br/>Todo un mundo<br/>a su alrededor.</h1><p>Descubre el contexto que hace única a cada ubicación. Conecta propiedades, personas y mercado con inteligencia territorial para Mazatlán.</p><div className="gl-actions"><a href="#properties" className="gl-button">Explorar la plataforma <ArrowRight size={18}/></a><a href="#locations" className="gl-text-link">Conocer las zonas <ArrowRight size={18}/></a></div><div className="gl-hero-note"><MapPin size={15}/><span>Mazatlán, Sinaloa</span><i/><span>Datos a escala local</span></div></div>
        <div className="gl-hero-visual">
          <div className="gl-orbit one"/><div className="gl-orbit two"/>
          <div className="gl-location-tag"><span><MapPin size={20}/></span><div><strong>Todo empieza con una ubicación</strong><small>Mazatlán · inteligencia territorial</small></div></div>
          <div className="gl-home-card"><div className="gl-home-image"><img src="/images/residence.webp" alt="Espacio residencial luminoso con materiales naturales" fetchPriority="high"/><span>VISUALIZACIÓN DEL PRODUCTO</span></div><div className="gl-home-info"><div><span>LA PROPIEDAD Y SU ENTORNO</span><h3>Conoce su entorno.</h3><p>Una perspectiva completa de cada zona.</p></div><button onClick={()=>navigate('properties')} aria-label="Explorar propiedades"><ArrowUpRight size={22}/></button></div></div>
          <div className="gl-hero-scores"><ScorePanel row={top}/></div>
          <div className="gl-floating-chip"><Layers3 size={17}/><span>Datos que dan contexto</span><Check size={15}/></div>
        </div>
      </div>
    </section>
    <section className="gl-sources gl-container"><span>UNA VISIÓN TERRITORIAL CON FUENTES IDENTIFICABLES</span><div><strong>INEGI <small>Población y vivienda</small></strong><strong>CODESIN <small>Distritos territoriales</small></strong><strong>SNIIV <small>Financiamiento</small></strong><strong className="growa-source">GROWA <small>Análisis de ubicación</small></strong></div></section>
    <section className="gl-solutions gl-section"><div className="gl-container"><div className="gl-section-heading"><span className="gl-eyebrow">DE LA UBICACIÓN A LA DECISIÓN</span><h2>El contexto cambia<br/>la forma de ver una propiedad.</h2><p>Un espacio para explorar, comparar y entender el mercado inmobiliario.</p></div>
      <div className="gl-tabs" role="tablist" aria-label="Soluciones">{solutions.map((s,i)=><button role="tab" id={'solution-tab-'+i} aria-controls="solution-panel" aria-selected={solution===i} tabIndex={solution===i?0:-1} className={solution===i?'active':''} key={s.label} onClick={()=>setSolution(i)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=(i+(e.key==='ArrowRight'?1:-1)+solutions.length)%solutions.length;setSolution(next);document.getElementById('solution-tab-'+next)?.focus()}}}>{s.label}</button>)}</div>
      <div className="gl-solution-panel" id="solution-panel" role="tabpanel" aria-labelledby={'solution-tab-'+solution}><img src={solution===1?'/images/residence.webp':'/images/neighborhood.webp'} alt="Arquitectura y entorno urbano, fotografía ilustrativa" loading="lazy"/><div className="gl-solution-shade"/><div className="gl-solution-copy" key={solution}><Icon size={30}/><h3>{current.title}</h3><p>{current.text}</p><a href={'#'+current.route} className="gl-button">{current.action} <ArrowRight size={17}/></a></div><div className="gl-solution-widget"><div className="gl-widget-heading"><MapPin size={17}/><span>{top?'AGEB '+top.id.slice(-4):'Perfil territorial'} · Mazatlán</span></div><h3>{solution===2?'Señales de mercado':'Una zona, múltiples perspectivas'}</h3><ScorePanel row={top} compact/><a href={top?'#location/'+top.id:'#locations'}>Abrir perfil de ubicación <ArrowUpRight size={16}/></a></div></div>
    </div></section>
    <section className="gl-data gl-map-texture gl-section"><div className="gl-container gl-two-col"><div><span className="gl-eyebrow">NUESTROS DATOS</span><h2>La información local<br/>hace la diferencia.</h2><p>Cada ubicación forma parte de una comunidad. Analiza su población, vivienda y dinámica territorial con indicadores comparables y fuentes identificables.</p><p>De la escala municipal al detalle de una AGEB: encuentra la perspectiva adecuada para tu próxima decisión.</p><a href="#platform" className="gl-button">Conoce nuestros datos <ArrowRight size={18}/></a></div><div className="gl-data-visual"><div className="gl-data-center"><span className="gl-mark"><i/><i/><i/></span><strong>Contexto<br/>que conecta.</strong></div>{[['Población',Users],['Vivienda',Home],['Movilidad',Compass],['Distritos',Layers3],['Financiamiento',TrendingUp],['Propiedades',Building2]].map(([s,I],i)=><a href={i===4?'#market':'#locations'} className={'gl-data-tag tag-'+i} key={s}><I size={19}/>{s}</a>)}</div></div>
      <div className="gl-container gl-coverage"><div><strong>{number(coverage?.locations)}</strong><span>AGEB con perfil territorial</span></div><div><strong>{number(coverage?.districts)}</strong><span>Distritos para explorar</span></div><div><strong>{number(coverage?.population)}</strong><span>Habitantes en las zonas cubiertas</span></div><div><strong>{number(coverage?.households)}</strong><span>Hogares censales</span></div></div>{failed&&<p className="gl-load-note">Los indicadores no están disponibles en este momento. Puedes volver a intentar desde el explorador.</p>}
    </section>
    <section className="gl-section gl-community gl-container"><div className="gl-section-heading"><span className="gl-eyebrow">DEMOGRAFÍA Y COMUNIDAD</span><h2>Entiende a las personas.<br/>Descubre el potencial del lugar.</h2></div><div className="gl-two-col"><div><h3>Una lectura más completa de cada zona.</h3><p>Explora las dimensiones que ayudan a caracterizar su contexto residencial.</p><div className="gl-accordions">{categories.map((c,i)=><div className={category===i?'open':''} key={c.title}><button aria-expanded={category===i} aria-controls={'category-'+i} onClick={()=>setCategory(category===i?-1:i)}>{c.title}<ChevronDown size={20}/></button><div id={'category-'+i} hidden={category!==i}><p>{c.text}</p><div className="gl-tags">{c.tags.map(t=><span key={t}>{t}</span>)}</div></div></div>)}</div><a href="#locations" className="gl-button">Explorar demografía <ArrowRight size={18}/></a></div><div className="gl-community-visual"><img src="/images/neighborhood.webp" alt="Entorno urbano con edificios y calles" loading="lazy"/><div className="gl-demography-card"><span><Users size={16}/> PERFIL DE COMUNIDAD</span><h3>{top?'AGEB '+top.id.slice(-4):'Demografía local'}</h3><div className="gl-demo-pills"><b>Población</b><span>Vivienda</span><span>Hogares</span></div><div className="gl-demo-stats"><div><small>Habitantes</small><strong>{number(top?.population)}</strong></div><div><small>Hogares</small><strong>{number(top?.households)}</strong></div></div>{top&&[['Población adulta',top.adult_share],['Movilidad interestatal',top.recent_mobility_share]].map(([s,v])=><div className="gl-mini-bar" key={s}><span>{s}<b>{v==null?'—':Number(v).toFixed(1)+'%'}</b></span><i><em style={{width:Math.max(0,Math.min(100,v||0))+'%'}}/></i></div>)}<small>INEGI · Censo de Población y Vivienda 2020</small></div></div></div></section>
    <section className="gl-section gl-discover"><div className="gl-container"><div className="gl-discover-head"><div><span className="gl-eyebrow">EXPLORA MAZATLÁN</span><h2>Tu siguiente análisis<br/>empieza aquí.</h2></div><a href="#locations" className="gl-text-link">Ver todas las ubicaciones <ArrowRight size={18}/></a></div><div className="gl-zone-grid">{rows.length?rows.map((r,i)=><a href={'#location/'+r.id} key={r.id} className="gl-zone"><div className={'gl-zone-map zone-'+i}><span><MapPin size={14}/> MAZATLÁN</span><div><MapPin size={30}/></div><b>{r.opportunity_score}<small>/100</small></b></div><div className="gl-zone-body"><small>PERFIL TERRITORIAL · INEGI 2020</small><h3>AGEB {r.id.slice(-4)} <ArrowUpRight size={20}/></h3><div><span><Users size={15}/>{number(r.population)} habitantes</span><span><Home size={15}/>{number(r.households)} hogares</span></div><p>Score demográfico derivado · no es un avalúo.</p></div></a>):products.slice(0,3).map(({title,text,icon:I,route})=><a className="gl-zone gl-zone-empty" href={'#'+route} key={route}><I size={30}/><h3>{title}</h3><p>{text}</p><ArrowRight/></a>)}</div></div></section>
    <section className="gl-bottom-cta gl-container"><div><span className="gl-eyebrow">UNA MEJOR PERSPECTIVA</span><h2>Conoce el lugar.<br/>Encuentra la oportunidad.</h2><p>Empieza a explorar el territorio con Growa.</p></div><a href="#properties" className="gl-button">Abrir el explorador <ArrowUpRight size={20}/></a></section>
  </main>
}

export function SiteFooter() {
  return <footer className="gl-footer"><div className="gl-container"><div className="gl-footer-grid"><div><Brand/><p>El contexto detrás<br/>de cada ubicación.</p><span>Mazatlán, Sinaloa · México</span></div><div><strong>Plataforma</strong><a href="#locations">Explorar ubicaciones</a><a href="#properties">Propiedades</a><a href="#market">Inteligencia de mercado</a></div><div><strong>Información</strong><a href="#platform">Datos y metodología</a><a href="#locations">Perfiles territoriales</a><a href="#home">Inicio</a></div><div className="gl-footer-note"><Database size={23}/><strong>Información con contexto</strong><p>Datos observados, indicadores derivados y propiedades de demostración identificados por separado.</p></div></div><div className="gl-footer-bottom"><span>© {new Date().getFullYear()} Growa Inmobiliario</span><span>Inteligencia territorial para mejores decisiones.</span></div></div></footer>
}

export function DataPlatform(){
  const [overview,setOverview]=useState(null)
  const [tab,setTab]=useState('population')
  const [error,setError]=useState(false)
  useEffect(()=>{let active=true;getOverview().then(r=>{if(active)setOverview(r)}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[])
  const c=overview?.coverage||{},r=overview?.top_locations?.[0]
  const definitions={population:{title:'Población y comunidad',description:'Caracteriza a las personas que habitan una zona y la composición de sus hogares.',metrics:[['Población',number(r?.population)],['Población adulta',r?.adult_share==null?'—':Number(r.adult_share).toFixed(1)+'%'],['Hogares',number(r?.households)]]},housing:{title:'Estructura residencial',description:'Consulta el contexto de vivienda habitada a la escala de cada AGEB urbana.',metrics:[['Viviendas habitadas',number(r?.occupied_housing)],['Hogares',number(r?.households)],['Ocupantes / vivienda',r?.household_size==null?'—':Number(r.household_size).toFixed(1)]]},mobility:{title:'Origen y movilidad',description:'Lee los indicadores censales de origen y residencia anterior dentro de su periodo de referencia.',metrics:[['Movilidad interestatal',r?.recent_mobility_share==null?'—':Number(r.recent_mobility_share).toFixed(1)+'%'],['Nacidos en otra entidad',r?.external_origin_share==null?'—':Number(r.external_origin_share).toFixed(1)+'%'],['Periodo base','2020']]}}
  const selected=definitions[tab]
  return <main className="gl-landing gl-data-page" tabIndex={-1}>
    <section className="gl-container gl-data-page-hero gl-two-col"><div><span className="gl-feature-icon"><Users size={28}/></span><span className="gl-eyebrow">INTELIGENCIA DEMOGRÁFICA</span><h1>Los datos detrás<br/>de cada comunidad.</h1><p>Conoce la población, los hogares y la vivienda alrededor de una ubicación. Información territorial para dar contexto a tus decisiones inmobiliarias.</p><div className="gl-actions"><a href="#locations" className="gl-button">Explorar demografía <ArrowRight size={17}/></a><a href="#market" className="gl-text-link">Ver mercado <ArrowUpRight size={17}/></a></div></div><div className="gl-dataset-photo"><img src="/images/neighborhood.webp" alt="Perspectiva de una calle urbana, imagen ilustrativa"/><div className="gl-dataset-overlay"><div><Users size={20}/><small>Población cubierta</small><strong>{number(c.population)}</strong></div><div><Home size={20}/><small>Hogares censales</small><strong>{number(c.households)}</strong></div><div><Layers3 size={20}/><small>Perfiles de AGEB</small><strong>{number(c.locations)}</strong></div></div></div></section>
    <section className="gl-container gl-section gl-data-preview"><div className="gl-section-heading"><span className="gl-eyebrow">EXPLORA LAS DIMENSIONES</span><h2>Del dato a una visión<br/>más completa del territorio.</h2></div><div className="gl-preview-stage gl-map-texture"><div className="gl-preview-card"><div className="gl-widget-heading"><MapPin size={16}/>{r?'AGEB '+r.id.slice(-4):'Perfil territorial'} · Mazatlán, Sinaloa</div><h3>Demografía local</h3><div className="gl-tabs" role="tablist" aria-label="Dimensiones demográficas">{[['population','Población'],['housing','Vivienda'],['mobility','Movilidad']].map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}</div><div role="tabpanel"><h4>{selected.title}</h4><p>{selected.description}</p><div className="gl-preview-metrics">{selected.metrics.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="gl-preview-source"><span>INEGI · Censo 2020</span><a href={r?'#location/'+r.id:'#locations'}>Ver perfil completo <ArrowUpRight size={15}/></a></div></div></div><span className="gl-preview-badge"><Database size={20}/> Datos con contexto y fuente</span></div>{error&&<p role="status">No fue posible cargar los indicadores. Vuelve a abrir esta sección para reintentar.</p>}</section>
    <section className="gl-section gl-source-section"><div className="gl-container"><div className="gl-discover-head"><div><span className="gl-eyebrow">TRAZABILIDAD</span><h2>Una fuente identificable.<br/>Una escala definida.</h2></div><p>Cada indicador conserva<br/>su origen y su periodo de referencia.</p></div><div className="gl-source-table" role="table" aria-label="Fuentes de información"><div role="row" className="gl-source-row table-head"><span>Fuente</span><span>Escala</span><span>Contenido</span><span>Naturaleza</span></div>{[['INEGI · Censo 2020','AGEB urbana','Población, hogares y vivienda','Observado'],['CODESIN','Distrito','Delimitación territorial','Observado'],['SNIIV / SEDATU','Municipio','Financiamiento de vivienda','Observado'],['Growa','AGEB / distrito','Score territorial y agregados','Derivado'],['Catálogo demostrativo','Activo','Superficie y precio de referencia','Simulado']].map(row=><div className="gl-source-row" role="row" key={row[0]}>{row.map((v,i)=><span role="cell" key={v} className={i===3?'data-kind '+v.toLowerCase():''}>{v}</span>)}</div>)}</div><div className="gl-method-note"><Database size={20}/><p>El score territorial es un indicador demográfico descriptivo. No representa un avalúo, una rentabilidad esperada ni una predicción de ventas. Las propiedades del catálogo son demostrativas.</p></div></div></section>
    <section className="gl-section gl-container"><div className="gl-section-heading"><span className="gl-eyebrow">UN FLUJO DE ANÁLISIS CONECTADO</span><h2>Encuentra tu siguiente perspectiva.</h2></div><div className="gl-product-grid">{products.slice(0,3).map(({title,text,icon:I,route})=><a key={route} href={'#'+route}><span className="gl-feature-icon"><I size={24}/></span><h3>{title}</h3><p>{text}</p><span>Explorar <ArrowRight size={17}/></span></a>)}</div></section>
  </main>
}
