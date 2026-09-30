import React,{useEffect,useMemo,useRef,useState} from 'react'
import L from 'leaflet'
import {ArrowUpRight,Layers3,Download,Search,X,MapPin,Users,Home,BriefcaseBusiness} from 'lucide-react'
import {loadTerritory,metrics,format,numeric,download} from './territorialData'
import './professional.css'

export function useTerritory(){
 const [data,setData]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let active=true;loadTerritory().then(d=>active&&setData(d)).catch(e=>active&&setError(e.message));return()=>{active=false}},[])
 return {data,error}
}

const zoneLabel=row=>{
 if(!row)return ''
 if(row.kind==='colonia')return row.name||'Colonia'
 if(row.kind==='district')return row.name||'Distrito'
 if(row.kind==='grid')return row.name||'Cuadrícula'
 if(!row.estimated&&row.id)return `Zona ${String(row.id).slice(-4)}`
 return String(row.name||'Zona seleccionada').replace(/^AGEB\s+/i,'Zona ')
}
const scaleNoun=scale=>scale==='colonia'?'colonias':scale==='district'?'distritos':'zonas'

export function MetricCards({row,keys=['pobtot','vivpar_hab','establecimientos_2025']}){
 return <div className="gp-stats">{keys.map(k=>{const m=metrics.find(m=>m[0]===k);return <div key={k}><span>{m[1]}</span><strong>{format(row?.values[k],m[2]==='%'?1:0)}{m[2]==='%'&&numeric(row?.values[k])!==null?'%':''}</strong><small>{k.includes('2025')||k.includes('denue')?'DENUE 2025':'Censo 2020'}{row?.estimated?' · estimación espacial':''}</small></div>})}</div>
}

export function ContextProfile({row}){
 if(!row)return <div className="gp-empty"><MapPin/><h3>Selecciona una colonia</h3><p>Consulta su contexto demográfico, residencial y económico.</p></div>
 const coverage=row.members?.length||1
 const context=row.kind==='colonia'
  ?`Colonia · Mazatlán, Sinaloa${row.postalCode?' · CP '+row.postalCode:''}`
  :row.kind==='district'?`Distrito CODESIN · ${coverage} zonas censales`
  :row.kind==='grid'?`Cuadrícula territorial · ${coverage} zonas censales`
  :`Mazatlán, Sinaloa · zona urbana`
 return <>
  <div className="gp-panel-heading"><span className="gl-eyebrow">PERFIL DEL ENTORNO</span><h2>{zoneLabel(row)}</h2><small>{context}</small></div>
  <MetricCards row={row}/>
  <div className="gp-profile">
   {['Demografía','Vivienda','Economía'].map(group=><section key={group}><h3>{group==='Demografía'?<Users size={18}/>:group==='Vivienda'?<Home size={18}/>:<BriefcaseBusiness size={18}/>} {group}</h3>{metrics.filter(m=>m[3]===group).map(([key,label,unit])=><div className="gp-data-row" key={key}><span>{label}</span><b>{format(row.values[key],unit==='%'?1:0)}{numeric(row.values[key])!==null&&unit==='%'?'%':''}</b></div>)}</section>)}
   {row.services&&<section><h3>Servicios en el entorno</h3><p className="gp-note">Establecimientos a 1 km del centroide de la zona. No representa un recorrido ni un radio desde la propiedad.</p>{[['supermarkets','Supermercados'],['health','Salud'],['education','Educación'],['pharmacies','Farmacias']].map(([k,label])=><div className="gp-data-row" key={k}><span>{label}</span><b>{format(row.services['svc_'+k+'_1km'])}</b></div>)}</section>}
   <section className="gp-method"><h3>Lectura para tu decisión</h3><p>La población y la vivienda describen la base residencial; los establecimientos y el empleo estimado describen la actividad económica del entorno.</p><p>Estos datos no estiman capacidad de compra, demanda insatisfecha, precio de venta ni rentabilidad de un proyecto.</p><p>{row.estimated?'Los indicadores de esta colonia o zona se estiman mediante la intersección de su polígono con las unidades censales. Los conteos se distribuyen por proporción de superficie y las tasas se ponderan por vivienda; no son conteos censales observados directamente a nivel colonia.':'Datos de la unidad territorial completa; no representan las características de los habitantes de una propiedad.'} “Sin dato” conserva valores ausentes o suprimidos.</p></section>
  </div>
 </>
}

function TerritoryMap({rows,metric,selected,onSelect}){
 const [basemapMissing,setBasemapMissing]=useState(false)
 const node=useRef(null),map=useRef(null),layer=useRef(null),callback=useRef(onSelect)
 callback.current=onSelect
 useEffect(()=>{
  const m=L.map(node.current,{zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([23.25,-106.43],12)
  map.current=m
  const tileTimer=setTimeout(()=>setBasemapMissing(true),12000)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).on('tileload',()=>{clearTimeout(tileTimer);setBasemapMissing(false)}).on('tileerror',()=>setBasemapMissing(true)).addTo(m)
  const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(node.current)
  return()=>{clearTimeout(tileTimer);resize.disconnect();m.remove();map.current=null}
 },[])
 useEffect(()=>{
  if(!map.current)return
  layer.current?.remove()
  const vals=rows.map(r=>numeric(r.values[metric])).filter(v=>v!==null).sort((a,b)=>a-b)
  const q=f=>vals[Math.floor((vals.length-1)*f)]??0
  const color=v=>numeric(v)===null?'#d6dbe0':v>=q(.8)?'#005b54':v>=q(.6)?'#168d7d':v>=q(.4)?'#51b29d':v>=q(.2)?'#97d4bd':'#d3eee0'
  layer.current=L.geoJSON(rows,{
   style:f=>({color:f.id===selected?'#163847':'#fff',weight:f.id===selected?3:.7,fillColor:color(f.values[metric]),fillOpacity:.78}),
   onEachFeature:(f,l)=>{
    const tip=document.createElement('div');tip.textContent=zoneLabel(f)+' · '+format(f.values[metric],1);l.bindTooltip(tip)
    l.on('click',()=>{callback.current(f.id);if(l.getBounds)map.current?.fitBounds(l.getBounds(),{padding:[70,70],maxZoom:15})})
   }
  }).addTo(map.current)
  if(layer.current.getBounds().isValid())map.current.fitBounds(layer.current.getBounds(),{padding:[18,18],maxZoom:13})
 },[rows,metric,selected])
 return <><div className="gp-map" ref={node} aria-label="Mapa territorial interactivo"/>{basemapMissing&&<div className="gp-basemap-status" role="status">Mapa de calles no disponible. Los polígonos y datos siguen activos.</div>}</>
}

export function TerritoryWorkspace(){
 const {data,error}=useTerritory()
 const [scale,setScale]=useState('colonia'),[metric,setMetric]=useState('pobtot'),[rows,setRows]=useState([]),[selected,setSelected]=useState(null),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[compare,setCompare]=useState([])
 useEffect(()=>{
  if(!data)return
  setFailure('');setSelected(null);setCompare([]);setRows([]);setQuery('')
  if(scale==='ageb'){setRows(data.agebs);setBusy(false);return}
  setBusy(true)
  const worker=new Worker(new URL('./territory.worker.js',import.meta.url),{type:'module'})
  worker.onmessage=({data:result})=>{setBusy(false);if(result.error)setFailure(result.error);else setRows(result.rows)}
  worker.onerror=()=>{setBusy(false);setFailure('No se pudo calcular esta escala. Intenta con otra escala territorial.')}
  worker.postMessage({dataset:data,scale})
  return()=>worker.terminate()
 },[data,scale])
 const filtered=useMemo(()=>{
  const needle=query.toLowerCase().trim()
  return rows.filter(r=>(zoneLabel(r)+' '+(r.name||'')+' '+(r.postalCode||'')+' '+(r.id||'')).toLowerCase().includes(needle)).sort((a,b)=>(b.values[metric]??-1)-(a.values[metric]??-1))
 },[rows,query,metric])
 const row=rows.find(r=>r.id===selected)
 const definition=metrics.find(m=>m[0]===metric)
 const noun=scaleNoun(scale)
 const mapMethod=scale==='colonia'?'Estimación por colonia':scale==='ageb'?'Datos por zona urbana':'Estimación espacial'
 const exportMethod=scale==='colonia'?'Polígonos de colonias con indicadores estimados por intersección de unidades censales':scale==='ageb'?'Datos por zona urbana (unidad censal)':'Estimación por proporción de superficie de unidades censales'

 return <main className="gp-page" id="main-content" tabIndex={-1}>
  <div className="gp-title"><div><span className="gl-eyebrow">GROWA / INTELIGENCIA TERRITORIAL</span><h1>Entiende el territorio.<br/><em>Define tu próximo proyecto.</em></h1><p>Población, vivienda y actividad económica para desarrolladores e inmobiliarias.</p></div><a href="#portfolio" className="gl-button">Mi cartera <ArrowUpRight size={18}/></a></div>
  <div className="gp-toolbar">
   <label><Layers3 size={17}/> Escala<select aria-label="Escala territorial" value={scale} onChange={e=>setScale(e.target.value)}><option value="colonia">Colonias</option><option value="ageb">Zonas urbanas</option><option value="district">Distritos CODESIN</option><option value="500">Cuadrícula · 500 m</option><option value="1000">Cuadrícula · 1 km</option><option value="1500">Cuadrícula · 1.5 km</option></select></label>
   <label>Indicador<select aria-label="Indicador territorial" value={metric} onChange={e=>setMetric(e.target.value)}>{['Demografía','Vivienda','Economía'].map(group=><optgroup key={group} label={group}>{metrics.filter(m=>m[3]===group).map(m=><option key={m[0]} value={m[0]}>{m[1]}</option>)}</optgroup>)}</select></label>
   <label className="gp-search"><Search size={17}/><input aria-label="Buscar ubicación" placeholder={scale==='colonia'?'Buscar colonia o código postal':scale==='district'?'Buscar distrito':'Buscar zona'} value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <button className="gp-secondary" disabled={!filtered.length} onClick={()=>download('growa-territorio.json',JSON.stringify({scale,method:exportMethod,sources:['Censo 2020','DENUE 2025',...(scale==='colonia'?['SEPOMEX 2025']:[])],rows:filtered.map(({id,name,postalCode,values,members})=>({id,name,postalCode,values,members}))},null,2))}><Download size={16}/> Exportar</button>
  </div>
  {(error||failure)&&<p role="alert" className="gp-alert">{error||failure}</p>}
  <div className="gp-workspace">
   <section className="gp-map-area"><TerritoryMap rows={filtered} metric={metric} selected={selected} onSelect={setSelected}/><div className="gp-map-label"><b>{definition[1]}</b><span>{definition[2]} · {mapMethod}</span></div><div className="gp-legend"><span>Menor</span><i/><span>Mayor</span><small>Quintiles · gris: sin dato</small></div>{(!data||busy)&&<div className="gp-loading" role="status">{busy?(scale==='colonia'?'Calculando indicadores por colonia…':'Calculando intersecciones territoriales…'):'Cargando datos territoriales…'}</div>}<div className="gp-zone-list"><header><b>{filtered.length} {noun}</b><small>Ordenadas por {definition[1].toLowerCase()}</small></header><div>{filtered.slice(0,150).map(r=><button className={r.id===selected?'selected':''} key={r.id} onClick={()=>setSelected(r.id)}><span>{zoneLabel(r)}{r.kind==='colonia'&&r.postalCode?<small>CP {r.postalCode}</small>:null}</span><b>{format(r.values[metric],1)}</b></button>)}{filtered.length>150&&<p className="gp-note">Primeras 150 ubicaciones en lista. Todas están disponibles mediante la búsqueda.</p>}</div></div></section>
   <aside className="gp-detail"><ContextProfile row={row}/>{row&&<div className="gp-detail-actions"><button className="gl-button" disabled={compare.includes(row.id)||compare.length===3} onClick={()=>setCompare([...compare,row.id])}>Comparar {row.kind==='colonia'?'colonia':'zona'} ({compare.length}/3)</button>{scale==='ageb'&&<a href={'#portfolio?ageb='+row.id}>Registrar propiedad en esta zona <ArrowUpRight size={15}/></a>}</div>}</aside>
  </div>
  {compare.length>0&&<section className="gp-comparison"><header><h2>Comparación territorial</h2><button className="gp-secondary" onClick={()=>setCompare([])}>Limpiar</button></header><div className="gp-table-scroll"><table><thead><tr><th>Indicador</th>{compare.map(id=><th key={id}>{zoneLabel(rows.find(r=>r.id===id))}<button aria-label={'Quitar '+id} onClick={()=>setCompare(compare.filter(x=>x!==id))}><X size={14}/></button></th>)}</tr></thead><tbody>{metrics.map(([k,label,unit])=><tr key={k}><td>{label} {unit==='%'?'(%)':''}</td>{compare.map(id=><td key={id}>{format(rows.find(r=>r.id===id)?.values[k],unit==='%'?1:0)}</td>)}</tr>)}</tbody></table></div></section>}
  <p className="gp-note gp-bottom-note">Colonias y asentamientos: delimitaciones SEPOMEX 2025. Población y vivienda: Censo 2020. Actividad económica: DENUE 2025. Los indicadores por colonia se estiman mediante intersección espacial con las unidades censales y deben interpretarse como aproximaciones territoriales, no como conteos censales publicados directamente por colonia. Distritos CODESIN y cuadrículas permanecen disponibles como escalas adicionales. <a href="#market">Consultar financiamiento y costos de construcción →</a></p>
 </main>
}
