import React,{useEffect,useMemo,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Search,MapPin,Building2,Home,Store,Utensils,School,HeartPulse,Dumbbell,Hotel,
  Users,TrendingUp,Target,Clock3,Layers3,ChevronRight,X,ArrowLeft,Database,
  BarChart3,WalletCards,Route,Bookmark,Map as MapIcon,SlidersHorizontal,
  Sparkles,CheckCircle2,AlertCircle,BriefcaseBusiness,Eye,Landmark,ChevronDown
} from 'lucide-react'
import {getProperties,getPropertyDetail} from './apiClient'
import './propertyIntelligence.css'

const fmt=(v,d=0)=>Number.isFinite(Number(v))?Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'
const mxn=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v)):'—'
const pct=(v,d=1)=>Number.isFinite(Number(v))?fmt(v,d)+'%':'—'
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))

function seed(id,salt=0){
  let h=2166136261
  for(const c of String(id)+':'+salt){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  return ((h>>>0)%10000)/10000
}

const ENV=[
  ['Restaurantes','dining',Utensils],['Supermercados','grocery',Store],['Salud','health',HeartPulse],
  ['Educación','schools',School],['Gimnasios','fitness',Dumbbell],['Turismo / hoteles','tourism',Hotel]
]
const ENV_LABELS=Object.fromEntries(ENV.map(([label,key])=>[key,label]))
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

function propertyPoint(bounds,property,index=0){
  const c=bounds.getCenter(), sw=bounds.getSouthWest(), ne=bounds.getNorthEast()
  const latSpan=Math.max(.00035,ne.lat-sw.lat), lngSpan=Math.max(.00035,ne.lng-sw.lng)
  const a=seed(property.id,80+index)*Math.PI*2
  const r=.08+.12*seed(property.id,90+index)
  return L.latLng(c.lat+Math.sin(a)*latSpan*r,c.lng+Math.cos(a)*lngSpan*r)
}

function poiPoints(center,property,radius,env,activeCategories){
  const rows=[]
  env.filter(x=>activeCategories.includes(x.key)).forEach((item,catIndex)=>{
    const n=Math.min(5,Math.max(2,Math.round(item.count/8)))
    for(let i=0;i<n;i++){
      const angle=seed(property.id,200+catIndex*20+i)*Math.PI*2
      const distance=(.22+.70*seed(property.id,300+catIndex*20+i))*radius
      const dLat=(distance/111000)*Math.sin(angle)
      const dLng=(distance/(111000*Math.cos(center.lat*Math.PI/180)))*Math.cos(angle)
      rows.push({key:item.key,label:item.label,lat:center.lat+dLat,lng:center.lng+dLng,index:i})
    }
  })
  return rows
}

function PropertyMap({properties,selected,onSelect,radius,mapMode,env,activeCategories}){
  const node=useRef(null), mapRef=useRef(null), baseRef=useRef(null), marksRef=useRef(null)
  const [geo,setGeo]=useState(null)

  useEffect(()=>{
    if(!node.current||mapRef.current)return
    const map=L.map(node.current,{zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,zoomControl:false,minZoom:10,maxZoom:18}).setView([23.245,-106.425],11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map)
    L.control.zoom({position:'bottomright'}).addTo(map)
    mapRef.current=map
    return()=>{map.remove();mapRef.current=null}
  },[])

  useEffect(()=>{let active=true;fetch('/data/ageb-geometry-2020.geojson').then(r=>r.json()).then(g=>active&&setGeo(g)).catch(()=>{});return()=>{active=false}},[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!geo||!properties.length)return
    baseRef.current?.remove();marksRef.current?.remove()

    const byId=new Map()
    properties.forEach(p=>{
      const id=String(p.location_id||'')
      if(!byId.has(id))byId.set(id,[])
      byId.get(id).push(p)
    })
    const features=(geo.features||[]).filter(ft=>byId.has(String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)))
    const prices=properties.map(p=>Number(p.price_m2)).filter(Number.isFinite).sort((a,b)=>a-b)
    const p20=prices[Math.floor(prices.length*.2)]||0,p80=prices[Math.floor(prices.length*.8)]||1

    const polygonLayer=L.geoJSON({type:'FeatureCollection',features},{
      style:ft=>{
        const id=String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
        const group=byId.get(id)||[]
        const active=selected&&String(selected.location_id)===id
        const score=Math.max(...group.map(p=>Number(p.opportunity_score)||0),0)
        const price=group.length?group.reduce((s,p)=>s+(Number(p.price_m2)||0),0)/group.length:0
        const t=clamp((price-p20)/(p80-p20||1),0,1)
        let fill='#dfe8e8',opacity=.42
        if(mapMode==='opportunity'){fill=score>=80?'#0d6f78':score>=65?'#76aeb0':'#c3d8d8';opacity=.58}
        if(mapMode==='price'){fill=t>.66?'#765f98':t>.33?'#a79bc0':'#d8d2e5';opacity=.56}
        if(mapMode==='environment'){fill=active?'#cfe8e2':'#eef3f2';opacity=active?.55:.24}
        return {color:active?'#0b3e47':'#ffffff',weight:active?2.4:.8,fillColor:fill,fillOpacity:opacity}
      },
      onEachFeature:(ft,layer)=>{
        const id=String(ft.properties?.cvegeo_ageb||ft.properties?.CVEGEO||'').slice(0,13)
        const group=byId.get(id)||[]
        if(!group.length)return
        const best=[...group].sort((a,b)=>Number(b.opportunity_score)-Number(a.opportunity_score))[0]
        layer.bindTooltip(`<div class="pi-map-tip"><small>MICROZONA · ${id.slice(-4)}</small><b>${group.length} activo${group.length===1?'':'s'}</b><span>Mejor score ${best.opportunity_score}/100</span></div>`,{sticky:true})
      }
    }).addTo(map)
    baseRef.current=polygonLayer

    const group=L.layerGroup().addTo(map)
    marksRef.current=group
    const centers=new Map()
    polygonLayer.eachLayer((poly,index)=>{
      const id=String(poly.feature?.properties?.cvegeo_ageb||poly.feature?.properties?.CVEGEO||'').slice(0,13)
      const props=byId.get(id)||[]
      if(!poly.getBounds||!props.length)return
      props.forEach((p,i)=>{
        const point=propertyPoint(poly.getBounds(),p,i)
        centers.set(p.id,point)
        const isSelected=selected?.id===p.id
        const marker=L.circleMarker(point,{radius:isSelected?9:6,color:isSelected?'#ffffff':'#0a4f59',weight:isSelected?3:2,fillColor:isSelected?'#c08a2e':'#0b6670',fillOpacity:1})
          .bindTooltip(`<div class="pi-map-tip"><small>${p.type}</small><b>${p.title}</b><span>${mxn(p.price_m2)}/m² · score ${p.opportunity_score}</span></div>`,{direction:'top',offset:[0,-7]})
          .on('click',()=>onSelect(p)).addTo(group)
        if(isSelected)marker.openTooltip()
      })
    })

    if(selected&&centers.has(selected.id)){
      const center=centers.get(selected.id)
      L.circle(center,{radius,color:'#0b6670',weight:2,dashArray:'7 7',fillColor:'#2c8a90',fillOpacity:.08,interactive:false}).addTo(group)
      L.circleMarker(center,{radius:15,color:'#0b6670',weight:1,fillOpacity:0,opacity:.28,interactive:false}).addTo(group)
      if(mapMode==='environment'){
        poiPoints(center,selected,radius,env,activeCategories).forEach(p=>{
          const icon=L.divIcon({className:`pi-poi-icon pi-poi-${p.key}`,html:'<span></span>',iconSize:[14,14],iconAnchor:[7,7]})
          L.marker([p.lat,p.lng],{icon}).bindTooltip(`<b>${p.label}</b><br/><small>Punto demostrativo</small>`,{direction:'top'}).addTo(group)
        })
      }
      map.setView(center,radius===500?15:radius===1000?14:13,{animate:false})
    }else if(polygonLayer.getBounds().isValid()) map.fitBounds(polygonLayer.getBounds(),{padding:[24,24],maxZoom:12})
  },[geo,properties,selected,onSelect,radius,mapMode,env,activeCategories])

  return <div className="pi-map" ref={node}/>
}

function MiniKpi({label,value,sub,Icon}){
  return <div className="pi-kpi"><span>{Icon&&<Icon size={13}/>} {label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>
}
function ProfileTag({children}){return <span className="pi-profile-tag">{children}</span>}
function ScoreRing({value,label}){return <div className="pi-score-ring" style={{'--score':`${clamp(Number(value)||0,0,100)*3.6}deg`}}><div><b>{fmt(value)}</b><span>/100</span></div><small>{label}</small></div>}
function DataBadge({kind,children}){return <span className={`pi-data-badge ${kind}`}>{kind==='real'?<CheckCircle2 size={11}/>:kind==='pending'?<AlertCircle size={11}/>:<Sparkles size={11}/>} {children}</span>}

export default function PropertyIntelligence(){
  const [properties,setProperties]=useState([])
  const [selected,setSelected]=useState(null)
  const [detail,setDetail]=useState(null)
  const [query,setQuery]=useState('')
  const [tab,setTab]=useState('summary')
  const [radius,setRadius]=useState(1000)
  const [loading,setLoading]=useState(true)
  const [assetType,setAssetType]=useState('Todos')
  const [minScore,setMinScore]=useState(0)
  const [mapMode,setMapMode]=useState('opportunity')
  const [activeCategories,setActiveCategories]=useState(ENV.map(x=>x[1]))

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

  const types=useMemo(()=>['Todos',...Array.from(new Set(properties.map(p=>p.type).filter(Boolean)))],[properties])
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return properties.filter(p=>(assetType==='Todos'||p.type===assetType)&&Number(p.opportunity_score||0)>=minScore&&(!q||(p.title+' '+p.type+' '+p.id+' '+p.location_id).toLowerCase().includes(q)))
  },[properties,query,assetType,minScore])
  const env=useMemo(()=>demoEnvironment(selected,radius),[selected,radius])
  const loc=detail?.location||{}
  const bench=detail?.benchmarks||{}
  const market=detail?.market||{}
  const latest=market?.latest_month||{}
  const opportunity=Number(selected?.opportunity_score||0)
  const fit=clamp(Math.round((opportunity*.58)+(Number(loc.adult_share||55)*.18)+24),54,96)
  const estimatedSale=clamp(Math.round(opportunity*.83+seed(selected?.id,44)*14),42,96)
  const liquidity=clamp(Math.round(opportunity*.72+seed(selected?.id,50)*18),40,95)
  const demand=clamp(Math.round((fit+opportunity)/2+seed(selected?.id,55)*7),45,96)
  const profile=fit>=84?'Profesionistas / inversión':fit>=74?'Parejas y hogares pequeños':'Hogar residencial'
  const topEnv=[...env].sort((a,b)=>b.score-a.score).slice(0,3)
  const provisionalComparables=useMemo(()=>{
    if(!selected)return []
    return properties.filter(p=>p.id!==selected.id&&p.type===selected.type).map(p=>({
      ...p,
      distance:Math.abs(Number(p.area_m2)-Number(selected.area_m2))/(Number(selected.area_m2)||1)+Math.abs(Number(p.price_m2)-Number(selected.price_m2))/(Number(selected.price_m2)||1)
    })).sort((a,b)=>a.distance-b.distance).slice(0,3)
  },[properties,selected])

  const setSection=(next)=>{
    setTab(next)
    if(next==='environment')setMapMode('environment')
    else if(next==='market')setMapMode('price')
  }
  const toggleCategory=key=>setActiveCategories(prev=>prev.includes(key)?prev.filter(k=>k!==key):[...prev,key])

  return <div className="pi-app">
    <header className="pi-topbar">
      <div className="pi-brand"><button onClick={()=>location.hash='properties'} aria-label="Volver al portal"><ArrowLeft size={18}/></button><div><b>GROWA</b><span>PROPERTY INTELLIGENCE</span></div></div>
      <label className="pi-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar propiedad, tipo, identificador o zona"/>{query&&<button onClick={()=>setQuery('')}><X size={14}/></button>}</label>
      <div className="pi-city"><MapPin size={15}/> Mazatlán, Sinaloa</div>
      <button className="pi-save"><Bookmark size={15}/> Guardar análisis</button>
    </header>

    <div className="pi-data-strip">
      <DataBadge kind="real">Contexto territorial</DataBadge><DataBadge kind="demo">Activos y precios demo</DataBadge><DataBadge kind="pending">Ventas / POI por conectar</DataBadge>
      <span>La interfaz separa dato observado, demostrativo y pendiente para no mezclar evidencia.</span>
    </div>

    <main className={'pi-shell '+(selected?'has-selection':'')}>
      <aside className="pi-list">
        <div className="pi-list-head"><div><strong>Universo de propiedades</strong><span>{filtered.length} de {properties.length} activos visibles</span></div><button title="Filtros"><SlidersHorizontal size={15}/></button></div>
        <div className="pi-quickfilters">
          <label><span>Tipo</span><select value={assetType} onChange={e=>setAssetType(e.target.value)}>{types.map(t=><option key={t}>{t}</option>)}</select><ChevronDown size={12}/></label>
          <div><span>Score mínimo</span><div>{[0,65,75,85].map(v=><button key={v} className={minScore===v?'active':''} onClick={()=>setMinScore(v)}>{v?v+'+':'Todos'}</button>)}</div></div>
        </div>
        <div className="pi-list-scroll">
          {loading?<div className="pi-loading">Cargando activos…</div>:filtered.map(p=><button key={p.id} className={'pi-property-row '+(selected?.id===p.id?'active':'')} onClick={()=>setSelected(p)}>
            <div className="pi-property-icon"><Building2 size={18}/></div>
            <div className="pi-property-copy"><small>{p.type} · microzona {String(p.location_id).slice(-4)}</small><strong>{p.title}</strong><span>{fmt(p.area_m2)} m² · {mxn(p.price_m2)}/m²</span></div>
            <div className="pi-property-score"><b>{p.opportunity_score}</b><span>/100</span><ChevronRight size={14}/></div>
          </button>)}
          {!loading&&!filtered.length&&<div className="pi-empty-list"><Search size={20}/><b>Sin resultados</b><span>Ajusta filtros o búsqueda.</span></div>}
        </div>
      </aside>

      <section className="pi-mapstage">
        <PropertyMap properties={filtered} selected={selected} onSelect={setSelected} radius={radius} mapMode={mapMode} env={env} activeCategories={activeCategories}/>
        <div className="pi-map-modes">
          <button className={mapMode==='opportunity'?'active':''} onClick={()=>setMapMode('opportunity')}><Target size={13}/> Oportunidad</button>
          <button className={mapMode==='price'?'active':''} onClick={()=>setMapMode('price')}><WalletCards size={13}/> Precio/m²</button>
          <button className={mapMode==='environment'?'active':''} onClick={()=>{setMapMode('environment');setTab('environment')}}><Store size={13}/> Entorno</button>
        </div>
        {selected&&<div className="pi-map-radius"><span>Radio de análisis</span>{[500,1000,2000].map(r=><button key={r} className={radius===r?'active':''} onClick={()=>setRadius(r)}>{r<1000?r+' m':r/1000+' km'}</button>)}</div>}
        {mapMode==='environment'&&selected&&<div className="pi-poi-filter"><header><b>Mostrar en mapa</b><span>{activeCategories.length}/{ENV.length}</span></header>{ENV.map(([label,key,Icon])=><button key={key} className={activeCategories.includes(key)?'active':''} onClick={()=>toggleCategory(key)}><Icon size={13}/>{label}</button>)}</div>}
        <div className="pi-map-legend"><span>{mapMode==='price'?'Precio relativo':mapMode==='environment'?'Contexto territorial':'Prioridad'}</span><i className="low"/><small>Bajo</small><i className="mid"/><small>Medio</small><i className="high"/><small>Alto</small></div>
      </section>

      {selected&&<aside className="pi-detail">
        <div className="pi-detail-title"><div><span>{selected.type} · {selected.id}</span><h1>{selected.title}</h1><small><MapPin size={12}/> Mazatlán · microzona {String(selected.location_id).slice(-4)}</small></div><button onClick={()=>setSelected(null)}><X size={16}/></button></div>

        <div className="pi-intel-head">
          <ScoreRing value={opportunity} label="Oportunidad"/>
          <div className="pi-intel-copy"><span className={opportunity>=80?'high':opportunity>=65?'mid':'low'}>{opportunity>=80?'PRIORIDAD ALTA':opportunity>=65?'PRIORIDAD MEDIA':'EXPLORAR'}</span><h2>{opportunity>=80?'Activo con señales favorables para prospección':opportunity>=65?'Activo competitivo dentro de su microzona':'Activo que requiere mayor validación'}</h2><p>La lectura combina la posición del activo con su contexto territorial. Cuando llegue el historial inmobiliario, se añadirá liquidez observada y comportamiento de ventas.</p></div>
        </div>

        <div className="pi-hero-metrics">
          <MiniKpi label="Valor referencia" value={mxn(selected.estimated_value)} sub="demo" Icon={Home}/>
          <MiniKpi label="Precio / m²" value={mxn(selected.price_m2)} sub="demo" Icon={WalletCards}/>
          <MiniKpi label="Compatibilidad" value={fit+'/100'} sub="inmueble + zona" Icon={Users}/>
          <MiniKpi label="Liquidez" value={liquidity+'/100'} sub="proxy demo" Icon={TrendingUp}/>
        </div>

        <div className="pi-tabs">
          {[['summary','Resumen'],['property','Propiedad'],['market','Mercado'],['environment','Entorno'],['demographics','Demografía'],['comparables','Comparables']].map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setSection(k)}>{l}</button>)}
        </div>

        <div className="pi-detail-scroll">
          {tab==='summary'&&<>
            <section className="pi-card pi-decision">
              <header><div><span>DECISIÓN COMERCIAL</span><h3>Por qué podría interesarle a un inmobiliario</h3></div><BriefcaseBusiness size={18}/></header>
              <div className="pi-decision-grid">
                <div><span>Probabilidad de venta</span><strong>{estimatedSale}%</strong><small>proxy hasta conectar operaciones</small></div>
                <div><span>Demanda relativa</span><strong>{demand}/100</strong><small>contexto + compatibilidad</small></div>
                <div><span>Perfil probable</span><strong>{profile}</strong><small>perfil preliminar</small></div>
                <div><span>Acción sugerida</span><strong>{opportunity>=80?'Priorizar captación':opportunity>=65?'Incluir en seguimiento':'Validar precio'}</strong><small>regla comercial preliminar</small></div>
              </div>
            </section>

            <section className="pi-card pi-why">
              <header><div><span>EXPLICABILIDAD</span><h3>Qué está empujando el score</h3></div><Eye size={18}/></header>
              <div className="pi-reasons">
                <div><b>01</b><p><strong>Posición territorial</strong><span>Score {opportunity}/100 y percentil {bench.score_percentile??'—'} dentro del universo demostrativo.</span></p></div>
                <div><b>02</b><p><strong>Compatibilidad de entorno</strong><span>{topEnv.map(x=>x.label).join(', ')} aparecen entre las categorías mejor puntuadas del radio actual.</span></p></div>
                <div><b>03</b><p><strong>Perfil demográfico</strong><span>{fmt(loc.households)} hogares y {pct(loc.adult_share)} de población adulta en la unidad territorial asociada.</span></p></div>
              </div>
            </section>

            <section className="pi-card"><header><div><span>POSICIÓN RELATIVA</span><h3>Cómo se ubica frente al universo visible</h3></div><BarChart3 size={18}/></header><div className="pi-bars">
              {[['Oportunidad',bench.score_percentile],['Precio / m²',bench.price_m2_percentile],['Superficie',bench.area_percentile],['Valor',bench.value_percentile]].map(([l,v])=><div key={l}><span>{l}</span><i><em style={{width:(Number(v)||0)+'%'}}/></i><b>{Number.isFinite(Number(v))?v+'º':'—'}</b></div>)}
            </div></section>
          </>}

          {tab==='property'&&<>
            <section className="pi-card"><header><div><span>FICHA DEL ACTIVO</span><h3>Información individual</h3></div><Building2 size={18}/></header><div className="pi-data-grid"><div><span>Tipo</span><b>{selected.type}</b></div><div><span>Superficie</span><b>{fmt(selected.area_m2)} m²</b></div><div><span>Precio / m²</span><b>{mxn(selected.price_m2)}</b></div><div><span>Valor de referencia</span><b>{mxn(selected.estimated_value)}</b></div><div><span>Microzona</span><b>{String(selected.location_id).slice(-4)}</b></div><div><span>Score territorial</span><b>{opportunity}/100</b></div></div></section>
            <section className="pi-card"><header><div><span>HISTORIAL</span><h3>Transacciones y cambios del activo</h3></div><Clock3 size={18}/></header><div className="pi-timeline"><div className="pending"><i/><p><b>Historial de ventas</b><span>Se conectará a la base inmobiliaria que se entregue.</span></p></div><div className="pending"><i/><p><b>Cambios de precio</b><span>Permitirá identificar reducciones, re-listados y velocidad de absorción.</span></p></div><div className="pending"><i/><p><b>Última operación</b><span>Fecha, precio, precio/m² y tipo de transacción.</span></p></div></div></section>
          </>}

          {tab==='market'&&<>
            <section className="pi-card"><header><div><span>MERCADO</span><h3>Contexto de mercado y liquidez</h3></div><TrendingUp size={18}/></header><div className="pi-market-hero"><ScoreRing value={liquidity} label="Liquidez proxy"/><div><span>Lectura actual</span><b>{liquidity>=80?'Mercado dinámico':liquidity>=65?'Liquidez media':'Validar profundidad'}</b><p>Hoy la plataforma solo puede construir una señal preliminar. Con ventas históricas se sustituirá por absorción, días de mercado y frecuencia de operación.</p></div></div><div className="pi-data-grid"><div><span>Financiamientos · último mes</span><b>{fmt(latest.actions)}</b></div><div><span>Monto · último mes</span><b>{mxn(latest.amount_mxn)}</b></div><div><span>Precio comparable</span><b>Pendiente de ventas</b></div><div><span>Tiempo de venta</span><b>Pendiente de historial</b></div><div><span>Inventario</span><b>Pendiente de cartera</b></div><div><span>Absorción</span><b>Pendiente de historial</b></div></div></section>
            <section className="pi-card pi-next"><Landmark size={18}/><div><b>Microzona antes que promedio municipal</b><p>El objetivo será calcular mercado a 500 m, 1 km y zona comparable. El promedio municipal quedará solo como referencia secundaria.</p></div></section>
          </>}

          {tab==='environment'&&<>
            <section className="pi-card pi-env-summary"><header><div><span>ENTORNO · {radius<1000?radius+' M':radius/1000+' KM'}</span><h3>Qué sostiene la experiencia de ubicación</h3></div><MapIcon size={18}/></header><div className="pi-env-top">{topEnv.map(({label,key,Icon,score})=><div key={key}><Icon size={16}/><span>{label}</span><b>{score}<small>/100</small></b></div>)}</div><p>Los POI del mapa son demostrativos en esta etapa. La estructura de radios, categorías, score y comparación ya está preparada para una fuente real.</p></section>
            <section className="pi-card"><header><div><span>CATEGORÍAS</span><h3>Densidad y comparación con la zona</h3></div><Route size={18}/></header><div className="pi-env-list">{env.map(({label,key,Icon,count,score,delta})=><div key={label}><button className={'pi-env-icon '+(activeCategories.includes(key)?'active':'')} onClick={()=>toggleCategory(key)}><Icon size={15}/></button><div><b>{label}</b><small>{count} puntos · demo</small></div><strong>{score}<small>/100</small></strong><em className={delta>=0?'up':'down'}>{delta>=0?'+':''}{delta}% vs zona</em></div>)}</div></section>
          </>}

          {tab==='demographics'&&<>
            <section className="pi-card"><header><div><span>DEMOGRAFÍA</span><h3>Compatibilidad del inmueble con su entorno</h3></div><Users size={18}/></header><div className="pi-demographic-lead"><ScoreRing value={fit} label="Compatibilidad"/><div><span>Perfil preliminar</span><b>{profile}</b><p>La compatibilidad todavía no usa ventas reales. En la versión final cruzará tipología, tamaño, precio, hogares y comportamiento observado de compradores.</p></div></div><div className="pi-data-grid"><div><span>Población</span><b>{fmt(loc.population)}</b></div><div><span>Hogares</span><b>{fmt(loc.households)}</b></div><div><span>Adultos</span><b>{pct(loc.adult_share)}</b></div><div><span>Movilidad reciente</span><b>{pct(loc.recent_mobility_share)}</b></div></div><div className="pi-tags"><ProfileTag>Hogares urbanos</ProfileTag><ProfileTag>Mercado residencial</ProfileTag><ProfileTag>Perfil por validar</ProfileTag></div></section>
          </>}

          {tab==='comparables'&&<>
            <section className="pi-card"><header><div><span>COMPARABLES PROVISIONALES</span><h3>Activos similares del catálogo demo</h3></div><Target size={18}/></header><div className="pi-comparables">{provisionalComparables.map((p,i)=><button key={p.id} onClick={()=>setSelected(p)}><span className="pi-comp-rank">0{i+1}</span><div><small>{p.type} · {fmt(p.area_m2)} m²</small><b>{p.title}</b><span>{mxn(p.price_m2)}/m² · {mxn(p.estimated_value)}</span></div><strong>{p.opportunity_score}<small>/100</small></strong></button>)}{!provisionalComparables.length&&<div className="pi-empty"><Target size={24}/><b>Sin comparables provisionales</b><p>Esperando activos semejantes.</p></div>}</div></section>
            <section className="pi-card pi-next"><Database size={18}/><div><b>No son transacciones comparables</b><p>Estos registros solo muestran cómo funcionará la interfaz. Los comparables definitivos requerirán fecha, precio de cierre, tipo, superficie, distancia y características del inmueble.</p></div></section>
          </>}
        </div>
      </aside>}
    </main>
  </div>
}
