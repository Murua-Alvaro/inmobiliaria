import React,{useEffect,useMemo,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Search,MapPin,Building2,Home,Store,Utensils,School,HeartPulse,Dumbbell,
  Hotel,Users,TrendingUp,Target,Clock3,Layers3,ChevronRight,X,ArrowLeft,
  Database,BarChart3,WalletCards,Route,Bookmark,Map as MapIcon
} from 'lucide-react'
import {getProperties,getPropertyDetail} from './apiClient'
import './propertyIntelligence.css'

const fmt=(v,d=0)=>Number.isFinite(Number(v))?Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'
const mxn=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v)):'—'
const pct=(v,d=1)=>Number.isFinite(Number(v))?fmt(v,d)+'%':'—'

function seed(id,salt=0){
  let h=2166136261
  for(const c of String(id)+':'+salt){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  return ((h>>>0)%10000)/10000
}

const ENV=[
  ['Restaurantes','dining',Utensils],['Supermercados','grocery',Store],['Salud','health',HeartPulse],
  ['Educación','schools',School],['Gimnasios','fitness',Dumbbell],['Turismo / hoteles','tourism',Hotel]
]
const radiusFactor={500:.48,1000:1,2000:2.35}
function demoEnvironment(property,radius){
  const id=property?.id||'demo'
  return ENV.map(([label,key,Icon],i)=>{
    const base=5+Math.round(seed(id,i+3)*34)
    const count=Math.max(1,Math.round(base*radiusFactor[radius]))
    const score=Math.round(55+seed(id,i+17)*40)
    const delta=Math.round((seed(id,i+28)*34)-10)
    return {label,key,Icon,count,score,delta}
  })
}

function PropertyMap({properties,selected,onSelect}){
  const node=useRef(null), mapRef=useRef(null), layerRef=useRef(null)
  useEffect(()=>{
    if(!node.current||mapRef.current)return
    const map=L.map(node.current,{zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,zoomControl:false}).setView([23.245,-106.425],11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map)
    L.control.zoom({position:'bottomright'}).addTo(map)
    mapRef.current=map
    return()=>{map.remove();mapRef.current=null}
  },[])
  useEffect(()=>{
    const map=mapRef.current
    if(!map||!properties.length)return
    let cancelled=false
    fetch('/data/ageb-geometry-2020.geojson').then(r=>r.json()).then(geo=>{
      if(cancelled)return
      layerRef.current?.remove()
      const byId=new Map(properties.map(p=>[String(p.location_id||''),p]))
      const features=(geo.features||[]).filter(ft=>byId.has(String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)))
      const layer=L.geoJSON({type:'FeatureCollection',features},{
        style:ft=>{
          const id=String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
          const p=byId.get(id), active=selected&&String(selected.location_id)===id
          const s=Number(p?.opportunity_score||0)
          return {color:active?'#0a3542':'#ffffff',weight:active?3:1,fillColor:s>=80?'#0d6f78':s>=65?'#70a7a8':'#bfd5d5',fillOpacity:active?.94:.74}
        },
        onEachFeature:(ft,layer)=>{
          const id=String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
          const p=byId.get(id); if(!p)return
          layer.bindTooltip(`<b>${p.title}</b><br/>${p.type} · Score ${p.opportunity_score}/100`,{sticky:true})
          layer.on('click',()=>onSelect(p))
        }
      }).addTo(map)
      layerRef.current=layer
      if(selected){
        const target=layer.getLayers().find(l=>String(l.feature?.properties?.cvegeo_ageb||l.feature?.properties?.CVEGEO||'').slice(0,13)===String(selected.location_id))
        if(target?.getBounds)map.fitBounds(target.getBounds(),{padding:[90,90],maxZoom:15})
      }else if(layer.getBounds().isValid())map.fitBounds(layer.getBounds(),{padding:[30,30],maxZoom:12})
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[properties,selected,onSelect])
  return <div className="pi-map" ref={node}/>
}

function MiniKpi({label,value,sub,Icon}){
  return <div className="pi-kpi"><span>{Icon&&<Icon size={15}/>} {label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>
}

function ProfileTag({children}){return <span className="pi-profile-tag">{children}</span>}

export default function PropertyIntelligence(){
  const [properties,setProperties]=useState([])
  const [selected,setSelected]=useState(null)
  const [detail,setDetail]=useState(null)
  const [query,setQuery]=useState('')
  const [tab,setTab]=useState('summary')
  const [radius,setRadius]=useState(1000)
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    let active=true
    getProperties(100,{sort:'score_desc'}).then(r=>{
      if(!active)return
      const rows=r.rows||[];setProperties(rows);setSelected(rows[0]||null)
    }).finally(()=>active&&setLoading(false))
    return()=>{active=false}
  },[])
  useEffect(()=>{
    if(!selected){setDetail(null);return}
    let active=true;setDetail(null);setTab('summary')
    getPropertyDetail(selected.id).then(r=>active&&setDetail(r)).catch(()=>{})
    return()=>{active=false}
  },[selected?.id])

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    if(!q)return properties
    return properties.filter(p=>(p.title+' '+p.type+' '+p.id+' '+p.location_id).toLowerCase().includes(q))
  },[properties,query])
  const env=useMemo(()=>demoEnvironment(selected,radius),[selected,radius])
  const loc=detail?.location||{}
  const bench=detail?.benchmarks||{}
  const market=detail?.market||{}
  const latest=market?.latest_month||{}
  const opportunity=Number(selected?.opportunity_score||0)
  const fit=Math.min(96,Math.max(54,Math.round((opportunity*.58)+(Number(loc.adult_share||55)*.18)+24)))
  const estimatedSale=Math.min(96,Math.max(42,Math.round(opportunity*.83+seed(selected?.id,44)*14)))

  return <div className="pi-app">
    <header className="pi-topbar">
      <div className="pi-brand"><button onClick={()=>location.hash='properties'} aria-label="Volver al portal"><ArrowLeft size={18}/></button><div><b>GROWA</b><span>PROPERTY INTELLIGENCE</span></div></div>
      <label className="pi-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar propiedad, tipo, identificador o zona"/>{query&&<button onClick={()=>setQuery('')}><X size={14}/></button>}</label>
      <div className="pi-city"><MapPin size={15}/> Mazatlán, Sinaloa</div>
      <button className="pi-save"><Bookmark size={15}/> Guardar búsqueda</button>
    </header>

    <div className="pi-demo-note"><Database size={14}/><span><b>DEMO DE PRODUCTO.</b> Propiedades/precios y los conteos de entorno son demostrativos; demografía y contexto territorial conservan la fuente disponible en la plataforma. Esta vista está preparada para sustituirlos por la base inmobiliaria y POI que se entregue.</span></div>

    <main className={'pi-shell '+(selected?'has-selection':'')}>
      <aside className="pi-list">
        <div className="pi-list-head"><div><strong>{filtered.length} propiedades</strong><span>Ordenadas por oportunidad</span></div><button><Layers3 size={15}/></button></div>
        <div className="pi-list-scroll">
          {loading?<div className="pi-loading">Cargando activos…</div>:filtered.map(p=><button key={p.id} className={'pi-property-row '+(selected?.id===p.id?'active':'')} onClick={()=>setSelected(p)}>
            <div className="pi-property-icon"><Building2 size={18}/></div>
            <div className="pi-property-copy"><small>{p.type} · AGEB {String(p.location_id).slice(-4)}</small><strong>{p.title}</strong><span>{fmt(p.area_m2)} m² · {mxn(p.price_m2)}/m²</span></div>
            <div className="pi-property-score"><b>{p.opportunity_score}</b><span>/100</span><ChevronRight size={14}/></div>
          </button>)}
        </div>
      </aside>

      <section className="pi-mapstage">
        <PropertyMap properties={filtered} selected={selected} onSelect={setSelected}/>
        <div className="pi-layer-chips"><button className="active"><Target size={13}/> Oportunidad</button><button><WalletCards size={13}/> Precio/m²</button><button><Users size={13}/> Demografía</button><button><Store size={13}/> Entorno</button></div>
        <div className="pi-map-legend"><span>Prioridad</span><i className="low"/><small>Baja</small><i className="mid"/><small>Media</small><i className="high"/><small>Alta</small></div>
      </section>

      {selected&&<aside className="pi-detail">
        <div className="pi-detail-title"><div><span>{selected.type} · {selected.id}</span><h1>{selected.title}</h1><small><MapPin size={12}/> Mazatlán · AGEB {String(selected.location_id).slice(-4)}</small></div><button onClick={()=>setSelected(null)}><X size={16}/></button></div>
        <div className="pi-hero-metrics">
          <MiniKpi label="Valor actual" value={mxn(selected.estimated_value)} sub="referencia demo" Home={Home}/>
          <MiniKpi label="Precio / m²" value={mxn(selected.price_m2)} />
          <MiniKpi label="Valor estimado" value={mxn(selected.estimated_value)} sub="modelo demo" />
          <MiniKpi label="Oportunidad" value={opportunity+'/100'} sub="score territorial" Target={Target}/>
          <MiniKpi label="Compatibilidad" value={fit+'/100'} sub="inmueble + zona" />
        </div>
        <div className="pi-tabs">
          {[['summary','Resumen'],['property','Propiedad'],['market','Mercado'],['environment','Entorno'],['demographics','Demografía'],['comparables','Comparables']].map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}
        </div>

        <div className="pi-detail-scroll">
          {tab==='summary'&&<>
            <section className="pi-card pi-commercial">
              <header><div><span>LECTURA COMERCIAL</span><h3>Señales para priorizar esta propiedad</h3></div><b className={opportunity>=80?'high':opportunity>=65?'mid':'low'}>{opportunity>=80?'Alta':opportunity>=65?'Media':'Exploratoria'}</b></header>
              <div className="pi-commercial-grid"><div><span>Probabilidad de venta</span><strong>{estimatedSale}%</strong><small>demo hasta contar con historial de operaciones</small></div><div><span>Perfil probable</span><strong>{fit>=82?'Profesionistas / inversión':'Hogar residencial'}</strong><small>lectura preliminar por contexto</small></div></div>
              <p>El objetivo final será explicar <b>por qué</b> una propiedad obtiene prioridad: historial de operaciones, liquidez, precio relativo, entorno y compatibilidad demográfica.</p>
            </section>
            <section className="pi-card"><header><div><span>POSICIÓN RELATIVA</span><h3>Cómo se ubica dentro del universo analizado</h3></div><BarChart3 size={18}/></header><div className="pi-bars">
              {[['Oportunidad',bench.score_percentile],['Precio / m²',bench.price_m2_percentile],['Superficie',bench.area_percentile],['Valor',bench.value_percentile]].map(([l,v])=><div key={l}><span>{l}</span><i><em style={{width:(Number(v)||0)+'%'}}/></i><b>{Number.isFinite(Number(v))?v+'º':'—'}</b></div>)}
            </div></section>
          </>}

          {tab==='property'&&<section className="pi-card"><header><div><span>FICHA DEL ACTIVO</span><h3>Información individual</h3></div><Building2 size={18}/></header><div className="pi-data-grid"><div><span>Tipo</span><b>{selected.type}</b></div><div><span>Superficie</span><b>{fmt(selected.area_m2)} m²</b></div><div><span>Precio / m²</span><b>{mxn(selected.price_m2)}</b></div><div><span>Valor de referencia</span><b>{mxn(selected.estimated_value)}</b></div><div><span>Historial de ventas</span><b>Pendiente de base</b></div><div><span>Historial de precio</span><b>Pendiente de base</b></div></div></section>}

          {tab==='market'&&<><section className="pi-card"><header><div><span>MERCADO</span><h3>Contexto disponible</h3></div><TrendingUp size={18}/></header><div className="pi-data-grid"><div><span>Financiamientos · último mes</span><b>{fmt(latest.actions)}</b></div><div><span>Monto · último mes</span><b>{mxn(latest.amount_mxn)}</b></div><div><span>Precio comparable</span><b>Pendiente de ventas</b></div><div><span>Tiempo de venta</span><b>Pendiente de historial</b></div><div><span>Inventario</span><b>Pendiente de cartera</b></div><div><span>Absorción</span><b>Pendiente de historial</b></div></div></section><section className="pi-card pi-next"><Clock3 size={18}/><div><b>Cuando llegue el historial de operaciones</b><p>Aquí calcularemos comparables, liquidez, tendencia de precio, días de mercado y probabilidad de venta por microzona.</p></div></section></>}

          {tab==='environment'&&<>
            <section className="pi-card"><header><div><span>ENTORNO</span><h3>Qué hay alrededor de la propiedad</h3></div><MapIcon size={18}/></header><div className="pi-radius">{[500,1000,2000].map(r=><button key={r} className={radius===r?'active':''} onClick={()=>setRadius(r)}>{r<1000?r+' m':r/1000+' km'}</button>)}</div><div className="pi-env-list">{env.map(({label,Icon,count,score,delta})=><div key={label}><span className="pi-env-icon"><Icon size={15}/></span><div><b>{label}</b><small>{count} puntos · demo</small></div><strong>{score}<small>/100</small></strong><em className={delta>=0?'up':'down'}>{delta>=0?'+':''}{delta}% vs zona</em></div>)}</div></section>
            <section className="pi-card pi-next"><Route size={18}/><div><b>Diseñado para fuente POI real</b><p>La estructura ya contempla radio, categoría, score y comparación contextual. Solo falta conectar el catálogo de comercios/servicios que definamos.</p></div></section>
          </>}

          {tab==='demographics'&&<><section className="pi-card"><header><div><span>DEMOGRAFÍA</span><h3>Compatibilidad del inmueble con su entorno</h3></div><Users size={18}/></header><div className="pi-data-grid"><div><span>Población</span><b>{fmt(loc.population)}</b></div><div><span>Hogares</span><b>{fmt(loc.households)}</b></div><div><span>Adultos</span><b>{pct(loc.adult_share)}</b></div><div><span>Movilidad reciente</span><b>{pct(loc.recent_mobility_share)}</b></div></div><div className="pi-fit"><div><span>Compatibilidad preliminar</span><strong>{fit}/100</strong></div><i><em style={{width:fit+'%'}}/></i><p>Después se sustituirá esta lectura preliminar por reglas/modelos que crucen tipología, tamaño, precio, historial de venta y perfil demográfico de la microzona.</p></div><div className="pi-tags"><ProfileTag>Hogares urbanos</ProfileTag><ProfileTag>Mercado residencial</ProfileTag><ProfileTag>Perfil por validar</ProfileTag></div></section></>}

          {tab==='comparables'&&<section className="pi-card"><header><div><span>COMPARABLES</span><h3>Propiedades y ventas semejantes</h3></div><Target size={18}/></header><div className="pi-empty"><Target size={24}/><b>Esperando historial inmobiliario</b><p>Los comparables se calcularán por distancia, tipología, superficie, precio/m², fecha de operación y condiciones de la microzona.</p></div></section>}
        </div>
      </aside>}
    </main>
  </div>
}
