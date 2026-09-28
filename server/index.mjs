import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PORT=Number(process.env.PORT||3001)
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||'*'
const UPSTREAM='https://growa-territorial.onrender.com/data/territories/mx-sin-mazatlan/inmobiliario'
const LOCAL_DATA=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/data')

let state={loadedAt:null,records:[],marketPulse:null,finance:null,urbanFootprint:null,source:'unloaded'}
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
async function load(){
  if(loading)return loading
  loading=(async()=>{
    const [core,extra,marketPulse,finance,urbanFootprint]=await Promise.all([
      loadJson('ageb-core.json'),
      loadJson('ageb-profile-extra.json',true),
      loadJson('market-pulse.json',true),
      loadJson('financing-summary.json',true),
      loadJson('agebs-huella-urbana.json',true),
    ])
    const extras=new Map((extra?.records||[]).map(r=>[String(r.cvegeo_ageb||''),r]))
    const records=score(unpackCore(core).filter(isUrban).map(r=>derive({...r,...(extras.get(String(r.cvegeo_ageb||''))||{})})))
    state={loadedAt:new Date().toISOString(),records,marketPulse,finance,urbanFootprint,source:'growa-territorial'}
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

function syntheticProperties(records,limit=24){
  const types=['Terreno','Uso mixto','Comercial','Residencial']
  return [...records].sort((a,b)=>b.opportunity_score-a.opportunity_score).slice(0,limit).map((r,i)=>{
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
      disclaimer:'Activo simulado para diseño y pruebas; no representa una propiedad u oferta real.',
    }
  })
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
    if(url.pathname==='/api/meta'){
      return json(req,res,200,{
        territory:'Mazatlán, Sinaloa',
        locations:state.records.length,
        loaded_at:state.loadedAt,
        source:state.source,
        opportunity_method:'Proxy demográfico normalizado P10–P90: población 32%, hogares 26%, adultos 14%, movilidad reciente 16%, origen externo 12%. No es avalúo ni predicción de ventas.'
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
    if(url.pathname==='/api/properties'){
      const limit=parseLimit(url.searchParams.get('limit'),24,50)
      return json(req,res,200,{rows:syntheticProperties(state.records,limit),synthetic:true,source:'derived-demo'})
    }
    return json(req,res,404,{error:'Ruta no encontrada'},'no-store')
  }catch(error){
    console.error(error)
    return json(req,res,500,{error:'Error interno',detail:process.env.NODE_ENV==='production'?undefined:String(error)},'no-store')
  }
})

server.listen(PORT,async()=>{
  console.log('[api] listening on',PORT)
  try{await load();console.log('[api] loaded',state.records.length,'locations')}
  catch(e){console.error('[api] initial load failed',e)}
})
