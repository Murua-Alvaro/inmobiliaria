import clipping from 'polygon-clipping'
export const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null
export const format=(v,d=0)=>numeric(v)===null?'Sin dato':Number(v).toLocaleString('es-MX',{maximumFractionDigits:d})
export const metrics=[
 ['pobtot','Población','personas','Demografía'],['tothog','Hogares','hogares','Demografía'],['p_18ymas','Población adulta','personas','Demografía'],
 ['vivpar_hab','Viviendas habitadas','viviendas','Vivienda'],['internet_pct','Viviendas con internet','%','Vivienda'],['agua_pct','Viviendas con agua','%','Vivienda'],['automovil_pct','Viviendas con automóvil','%','Vivienda'],
 ['pea','Población económicamente activa','personas','Economía'],['pocupada','Población ocupada','personas','Economía'],['establecimientos_2025','Establecimientos','unidades','Economía'],['empleo_estimado_denue','Empleo estimado DENUE','puestos estimados','Economía']
]
const counts=metrics.filter(m=>m[2]!=='%').map(m=>m[0]);const rates=metrics.filter(m=>m[2]==='%').map(m=>m[0])
let pending
export function loadTerritory(){
 if(!pending)pending=Promise.all(['ageb-core.json','ageb-profile-extra.json','ageb-geometry-2020.geojson','codesin-districts.geojson','developer-intelligence.json'].map(async name=>{const r=await fetch('/data/'+name);if(!r.ok)throw Error('No se pudo cargar '+name);return r.json()})).then(([core,extra,geo,districts,dev])=>{
 const extras=new Map(extra.records.map(r=>[r.cvegeo_ageb,r]));const services=new Map((dev.records||[]).map(r=>[r.cvegeo_ageb,r]));const rows=new Map(core.rows.map(r=>{const o=Object.fromEntries(core.columns.map((k,i)=>[k,r[i]]));return [o.cvegeo_ageb,{...o,...extras.get(o.cvegeo_ageb)}]}));
 return {agebs:geo.features.map(f=>{const id=f.properties.cvegeo_ageb;const values=rows.get(id)||{};for(const k of rates)if(numeric(values[k])===null||values[k]<0||values[k]>100||!(values.vivpar_hab>0))values[k]=null;return {...f,id,name:'AGEB '+id,values,services:services.get(id),members:[id],estimated:false}}),districts:districts.features,meta:dev.meta}
 }).catch(e=>{pending=null;throw e});return pending
}
const cos=Math.cos(23.25*Math.PI/180),R=6371008.8,rad=Math.PI/180
const project=([x,y])=>[(x+106.45)*rad*R*cos,(y-23.2)*rad*R]
const unproject=([x,y])=>[x/(rad*R*cos)-106.45,y/(rad*R)+23.2]
const multi=g=>g.type==='Polygon'?[g.coordinates]:g.coordinates
const transform=(p,fn)=>p.map(poly=>poly.map(r=>r.map(fn)))
function ringArea(r){let a=0;for(let i=0;i<r.length-1;i++)a+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return Math.abs(a)/2}
export const area=p=>p.reduce((s,poly)=>s+ringArea(poly[0])-poly.slice(1).reduce((x,r)=>x+ringArea(r),0),0)
const bounds=p=>{const pts=p.flat(2);return [Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]}
const overlaps=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1]
export function aggregate(parts){const values={};for(const k of counts){values[k]=parts.length&&parts.every(p=>numeric(p.row.values[k])!==null)?parts.reduce((s,p)=>s+p.row.values[k]*p.weight,0):null}for(const k of rates){const valid=parts.filter(p=>numeric(p.row.values[k])!==null&&p.row.values.vivpar_hab>0);const den=valid.reduce((s,p)=>s+p.row.values.vivpar_hab*p.weight,0);values[k]=valid.length===parts.length&&den>0?valid.reduce((s,p)=>s+p.row.values[k]*p.row.values.vivpar_hab*p.weight,0)/den:null}return values}
export function buildScale(data,scale){
 if(scale==='ageb')return data.agebs
 const sources=data.agebs.map(row=>{const poly=transform(multi(row.geometry),project);return {row,poly,area:area(poly),bounds:bounds(poly)}})
 let targets=[]
 if(scale==='district')targets=data.districts.map((f,i)=>({id:'district-'+i,name:f.properties.district,poly:transform(multi(f.geometry),project)}))
 else {const size=Number(scale);if(![500,1000,1500].includes(size))throw Error('Escala no válida');const cells=new Map();for(const s of sources){const [x0,y0,x1,y1]=s.bounds;for(let x=Math.floor(x0/size);x<=Math.floor(x1/size);x++)for(let y=Math.floor(y0/size);y<=Math.floor(y1/size);y++){const id=`grid-${size}-${x}-${y}`;if(!cells.has(id)){const a=x*size,b=y*size;cells.set(id,{id,name:`Celda ${x}, ${y} · ${size} m`,poly:[[[[a,b],[a+size,b],[a+size,b+size],[a,b+size],[a,b]]]]})}}}targets=[...cells.values()]}
 return targets.flatMap(t=>{const box=bounds(t.poly);const parts=[];for(const s of sources){if(!overlaps(box,s.bounds)||s.area<=0)continue;const a=area(clipping.intersection(t.poly,s.poly));if(a>0.01)parts.push({row:s.row,weight:Math.min(1,a/s.area)})}if(!parts.length)return [];return [{type:'Feature',id:t.id,name:t.name,geometry:{type:'MultiPolygon',coordinates:transform(t.poly,unproject)},properties:{},values:aggregate(parts),members:parts.map(p=>p.row.id),estimated:true}]})
}
function inRing([x,y],r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside}return inside}
export function contains(geometry,point){return multi(geometry).some(p=>inRing(point,p[0])&&!p.slice(1).some(r=>inRing(point,r)))}
export function download(name,data,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
