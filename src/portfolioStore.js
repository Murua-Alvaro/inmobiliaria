export const KEY='growa_agency_portfolio_v1'
export function validateProperty(p){
 if(!p||typeof p!=='object')throw Error('Registro de propiedad inválido.')
 const text=(k,max=160)=>String(p[k]??'').trim().slice(0,max)
 const number=k=>p[k]===null||p[k]===undefined||String(p[k]).trim()===''?null:Number(p[k])
 const out={id:text('id',80)||crypto.randomUUID(),name:text('name'),address:text('address',300),type:text('type'),operation:text('operation'),status:text('status'),price:number('price'),area:number('area'),ageb:text('ageb',13),lat:number('lat'),lon:number('lon'),notes:text('notes',2000)}
 if(!out.name)throw Error('Escribe el nombre de la propiedad.')
 if(!['Departamento','Casa','Terreno','Local','Oficina','Desarrollo'].includes(out.type))throw Error('Tipo de propiedad inválido.')
 if(!['Venta','Renta'].includes(out.operation)||!['Disponible','Reservada','Cerrada'].includes(out.status))throw Error('Operación o estado inválido.')
 for(const k of ['price','area'])if(out[k]!==null&&(!Number.isFinite(out[k])||out[k]<=0))throw Error('El precio y la superficie deben ser mayores que cero o quedar vacíos.')
 if((out.lat===null)!==(out.lon===null))throw Error('Completa latitud y longitud.')
 if(out.lat!==null&&(!Number.isFinite(out.lat)||!Number.isFinite(out.lon)||Math.abs(out.lat)>90||Math.abs(out.lon)>180))throw Error('Coordenadas inválidas.')
 if(out.ageb&&!/^\d{12}[\dA-Z]$/.test(out.ageb))throw Error('Clave AGEB inválida.')
 return out
}
export function readPortfolio(){const raw=localStorage.getItem(KEY);if(!raw)return [];return parsePortfolio(raw)}
export function parsePortfolio(raw){const d=JSON.parse(raw);if(d.version!==1||!Array.isArray(d.properties)||d.properties.length>5000)throw Error('El archivo no es un respaldo Growa válido (máximo 5,000 propiedades).');const rows=d.properties.map(validateProperty);if(new Set(rows.map(p=>p.id)).size!==rows.length)throw Error('El respaldo contiene identificadores repetidos.');return rows}
export const serializePortfolio=properties=>JSON.stringify({version:1,exportedAt:new Date().toISOString(),properties},null,2)
