import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PORT=Number(process.env.PORT||3001)
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||'*'
const UPSTREAM='https://growa-territorial.onrender.com/data/territories/mx-sin-mazatlan/inmobiliario'
const CODESIN_UPSTREAM='https://growa-territorial.onrender.com/data/territories/mx-sin-mazatlan/geometry/codesin-districts.geojson'
const LOCAL_DATA=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/data')

let state={loadedAt:null,records:[],marketPulse:null,finance:null,urbanFootprint:null,districts:[],properties:[],source:'unloaded'}
let loading=null

const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null
const ratio=(a,b,m=100)=>Number(b)>0&&Number.isFinite(Number(a))?Number(a)/Number(b)*m:null

function unpackCore(payload){
  return (payload.rows||[]).map(row=>Object.fromEntries((payload.columns||[]).map((c,i)=>[c,row[i]])))
}
function isUrban(r){
  const id=String(r?.cvegeo_ageb||'')
  return id.slice(5,9)==='0001'&&Number(r?.pobtot||0)>0
}
function derive(r){
  return {
    ...r,
    id:String(r.cvegeo_ageb||''),
    population:num(r.pobtot)||0,
    households:num(r.tothog)||0,
    occupied_housing:num(r.vivpar_hab)||0,
    household_size:num(r.prom_ocup),
    adult_share:ratio(r.p_18ymas,r.pobtot),
    external_origin_share:ratio(r.pnacoe,r.pobtot),
    recent_mobility_share:ratio(r.presoe15,r.pobtot),
    women_share:ratio(r.pobfem,r.pobtot),
    men_share:ratio(r.pobmas,r.pobtot),
  }
}
function percentile(values,p){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y)
  if(!a.length)return 0
  return a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*p)))]
}
function score(records){
  const fields=['population','households','adult_share','external_origin_share','recent_mobility_share']
  const bounds={}
  for(const key of fields){
    const vals=records.map(r=>Number(r[key])).filter(Number.isFinite)
    bounds[key]=[percentile(vals,.1),percentile(vals,.9)]
  }
  const norm=(v,key)=>{
    if(!Number.isFinite(Number(v)))return 0
    const [lo,hi]=bounds[key]||[0,1]
    return Math.max(0,Math.min(1,(Number(v)-lo)/(hi-lo||1)))
  }
  return records.map(r=>{
    const components={
      population:norm(r.population,'population'),
      households:norm(r.households,'households'),
      adults:norm(r.adult_share,'adult_share'),
      mobility:norm(r.recent_mobility_share,'recent_mobility_share'),
      external_origin:norm(r.external_origin_share,'external_origin_share'),
    }
    const opportunity=Math.round(100*(
      components.population*.32+
      components.households*.26+
      components.adults*.14+
      components.mobility*.16+
      components.external_origin*.12
    ))
    return {...r,opportunity_score:opportunity,score_components:components}
  })
}
async function loadJson(name,optional=false){
  try{
    const r=await fetch(UPSTREAM+'/'+name,{signal:AbortSignal.timeout(15000)})
    if(!r.ok)throw new Error(String(r.status))
    return await r.json()
  }catch(error){
    try{return JSON.parse(await readFile(path.join(LOCAL_DATA,name),'utf8'))}
    catch{if(optional)return null;throw error}
  }
}

async function loadUrlJson(url,localName,optional=false){
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(15000)})
    if(!r.ok)throw new Error(String(r.status))
    return await r.json()
  }catch(error){
    try{return JSON.parse(await readFile(path.join(LOCAL_DATA,localName),'utf8'))}
    catch{if(optional)return null;throw error}
  }
}
async function loadPropertyListings(){
  const files=['listings-centro.json','listings-marina.json','listings-sabalo.json']
  const packs=await Promise.all(files.map(async name=>{
    try{return JSON.parse(await readFile(path.join(LOCAL_DATA,name),'utf8'))}
    catch{return {records:[]}}
  }))
  return packs.flatMap(x=>x.records||[]).map(p=>({
    ...p,
    title:p.title||((p.type||'Propiedad')+' en '+(p.zone||'Mazatlán')),
    estimated_value:Number(p.price)||null,
    synthetic:false,
    location_note:p.location_precision==='zone_anchor'
      ?'Ubicación aproximada: el punto representa la zona publicada por el anuncio, no la coordenada exacta del inmueble.'
      :null,
  }))
}
function flattenCoords(value,out=[]){
  if(!Array.isArray(value))return out
  if(value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){out.push([value[0],value[1]]);return out}
  for(const item of value)flattenCoords(item,out)
  return out
}
function centerOfGeometry(geometry){
  const pts=flattenCoords(geometry?.coordinates,[])
  if(!pts.length)return null
  let sx=0,sy=0
  for(const [x,y] of pts){sx+=x;sy+=y}
  return [sx/pts.length,sy/pts.length]
}
function pointInRing([x,y],ring){
  let inside=false
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i], [xj,yj]=ring[j]
    const intersect=((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)
    if(intersect)inside=!inside
  }
  return inside
}
function pointInPolygon(point,poly){
  if(!poly?.length||!pointInRing(point,poly[0]))return false
  for(let i=1;i<poly.length;i++)if(pointInRing(point,poly[i]))return false
  return true
}
function pointInFeature(point,feature){
  const g=feature?.geometry
  if(!g||!point)return false
  if(g.type==='Polygon')return pointInPolygon(point,g.coordinates)
  if(g.type==='MultiPolygon')return g.coordinates.some(poly=>pointInPolygon(point,poly))
  return false
}
function slugify(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
}
function buildDistricts(records,agebGeometry,codesin){
  const byId=new Map(records.map(r=>[r.id,r]))
  const districtFeatures=(codesin?.features||[]).map(feature=>({
    feature,
    name:String(feature?.properties?.district||'Distrito'),
    center:centerOfGeometry(feature?.geometry),
  }))
  const buckets=new Map()
  for(const item of districtFeatures){
    const existing=buckets.get(item.name)
    if(existing){
      existing.declared_ageb_count+=Number(item.feature?.properties?.ageb_count||0)
      existing.features.push(item.feature)
    }else{
      buckets.set(item.name,{
        name:item.name,
        slug:slugify(item.name),
        ageb_ids:[],
        declared_ageb_count:Number(item.feature?.properties?.ageb_count||0),
        features:[item.feature],
        contained_count:0,
        nearest_count:0,
      })
    }
  }

  const distance2=(a,b)=>{
    if(!a||!b)return Infinity
    const dx=(a[0]-b[0])*Math.cos(((a[1]+b[1])/2)*Math.PI/180)
    const dy=a[1]-b[1]
    return dx*dx+dy*dy
  }

  for(const feature of agebGeometry?.features||[]){
    const id=String(feature?.properties?.cvegeo_ageb||feature?.properties?.CVEGEO||'').slice(0,13)
    const record=byId.get(id)
    if(!record)continue
    const center=centerOfGeometry(feature.geometry)
    let match=districtFeatures.find(d=>pointInFeature(center,d.feature))
    let method='contained'
    if(!match){
      match=[...districtFeatures].sort((a,b)=>distance2(center,a.center)-distance2(center,b.center))[0]
      method='nearest'
    }
    if(!match)continue
    const bucket=buckets.get(match.name)
    if(bucket){
      bucket.ageb_ids.push(id)
      if(method==='contained')bucket.contained_count++
      else bucket.nearest_count++
    }
  }

  return [...buckets.values()].map(d=>{
    const rows=d.ageb_ids.map(id=>byId.get(id)).filter(Boolean)
    const sum=k=>rows.reduce((a,r)=>a+(Number(r[k])||0),0)
    const avg=k=>rows.length?rows.reduce((a,r)=>a+(Number(r[k])||0),0)/rows.length:null
    const weighted=(k,w='households')=>{
      const den=rows.reduce((a,r)=>a+(Number(r[w])||0),0)
      if(!den)return avg(k)
      return rows.reduce((a,r)=>a+(Number(r[k])||0)*(Number(r[w])||0),0)/den
    }
    return {
      name:d.name,
      slug:d.slug,
      ageb_ids:d.ageb_ids,
      declared_ageb_count:d.declared_ageb_count,
      ageb_count:rows.length||d.declared_ageb_count,
      population:sum('population'),
      households:sum('households'),
      occupied_housing:sum('occupied_housing'),
      opportunity_score:weighted('opportunity_score')===null?null:Math.round(weighted('opportunity_score')),
      mobility_share:weighted('recent_mobility_share'),
      adult_share:weighted('adult_share'),
      external_origin_share:weighted('external_origin_share'),
      assignment:{contained:d.contained_count,nearest:d.nearest_count},
    }
  }).sort((a,b)=>(b.opportunity_score||0)-(a.opportunity_score||0))
}
function marketSummary(){
  const p=state.marketPulse||{}
  const f=state.finance||{}
  return {
    geography:p.geography||f.geography||'Municipio de Mazatlán',
    observed_through:p.observed_through||f.observed_through||null,
    source:p.source||f.source||null,
    modalities:p.modalities||[],
    segments:p.new_housing_value_segments||[],
    h1_comparison:f.h1_2026_vs_2025||null,
    h1:f.h1||null,
    latest_month:(f.monthly||[]).at(-1)||null,
    monthly:(f.monthly||[]).slice(-18),
    potential_demand:f.potential_demand||null,
    age_profile:f.age_profile||[],
    notes:[...(p.notes||[]),...(f.notes||[])],
  }
}

async function load(){
  if(loading)return loading
  loading=(async()=>{
    const [core,extra,marketPulse,finance,urbanFootprint,agebGeometry,codesin,properties]=await Promise.all([
      loadJson('ageb-core.json'),
      loadJson('ageb-profile-extra.json',true),
      loadJson('market-pulse.json',true),
      loadJson('financing-summary.json',true),
      loadJson('agebs-huella-urbana.json',true),
      loadJson('ageb-geometry-2020.geojson',true),
      loadUrlJson(CODESIN_UPSTREAM,'codesin-districts.geojson',true),
      loadPropertyListings(),
    ])
    const extras=new Map((extra?.records||[]).map(r=>[String(r.cvegeo_ageb||''),r]))
    const records=score(unpackCore(core).filter(isUrban).map(r=>derive({...r,...(extras.get(String(r.cvegeo_ageb||''))||{})})))
    const districts=buildDistricts(records,agebGeometry,codesin)
    state={loadedAt:new Date().toISOString(),records,marketPulse,finance,urbanFootprint,districts,properties,source:'growa-territorial'}
    return state
  })().finally(()=>{loading=null})
  return loading
}

function pick(r){
  if(!r)return null
  return {
    id:r.id,
    label:'AGEB '+r.id.slice(-4),
    municipality:'Mazatlán',
    state:'Sinaloa',
    population:r.population,
    households:r.households,
    occupied_housing:r.occupied_housing,
    household_size:r.household_size,
    adult_share:r.adult_share,
    external_origin_share:r.external_origin_share,
    recent_mobility_share:r.recent_mobility_share,
    women_share:r.women_share,
    men_share:r.men_share,
    opportunity_score:r.opportunity_score,
    score_components:r.score_components,
    source:'INEGI Censo 2020 + proxy Growa',
  }
}

function cors(req,res){
  const origin=req.headers.origin
  const allowed=ALLOWED_ORIGIN==='*'||!origin||ALLOWED_ORIGIN.split(',').map(x=>x.trim()).includes(origin)
  if(allowed)res.setHeader('Access-Control-Allow-Origin',ALLOWED_ORIGIN==='*'?'*':origin||ALLOWED_ORIGIN.split(',')[0])
  res.setHeader('Vary','Origin')
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept')
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS')
}
function json(req,res,status,body,cache='public, max-age=60, stale-while-revalidate=300'){
  cors(req,res)
  res.statusCode=status
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.setHeader('Cache-Control',cache)
  res.end(JSON.stringify(body))
}
function parseLimit(value,def=10,max=100){
  const n=Number(value)
  return Number.isFinite(n)?Math.max(1,Math.min(max,Math.trunc(n))):def
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='OPTIONS'){cors(req,res);res.statusCode=204;return res.end()}
    if(req.method!=='GET')return json(req,res,405,{error:'Método no permitido'},'no-store')
    const url=new URL(req.url,'http://localhost')
    if(url.pathname==='/api/health'){
      return json(req,res,200,{ok:true,service:'growa-inmobiliaria-api',loaded:Boolean(state.loadedAt),loaded_at:state.loadedAt},'no-store')
    }
    await load()
    if(url.pathname==='/api/sources'){
      const finance=state.finance||{}
      const pulse=state.marketPulse||{}
      return json(req,res,200,{
        territory:'Mazatlán, Sinaloa',
        datasets:[
          {key:'censo_2020',name:'INEGI Censo de Población y Vivienda 2020',scale:'AGEB urbana',status:'observed',coverage:'275 AGEB con población'},
          {key:'codesin',name:'Distritos CODESIN',scale:'distrito',status:'observed',coverage:state.districts.length+' distritos'},
          {key:'sniiv_finance',name:finance.source||'SNIIV/SEDATU - Financiamientos de vivienda',scale:'municipio',status:'observed',observed_through:finance.observed_through||null},
          {key:'market_pulse',name:pulse.source||'Market Pulse',scale:'municipio',status:'observed',observed_through:pulse.observed_through||null},
          {key:'property_supply',name:'Oferta inmobiliaria observada',scale:'anuncio',status:'observed',coverage:state.properties.length+' anuncios',note:'Precios de oferta publicados; la ubicación cartográfica es aproximada cuando el anuncio no publica coordenadas exactas.'},
          {key:'opportunity_score',name:'Opportunity Score Growa',scale:'AGEB / distrito',status:'derived',note:'Proxy demográfico; no es avalúo ni predicción de ventas.'}
        ],
        loaded_at:state.loadedAt
      })
    }
    if(url.pathname==='/api/meta'){
      return json(req,res,200,{
        territory:'Mazatlán, Sinaloa',
        locations:state.records.length,
        districts:state.districts.length,
        loaded_at:state.loadedAt,
        source:state.source,
        opportunity_method:'Proxy demográfico normalizado P10–P90: población 32%, hogares 26%, adultos 14%, movilidad reciente 16%, origen externo 12%. No es avalúo ni predicción de ventas.',
        district_method:'AGEB asignada por centro geométrico al polígono CODESIN; si el centro cae fuera por bordes/topología, se usa el distrito más cercano. Agregados distritales ponderan por hogares.'
      })
    }
    if(url.pathname==='/api/locations'){
      const q=(url.searchParams.get('q')||'').trim().toLowerCase()
      const limit=parseLimit(url.searchParams.get('limit'),20,100)
      const rows=state.records.filter(r=>!q||r.id.toLowerCase().includes(q)||('ageb '+r.id.slice(-4)).includes(q)).slice(0,limit).map(pick)
      return json(req,res,200,{rows,total:rows.length,source:state.source})
    }
    if(url.pathname.startsWith('/api/locations/')){
      const id=decodeURIComponent(url.pathname.slice('/api/locations/'.length))
      const row=state.records.find(r=>r.id===id)
      if(!row)return json(req,res,404,{error:'Ubicación no encontrada'},'no-store')
      return json(req,res,200,{location:pick(row),source:state.source})
    }
    if(url.pathname==='/api/rankings'){
      const metric=url.searchParams.get('metric')||'opportunity'
      const limit=parseLimit(url.searchParams.get('limit'),10,50)
      const field={
        opportunity:'opportunity_score',
        population:'population',
        households:'households',
        adults:'adult_share',
        mobility:'recent_mobility_share',
        household_size:'household_size',
      }[metric]||'opportunity_score'
      const rows=[...state.records].sort((a,b)=>(Number(b[field])||0)-(Number(a[field])||0)).slice(0,limit).map(pick)
      return json(req,res,200,{
        metric,rows,source:state.source,
        methodology:metric==='opportunity'
          ?'Proxy demográfico Growa normalizado P10–P90; no es avalúo ni predicción de ventas.'
          :'Indicador descriptivo derivado de INEGI Censo 2020.'
      })
    }
    if(url.pathname==='/api/compare'){
      const ids=(url.searchParams.get('ids')||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,3)
      const rows=ids.map(id=>state.records.find(r=>r.id===id)).filter(Boolean).map(pick)
      return json(req,res,200,{rows,source:state.source})
    }
    if(url.pathname==='/api/market-pulse'){
      return json(req,res,200,{pulse:state.marketPulse,finance:state.finance,urban_footprint:state.urbanFootprint,source:state.source})
    }
    if(url.pathname==='/api/market-summary'){
      return json(req,res,200,{...marketSummary(),source_key:state.source})
    }
    if(url.pathname==='/api/districts'){
      const q=(url.searchParams.get('q')||'').trim().toLowerCase()
      const rows=state.districts.filter(d=>!q||d.name.toLowerCase().includes(q)||d.slug.includes(q))
      return json(req,res,200,{rows,total:rows.length,source:'CODESIN + INEGI Censo 2020'})
    }
    if(url.pathname.startsWith('/api/districts/')){
      const slug=decodeURIComponent(url.pathname.slice('/api/districts/'.length))
      const district=state.districts.find(d=>d.slug===slug)
      if(!district)return json(req,res,404,{error:'Distrito no encontrado'},'no-store')
      const locations=district.ageb_ids.map(id=>state.records.find(r=>r.id===id)).filter(Boolean).map(pick)
      return json(req,res,200,{district,locations,source:'CODESIN + INEGI Censo 2020'})
    }
    if(url.pathname==='/api/overview'){
      const totalPopulation=state.records.reduce((a,r)=>a+(Number(r.population)||0),0)
      const totalHouseholds=state.records.reduce((a,r)=>a+(Number(r.households)||0),0)
      const highOpportunity=state.records.filter(r=>(Number(r.opportunity_score)||0)>=70).length
      const topLocations=[...state.records].sort((a,b)=>(b.opportunity_score||0)-(a.opportunity_score||0)).slice(0,8).map(pick)
      const topDistricts=[...state.districts].sort((a,b)=>(b.opportunity_score||0)-(a.opportunity_score||0)).slice(0,6)
      return json(req,res,200,{
        geography:'Mazatlán, Sinaloa',
        coverage:{locations:state.records.length,districts:state.districts.length,population:totalPopulation,households:totalHouseholds,high_opportunity_locations:highOpportunity},
        market:marketSummary(),
        top_locations:topLocations,
        top_districts:topDistricts,
        layers:[
          {key:'demography',label:'Demografía',status:'observed'},
          {key:'housing',label:'Vivienda',status:'observed'},
          {key:'districts',label:'Distritos CODESIN',status:'observed'},
          {key:'finance',label:'Financiamiento',status:'observed'},
          {key:'opportunity',label:'Opportunity Score',status:'derived'},
          {key:'properties',label:'Oferta inmobiliaria',status:'observed'}
        ],
        loaded_at:state.loadedAt,source:state.source
      })
    }
    if(url.pathname==='/api/property-facets'){
      const universe=state.properties
      const byType={},byOperation={},byZone={}
      for(const p of universe){
        byType[p.type]=(byType[p.type]||0)+1
        byOperation[p.operation]=(byOperation[p.operation]||0)+1
        byZone[p.zone]=(byZone[p.zone]||0)+1
      }
      const nums=(key,filter=()=>true)=>universe.filter(filter).map(p=>Number(p[key])).filter(Number.isFinite).sort((a,b)=>a-b)
      const q=(arr,p)=>arr.length?arr[Math.min(arr.length-1,Math.max(0,Math.floor((arr.length-1)*p)))]:null
      const salePrices=nums('price_m2',p=>p.operation==='Venta')
      const rentPrices=nums('price_m2',p=>p.operation==='Renta')
      const areas=nums('area_m2')
      return json(req,res,200,{
        total:universe.length,types:byType,operations:byOperation,zones:byZone,
        ranges:{
          sale_price_m2:{min:salePrices[0]||null,median:q(salePrices,.5),max:salePrices.at(-1)||null},
          rent_price_m2:{min:rentPrices[0]||null,median:q(rentPrices,.5),max:rentPrices.at(-1)||null},
          area_m2:{min:areas[0]||null,median:q(areas,.5),max:areas.at(-1)||null}
        },
        synthetic:false,source:'public-listings'
      })
    }
    if(url.pathname==='/api/properties'){
      const limit=parseLimit(url.searchParams.get('limit'),100,250)
      const type=(url.searchParams.get('type')||'').trim().toLowerCase()
      const operation=(url.searchParams.get('operation')||'').trim().toLowerCase()
      const zone=(url.searchParams.get('zone')||'').trim().toLowerCase()
      const query=(url.searchParams.get('q')||'').trim().toLowerCase()
      const sort=url.searchParams.get('sort')||'date_desc'
      const minArea=Number(url.searchParams.get('min_area')||0)
      const maxArea=Number(url.searchParams.get('max_area')||Infinity)
      const minPrice=Number(url.searchParams.get('min_price_m2')||0)
      const maxPrice=Number(url.searchParams.get('max_price_m2')||Infinity)
      let rows=state.properties.filter(p=>{
        const area=Number(p.area_m2)
        const pm2=Number(p.price_m2)
        const typeOk=!type||type==='todos'||String(p.type||'').toLowerCase()===type
        const opOk=!operation||operation==='todos'||String(p.operation||'').toLowerCase()===operation
        const zoneOk=!zone||zone==='todas'||String(p.zone||'').toLowerCase()===zone
        const queryOk=!query||[p.id,p.type,p.operation,p.zone,p.address,p.source,p.franchise].some(v=>String(v||'').toLowerCase().includes(query))
        return typeOk&&opOk&&zoneOk&&queryOk&&
          (!minArea||area>=minArea)&&(!Number.isFinite(maxArea)||area<=maxArea)&&
          (!minPrice||pm2>=minPrice)&&(!Number.isFinite(maxPrice)||pm2<=maxPrice)
      })
      rows.sort((a,b)=>{
        if(sort==='price_desc')return (Number(b.price)||0)-(Number(a.price)||0)
        if(sort==='price_asc')return (Number(a.price)||0)-(Number(b.price)||0)
        if(sort==='price_m2_asc')return (Number(a.price_m2)||Infinity)-(Number(b.price_m2)||Infinity)
        if(sort==='area_desc')return (Number(b.area_m2)||0)-(Number(a.area_m2)||0)
        return String(b.observed_at||'').localeCompare(String(a.observed_at||''))
      })
      const total=rows.length
      rows=rows.slice(0,limit)
      const sale=rows.filter(p=>p.operation==='Venta')
      const rent=rows.filter(p=>p.operation==='Renta')
      const avg=(arr,key)=>arr.length?arr.reduce((a,r)=>a+(Number(r[key])||0),0)/arr.length:null
      return json(req,res,200,{
        rows,total,synthetic:false,source:'public-listings',
        summary:{
          sale_count:sale.length,rent_count:rent.length,
          avg_sale_price_m2:avg(sale,'price_m2'),
          avg_rent_price_m2:avg(rent,'price_m2'),
          avg_area_m2:avg(rows,'area_m2')
        },
        filters:{type:type||null,operation:operation||null,zone:zone||null,q:query||null,sort}
      })
    }
    if(url.pathname.startsWith('/api/properties/')){
      const id=decodeURIComponent(url.pathname.slice('/api/properties/'.length))
      const property=state.properties.find(p=>String(p.id)===id)
      if(!property)return json(req,res,404,{error:'Oferta no encontrada'},'no-store')
      const universe=state.properties.filter(p=>p.operation===property.operation)
      const percentileRank=(value,key)=>{
        const vals=universe.map(x=>Number(x[key])).filter(Number.isFinite).sort((a,b)=>a-b)
        if(!vals.length||!Number.isFinite(Number(value)))return null
        return Math.round(vals.filter(v=>v<=Number(value)).length/vals.length*100)
      }
      return json(req,res,200,{
        property,
        location:null,
        district:null,
        market:marketSummary(),
        benchmarks:{
          price_m2_percentile:percentileRank(property.price_m2,'price_m2'),
          area_percentile:percentileRank(property.area_m2,'area_m2'),
          price_percentile:percentileRank(property.price,'price')
        },
        synthetic:false,
        source:'public-listings'
      })
    }
    return json(req,res,404,{error:'Ruta no encontrada'},'no-store')
  }catch(error){
    console.error(error)
    return json(req,res,500,{error:'Error interno',detail:process.env.NODE_ENV==='production'?undefined:String(error)},'no-store')
  }
})

server.listen(PORT,async()=>{
  console.log('[api] listening on',PORT)
  try{await load();console.log('[api] loaded',state.records.length,'locations,',state.districts.length,'districts,',state.districts.reduce((a,d)=>a+d.ageb_ids.length,0),'AGEB assigned')}
  catch(e){console.error('[api] initial load failed',e)}
})
