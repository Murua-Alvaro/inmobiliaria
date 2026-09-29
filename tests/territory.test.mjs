import assert from 'node:assert/strict'
import fs from 'node:fs'
import {buildScale,aggregate,contains} from '../src/territorialData.js'
import {validateProperty,parsePortfolio,serializePortfolio} from '../src/portfolioStore.js'
const read=n=>JSON.parse(fs.readFileSync('public/data/'+n,'utf8'))
const core=read('ageb-core.json'),extra=new Map(read('ageb-profile-extra.json').records.map(r=>[r.cvegeo_ageb,r]));const rows=new Map(core.rows.map(r=>{const v=Object.fromEntries(core.columns.map((k,i)=>[k,r[i]]));return [v.cvegeo_ageb,{...v,...extra.get(v.cvegeo_ageb)}]}));const data={agebs:read('ageb-geometry-2020.geojson').features.map(f=>({...f,id:f.properties.cvegeo_ageb,values:rows.get(f.properties.cvegeo_ageb)})),districts:read('codesin-districts.geojson').features}
const original=data.agebs.reduce((s,r)=>s+r.values.pobtot,0)
for(const scale of ['500','1000','1500']){const start=Date.now();const cells=buildScale(data,scale);const total=cells.reduce((s,r)=>s+r.values.pobtot,0);assert(Math.abs(total-original)<1,`${scale}: lost population ${original-total}`);assert(cells.every(r=>r.estimated&&r.members.length));console.log(scale,cells.length,'cells; population conservation',total,'ms',Date.now()-start)}
const districts=buildScale(data,'district');assert.equal(districts.length,data.districts.length);console.log('Districts:',districts.length)
assert.equal(aggregate([{row:{values:{pobtot:null}},weight:.5},{row:{values:{pobtot:100}},weight:.5}]).pobtot,null)
const hole={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]]};assert(contains(hole,[.5,.5]));assert(!contains(hole,[2,2]));assert(!contains(hole,[5,5]));
const p=validateProperty({id:'test',name:'Propiedad',type:'Casa',operation:'Venta',status:'Disponible',price:'1000000',area:'100',ageb:'2501200013909'});assert.equal(p.lat,null);assert.equal(p.price,1000000);assert.deepEqual(parsePortfolio(serializePortfolio([p])),[p]);assert.throws(()=>validateProperty({...p,price:'foo'}));assert.throws(()=>validateProperty({...p,lat:23}));assert.throws(()=>parsePortfolio(serializePortfolio([p,p])));console.log('Geometry, missing values, and portfolio validation passed')
