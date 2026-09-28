const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

const cache = new Map()
let localRecordsPromise = null

const ratio = (a,b,m=100) => Number(b)>0 && Number.isFinite(Number(a)) ? Number(a)/Number(b)*m : null
const n = v => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null

function unpackCore(payload){
  return (payload.rows||[]).map(row=>Object.fromEntries((payload.columns||[]).map((c,i)=>[c,row[i]])))
}

function isUrban(r){
  const id=String(r?.cvegeo_ageb||'')
  return id.slice(5,9)==='0001' && Number(r?.pobtot||0)>0
}

function derive(r){
  const population=n(r.pobtot)||0
  const households=n(r.tothog)||0
  return {
    ...r,
    id:String(r.cvegeo_ageb||''),
    population,
    households,
    occupied_housing:n(r.vivpar_hab)||0,
    household_size:n(r.prom_ocup),
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
  const idx=Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*p)))
  return a[idx]
}

function localScored(records){
  const fields=['population','households','adult_share','external_origin_share','recent_mobility_share']
  const bounds={}
  fields.forEach(k=>{
    const vals=records.map(r=>Number(r[k])).filter(Number.isFinite)
    bounds[k]=[percentile(vals,.1),percentile(vals,.9)]
  })
  const norm=(v,k)=>{
    if(!Number.isFinite(Number(v)))return 0
    const [lo,hi]=bounds[k]||[0,1]
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

async function localRecords(){
  if(localRecordsPromise)return localRecordsPromise
  localRecordsPromise=Promise.all([
    fetch('/data/ageb-core.json').then(r=>{if(!r.ok)throw new Error('AGEB core');return r.json()}),
    fetch('/data/ageb-profile-extra.json').then(r=>r.ok?r.json():({records:[]})).catch(()=>({records:[]})),
  ]).then(([core,extra])=>{
    const extras=new Map((extra.records||[]).map(r=>[String(r.cvegeo_ageb||''),r]))
    return localScored(unpackCore(core).filter(isUrban).map(r=>derive({...r,...(extras.get(String(r.cvegeo_ageb||''))||{})})))
  })
  return localRecordsPromise
}

async function remote(path,options={}){
  if(!API_BASE)throw new Error('API disabled')
  const key=path
  if(!options.noCache && cache.has(key))return cache.get(key)
  const response=await fetch(API_BASE+path,{headers:{Accept:'application/json'}})
  if(!response.ok)throw new Error('API '+response.status)
  const data=await response.json()
  if(!options.noCache)cache.set(key,data)
  return data
}

export function apiStatus(){
  return {base:API_BASE,connected:Boolean(API_BASE)}
}

export async function getRankings(metric='opportunity',limit=10){
  try{return await remote('/api/rankings?metric='+encodeURIComponent(metric)+'&limit='+limit)}
  catch{
    const records=await localRecords()
    const field={
      opportunity:'opportunity_score',
      population:'population',
      households:'households',
      adults:'adult_share',
      mobility:'recent_mobility_share',
      household_size:'household_size',
    }[metric]||'opportunity_score'
    const rows=[...records].sort((a,b)=>(Number(b[field])||0)-(Number(a[field])||0)).slice(0,limit)
    return {metric,rows,source:'local-fallback',methodology:metric==='opportunity'?'Proxy demográfico Growa; no es avalúo ni predicción de ventas.':'INEGI Censo 2020'}
  }
}

export async function searchLocations(q='',limit=8){
  try{return await remote('/api/locations?q='+encodeURIComponent(q)+'&limit='+limit)}
  catch{
    const term=q.trim().toLowerCase()
    const records=await localRecords()
    const rows=records.filter(r=>!term||r.id.toLowerCase().includes(term)||('ageb '+r.id.slice(-4)).includes(term)).slice(0,limit)
    return {rows,total:rows.length,source:'local-fallback'}
  }
}

export async function getLocation(id){
  try{return await remote('/api/locations/'+encodeURIComponent(id))}
  catch{
    const records=await localRecords()
    const location=records.find(r=>r.id===id)
    if(!location)throw new Error('Ubicación no encontrada')
    return {location,source:'local-fallback'}
  }
}

export async function compareLocations(ids=[]){
  const clean=ids.filter(Boolean).slice(0,3)
  if(!clean.length)return {rows:[]}
  try{return await remote('/api/compare?ids='+encodeURIComponent(clean.join(',')))}
  catch{
    const records=await localRecords()
    return {rows:clean.map(id=>records.find(r=>r.id===id)).filter(Boolean),source:'local-fallback'}
  }
}

export async function getMarketPulse(){
  try{return await remote('/api/market-pulse')}
  catch{
    const [pulse,finance]=await Promise.all([
      fetch('/data/market-pulse.json').then(r=>r.ok?r.json():null).catch(()=>null),
      fetch('/data/financing-summary.json').then(r=>r.ok?r.json():null).catch(()=>null),
    ])
    return {pulse,finance,source:'local-fallback'}
  }
}

export async function getProperties(limit=24,filters={}){
  const params=new URLSearchParams({limit:String(limit)})
  if(filters.type&&filters.type!=='Todos')params.set('type',filters.type)
  if(filters.minScore)params.set('min_score',String(filters.minScore))
  if(filters.minArea)params.set('min_area',String(filters.minArea))
  if(filters.maxArea)params.set('max_area',String(filters.maxArea))
  if(filters.minPriceM2)params.set('min_price_m2',String(filters.minPriceM2))
  if(filters.maxPriceM2)params.set('max_price_m2',String(filters.maxPriceM2))
  try{return await remote('/api/properties?'+params.toString(),{noCache:true})}
  catch{
    const records=(await localRecords()).sort((a,b)=>b.opportunity_score-a.opportunity_score).slice(0,100)
    const types=['Terreno','Uso mixto','Comercial','Residencial']
    let rows=records.map((r,i)=>{
      const factor=.82+((i*37)%17)/100
      const area=Math.round(500+(r.population%4200)*factor)
      const priceM2=Math.round(7500+(r.opportunity_score*170)+((i*997)%8000))
      return {
        id:'DEMO-'+r.id.slice(-6)+'-'+(i+1),
        location_id:r.id,
        type:types[i%types.length],
        title:'Oportunidad '+types[i%types.length].toLowerCase()+' · AGEB '+r.id.slice(-4),
        area_m2:area,
        price_m2:priceM2,
        estimated_value:area*priceM2,
        opportunity_score:r.opportunity_score,
        synthetic:true,
      }
    })
    rows=rows.filter(p=>
      (!filters.type||filters.type==='Todos'||p.type===filters.type) &&
      (!filters.minScore||p.opportunity_score>=filters.minScore) &&
      (!filters.minArea||p.area_m2>=filters.minArea) &&
      (!filters.maxArea||p.area_m2<=filters.maxArea) &&
      (!filters.minPriceM2||p.price_m2>=filters.minPriceM2) &&
      (!filters.maxPriceM2||p.price_m2<=filters.maxPriceM2)
    ).slice(0,limit)
    return {rows,total:rows.length,source:'local-fallback',synthetic:true}
  }
}

export async function getMarketSummary(){
  try{return await remote('/api/market-summary')}
  catch{
    const data=await getMarketPulse()
    const p=data.pulse||{}, f=data.finance||{}
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
      source_key:'local-fallback'
    }
  }
}

export async function getDistricts(q=''){
  try{return await remote('/api/districts?q='+encodeURIComponent(q))}
  catch{
    const geo=await fetch('/data/codesin-districts.geojson').then(r=>r.json())
    const rows=(geo.features||[]).map(f=>{
      const name=String(f.properties?.district||'Distrito')
      const slug=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
      return {name,slug,ageb_count:Number(f.properties?.ageb_count||0),population:null,households:null,opportunity_score:null}
    }).filter(d=>!q||d.name.toLowerCase().includes(q.toLowerCase()))
    return {rows,total:rows.length,source:'CODESIN'}
  }
}

export async function getDistrict(slug){
  try{return await remote('/api/districts/'+encodeURIComponent(slug))}
  catch{
    const all=await getDistricts()
    const district=(all.rows||[]).find(d=>d.slug===slug)
    if(!district)throw new Error('Distrito no encontrado')
    return {district,locations:[],source:'CODESIN'}
  }
}
