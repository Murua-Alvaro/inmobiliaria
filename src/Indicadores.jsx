import React, { useMemo, useRef, useState } from 'react'
import { indicatorsData as D } from './indicadoresData.js'
import { allMaterials } from './materialesFull.js'
import './indicadores.css'
import './scrollFix.css'

const fmt=(v,d=1)=>Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d})
const signed=(v,d=1)=>`${Number(v)>=0?'+':''}${fmt(v,d)}%`
const months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const shortDate=value=>{const [y,m]=String(value||'').split('-').map(Number);return Number.isFinite(y)&&Number.isFinite(m)?`${months[m-1]} ${String(y).slice(-2)}`:String(value||'')}
const cleanName=name=>String(name||'').replace(/^\d+\.\s*/,'')

const MODES={
  y:{label:'Inflación anual',short:'Inflación 12m',key:'y',suffix:'%',digits:1,reference:5},
  i:{label:'Nivel del índice',short:'Índice',key:'i',suffix:'',digits:1,reference:null},
  m:{label:'Cambio mensual',short:'Cambio mensual',key:'m',suffix:'%',digits:1,reference:1},
}
const PERIODS={
  '24':{label:'Últimos 24 meses',months:24},
  '36':{label:'Últimos 36 meses',months:36},
  '60':{label:'Últimos 5 años',months:60},
  all:{label:'Serie completa',months:null},
}
const RANKS={
  y:{label:'Inflación 12m',key:'y',format:v=>signed(v,1)},
  v:{label:'Volatilidad 12m',key:'v',format:v=>`${fmt(v,2)} pp`},
  s22:{label:'Acumulado desde 2022',key:'s22',format:v=>signed(v,1)},
  p95:{label:'P95 mensual',key:'p95',format:v=>signed(v,1)},
  up:{label:'Frecuencia de aumentos',key:'up',format:v=>`${fmt(v,1)}%`},
}

function riskLevel(row){
  if(!row) return 'baja'
  if(Number(row.y)>=10||Number(row.v)>=4||Number(row.p95)>=5) return 'alta'
  if(Number(row.y)>=5||Number(row.v)>=1.5||Number(row.p95)>=3) return 'media'
  return 'baja'
}
function riskLabel(level){return level==='alta'?'alto':level==='media'?'medio':'bajo'}

function Metric({label,value,note,emphasis=false}){
  return <div className={`ix-metric${emphasis?' emphasis':''}`}><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>
}

function TrendChart({data,mode}){
  const [hover,setHover]=useState(null)
  const cfg=MODES[mode]
  const w=1040,h=330,left=58,right=24,top=22,bottom=40
  const values=data.map(d=>Number(d[cfg.key])).filter(Number.isFinite)
  const referenceValues=cfg.reference===null?values:[...values,cfg.reference]
  const rawMin=Math.min(...referenceValues),rawMax=Math.max(...referenceValues)
  const rawRange=rawMax-rawMin||1,pad=rawRange*.14,min=rawMin-pad,max=rawMax+pad,range=max-min||1
  const x=i=>left+(i/(data.length-1||1))*(w-left-right)
  const y=v=>top+(1-(v-min)/range)*(h-top-bottom)
  const points=data.map((d,i)=>`${x(i)},${y(Number(d[cfg.key]))}`).join(' ')
  const ticks=Array.from({length:5},(_,i)=>max-(i/4)*(max-min))
  const xIdx=[0,Math.round((data.length-1)*.25),Math.round((data.length-1)*.5),Math.round((data.length-1)*.75),data.length-1]
  const hovered=hover===null?null:data[hover]
  const formatValue=v=>cfg.suffix==='%'?signed(v,cfg.digits):fmt(v,cfg.digits)
  const onMove=e=>{
    const rect=e.currentTarget.getBoundingClientRect()
    const local=((e.clientX-rect.left)/rect.width)*w
    const ratio=(local-left)/(w-left-right)
    const idx=Math.max(0,Math.min(data.length-1,Math.round(ratio*(data.length-1))))
    setHover(idx)
  }
  if(!data.length) return null
  return <div className="ix-chart-pro">
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${cfg.label} de materiales de construcción`} onMouseMove={onMove} onMouseLeave={()=>setHover(null)}>
      {ticks.map((t,i)=><g key={i}><line x1={left} y1={y(t)} x2={w-right} y2={y(t)} className="ix-chart-grid"/><text x={left-10} y={y(t)+3} textAnchor="end" className="ix-y-label">{cfg.suffix==='%'?`${fmt(t,1)}%`:fmt(t,1)}</text></g>)}
      {cfg.reference!==null&&cfg.reference>=min&&cfg.reference<=max?<line x1={left} y1={y(cfg.reference)} x2={w-right} y2={y(cfg.reference)} className="ix-reference"/>:null}
      <polyline points={points} className="ix-trend-line" fill="none" vectorEffect="non-scaling-stroke"/>
      {xIdx.map(i=><text key={i} x={x(i)} y={h-10} textAnchor={i===0?'start':i===data.length-1?'end':'middle'} className="ix-x-label">{shortDate(data[i]?.d)}</text>)}
      {hovered?<g><line x1={x(hover)} y1={top} x2={x(hover)} y2={h-bottom} className="ix-hover-line"/><circle cx={x(hover)} cy={y(Number(hovered[cfg.key]))} r="5" className="ix-hover-dot"/></g>:null}
    </svg>
    <div className="ix-chart-foot"><span>{PERIODS.all.label==='Serie completa'?'Pasa el cursor para consultar un mes exacto.':''}</span>{hovered?<strong>{shortDate(hovered.d)} · {formatValue(hovered[cfg.key])}</strong>:<strong>{shortDate(data.at(-1).d)} · {formatValue(data.at(-1)[cfg.key])}</strong>}</div>
  </div>
}

function Control({label,children,wide=false}){
  return <label className={`ix-control${wide?' wide':''}`}><span>{label}</span>{children}</label>
}

function Ranking({rows,metric,onSelect}){
  const cfg=RANKS[metric]
  const max=Math.max(...rows.map(r=>Math.abs(Number(r[cfg.key]||0))),1)
  return <div className="ix-rank-list">{rows.map((row,i)=>{
    const value=Number(row[cfg.key]||0)
    return <button type="button" className="ix-rank" key={row.n} onClick={()=>onSelect(row.n)}>
      <span className="ix-rank-num">{String(i+1).padStart(2,'0')}</span>
      <div className="ix-rank-copy"><strong>{cleanName(row.n)}</strong><i><em style={{width:`${Math.max(2,Math.abs(value)/max*100)}%`}}/></i></div>
      <b>{cfg.format(value)}</b>
      <span className={`ix-risk-dot ${riskLevel(row)}`} title={`Riesgo ${riskLabel(riskLevel(row))}`}/>
    </button>
  })}</div>
}

export default function Indicadores(){
  const [materialName,setMaterialName]=useState('')
  const [chartMode,setChartMode]=useState('y')
  const [period,setPeriod]=useState('60')
  const [materialQuery,setMaterialQuery]=useState('')
  const [seriesType,setSeriesType]=useState('all')
  const [riskFilter,setRiskFilter]=useState('all')
  const [sortBy,setSortBy]=useState('y')
  const [sortDirection,setSortDirection]=useState('desc')
  const [rankMetric,setRankMetric]=useState('y')
  const [rankLimit,setRankLimit]=useState(10)
  const detailRef=useRef(null)
  const catalogRef=useRef(null)

  const selected=useMemo(()=>allMaterials.find(x=>x.n===materialName)||null,[materialName])
  const pressureWindow=useMemo(()=>PERIODS[period].months?D.pressure.slice(-PERIODS[period].months):D.pressure,[period])
  const latest=D.pressure.at(-1)
  const yearAgo=D.pressure.find(x=>x.d==='2025-08')||D.pressure.at(-13)
  const ytdBase=D.pressure.find(x=>x.d==='2026-01')
  const ytd=ytdBase?(latest.i/ytdBase.i-1)*100:0
  const accel=latest.y-yearAgo.y
  const recentLow=D.pressure.slice(-24).reduce((a,b)=>Number(b.y)<Number(a.y)?b:a,D.pressure.at(-1))
  const pressureLabel=latest.y>=8?'Presión alta':latest.y>=5?'Presión en aumento':latest.y>=2?'Presión moderada':'Presión baja'

  const riskCounts=useMemo(()=>allMaterials.reduce((acc,row)=>{acc[riskLevel(row)]++;return acc},{alta:0,media:0,baja:0}),[])
  const filteredMaterials=useMemo(()=>{
    const q=materialQuery.trim().toLocaleLowerCase('es-MX')
    return allMaterials.filter(row=>{
      if(q&&!row.n.toLocaleLowerCase('es-MX').includes(q)) return false
      const isFamily=/^\d+\./.test(row.n)
      if(seriesType==='family'&&!isFamily) return false
      if(seriesType==='detail'&&isFamily) return false
      if(riskFilter!=='all'&&riskLevel(row)!==riskFilter) return false
      return true
    }).sort((a,b)=>{
      const delta=Number(b[sortBy]||0)-Number(a[sortBy]||0)
      return sortDirection==='desc'?delta:-delta
    })
  },[materialQuery,seriesType,riskFilter,sortBy,sortDirection])
  const ranked=useMemo(()=>[...allMaterials].sort((a,b)=>Number(b[rankMetric]||0)-Number(a[rankMetric]||0)).slice(0,rankLimit),[rankMetric,rankLimit])

  const selectMaterial=name=>{
    setMaterialName(name)
    setTimeout(()=>detailRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),40)
  }
  const chooseRisk=level=>{
    setRiskFilter(current=>current===level?'all':level)
    setTimeout(()=>catalogRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),40)
  }

  return <main className="ix-page">
    <section className="ix-control-deck">
      <div className="ix-control-intro"><span>INDICADORES / CONTROL ANALÍTICO</span><strong>Costos e insumos de construcción.</strong><p>Selecciona una métrica, explora el ranking o abre directamente la ficha de un material.</p></div>
      <div className="ix-controls-grid">
        <Control label="Periodo de gráfica"><select value={period} onChange={e=>setPeriod(e.target.value)}>{Object.entries(PERIODS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Control>
        <Control label="Métrica de gráfica"><select value={chartMode} onChange={e=>setChartMode(e.target.value)}>{Object.entries(MODES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Control>
        <Control label="Abrir material" wide><select value={materialName} onChange={e=>e.target.value&&selectMaterial(e.target.value)}><option value="">Selecciona un material…</option>{allMaterials.map(x=><option key={x.n} value={x.n}>{cleanName(x.n)}</option>)}</select></Control>
        <Control label="Ranking"><select value={rankMetric} onChange={e=>setRankMetric(e.target.value)}>{Object.entries(RANKS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Control>
      </div>
    </section>

    <section className="ix-pulse">
      <div className="ix-pulse-copy"><span>PULSO DE COSTOS · AGOSTO 2026</span><strong>Los materiales vuelven a acelerar.</strong><p>La inflación anual del subíndice de materiales llegó a <b>{signed(latest.y,2)}</b>, frente a <b>{signed(yearAgo.y,2)}</b> un año antes. La aceleración interanual es de <b>{fmt(accel,2)} pp</b>.</p></div>
      <div className="ix-pulse-metrics"><Metric label="Inflación anual" value={signed(latest.y,2)} note="materiales" emphasis/><Metric label="Aceleración 12m" value={`${fmt(accel,2)} pp`} note="vs ago 2025"/><Metric label="Cambio mensual" value={signed(latest.m,2)} note="último dato"/><Metric label="2026 acumulado" value={signed(ytd,2)} note="ene–ago"/></div>
    </section>

    <section className="ix-card ix-pressure-card">
      <div className="ix-card-head ix-card-head--chart"><div><span>01 · TRAYECTORIA</span><h2>Presión de costos de construcción.</h2><p>Cambia la métrica y el periodo; pasa el cursor por la serie para leer cada mes.</p></div><div className="ix-mode-tabs">{Object.entries(MODES).map(([key,cfg])=><button type="button" key={key} className={chartMode===key?'active':''} onClick={()=>setChartMode(key)}>{cfg.short}</button>)}</div></div>
      <div className="ix-chart-layout"><TrendChart data={pressureWindow} mode={chartMode}/><aside className="ix-chart-read"><span>LECTURA ACTUAL</span><h3>{pressureLabel}</h3><p>El ritmo anual se ha re-acelerado desde el mínimo reciente de <b>{signed(recentLow.y,2)}</b> en {shortDate(recentLow.d)}.</p><div className="ix-read-grid"><div><span>Actual</span><strong>{signed(latest.y,2)}</strong></div><div><span>Hace 12m</span><strong>{signed(yearAgo.y,2)}</strong></div><div><span>Mensual</span><strong>{signed(latest.m,2)}</strong></div><div><span>Volatilidad</span><strong>{fmt(latest.v,2)} pp</strong></div></div><details className="ix-mini-details"><summary>Cómo leer estas métricas</summary><p>La inflación anual mide el cambio respecto al mismo mes del año anterior. El cambio mensual captura el movimiento inmediato y la volatilidad resume la dispersión reciente.</p></details></aside></div>
    </section>

    {selected?<section ref={detailRef} className="ix-card ix-material-sheet">
      <div className="ix-sheet-head"><div><span>02 · FICHA DEL MATERIAL</span><h2>{cleanName(selected.n)}</h2><p>Información propia de la serie seleccionada. No se genera una comparación automática con otros insumos.</p></div><span className={`ix-risk-badge ${riskLevel(selected)}`}>Riesgo descriptivo {riskLabel(riskLevel(selected))}</span></div>
      <div className="ix-material-focus"><Metric label="Índice actual" value={fmt(selected.i,2)} note="nivel relativo" emphasis/><Metric label="Inflación 12m" value={signed(selected.y,2)} note="ritmo actual"/><Metric label="Desde ene 2022" value={signed(selected.s22,2)} note="acumulado"/><Metric label="Volatilidad 12m" value={`${fmt(selected.v,2)} pp`} note="dispersión mensual"/><Metric label="P95 mensual" value={signed(selected.p95,2)} note="mes adverso de referencia"/></div>
      <div className="ix-sheet-grid"><div><span>Meses con alza</span><strong>{fmt(selected.up,1)}%</strong><small>frecuencia histórica</small></div><div><span>Mejor mes histórico</span><strong>{signed(selected.best,2)}</strong><small>máximo aumento mensual</small></div><div><span>Peor mes histórico</span><strong>{signed(selected.worst,2)}</strong><small>mayor caída mensual</small></div><div><span>Cobertura</span><strong>{selected.start}</strong><small>hasta {selected.end}</small></div></div>
      <details className="ix-sheet-method"><summary>Interpretación y metodología de esta ficha</summary><div><p><b>Inflación 12m:</b> variación porcentual frente al mismo mes del año anterior.</p><p><b>Volatilidad 12m:</b> dispersión de los movimientos mensuales recientes; valores mayores implican una trayectoria menos estable.</p><p><b>P95 mensual:</b> umbral que deja por debajo aproximadamente 95% de los cambios mensuales observados en la serie.</p><p><b>Riesgo descriptivo:</b> etiqueta de navegación construida con inflación, volatilidad y P95. No es una predicción ni una recomendación financiera.</p></div></details>
    </section>:<section className="ix-card ix-empty-material"><span>02 · FICHA DEL MATERIAL</span><h2>Selecciona un insumo para abrir su información.</h2><p>Puedes hacerlo desde el desplegable superior, el ranking o el catálogo.</p></section>}

    <section className="ix-card ix-ranking-card">
      <div className="ix-card-head"><div><span>03 · RANKING DINÁMICO</span><h2>Ordena los insumos por la métrica que te interese.</h2><p>Haz clic en una fila y se abrirá directamente la ficha de ese material.</p></div><div className="ix-inline-controls"><label><span>Métrica</span><select value={rankMetric} onChange={e=>setRankMetric(e.target.value)}>{Object.entries(RANKS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label><label><span>Mostrar</span><select value={rankLimit} onChange={e=>setRankLimit(Number(e.target.value))}><option value={6}>Top 6</option><option value={10}>Top 10</option><option value={15}>Top 15</option></select></label></div></div>
      <Ranking rows={ranked} metric={rankMetric} onSelect={selectMaterial}/>
    </section>

    <section className="ix-card ix-risk-map">
      <div className="ix-card-head"><div><span>04 · MAPA DE RIESGO</span><h2>Resumen de presión entre las series.</h2><p>Usa los niveles como filtro rápido del catálogo.</p></div></div>
      <div className="ix-risk-grid"><button type="button" className={riskFilter==='alta'?'active':''} onClick={()=>chooseRisk('alta')}><span>Riesgo alto</span><strong>{riskCounts.alta}</strong><small>series</small></button><button type="button" className={riskFilter==='media'?'active':''} onClick={()=>chooseRisk('media')}><span>Riesgo medio</span><strong>{riskCounts.media}</strong><small>series</small></button><button type="button" className={riskFilter==='baja'?'active':''} onClick={()=>chooseRisk('baja')}><span>Riesgo bajo</span><strong>{riskCounts.baja}</strong><small>series</small></button></div>
      <details className="ix-mini-details ix-risk-method"><summary>Cómo se construye el nivel de riesgo</summary><p>La etiqueta combina inflación interanual, volatilidad y P95 para organizar el catálogo. Sirve para explorar series con distinta presión observada; no estima probabilidad de pérdidas ni sustituye un presupuesto de obra.</p></details>
    </section>

    <section ref={catalogRef} className="ix-card ix-catalog">
      <div className="ix-card-head"><div><span>05 · CATÁLOGO</span><h2>Explora todos los materiales e insumos.</h2><p>Busca, filtra y ordena; seleccionar una fila abre su ficha completa.</p></div><small>{filteredMaterials.length} de {allMaterials.length} series</small></div>
      <div className="ix-catalog-tools"><input value={materialQuery} onChange={e=>setMaterialQuery(e.target.value)} placeholder="Buscar cemento, varilla, pintura, cable…"/><select value={seriesType} onChange={e=>setSeriesType(e.target.value)}><option value="all">Todas las series</option><option value="family">Familias</option><option value="detail">Materiales específicos</option></select><select value={riskFilter} onChange={e=>setRiskFilter(e.target.value)}><option value="all">Todos los riesgos</option><option value="alta">Riesgo alto</option><option value="media">Riesgo medio</option><option value="baja">Riesgo bajo</option></select><select value={sortBy} onChange={e=>setSortBy(e.target.value)}>{Object.entries(RANKS).map(([k,v])=><option key={k} value={k}>Ordenar: {v.label}</option>)}</select><button type="button" onClick={()=>setSortDirection(v=>v==='desc'?'asc':'desc')}>{sortDirection==='desc'?'Mayor → menor':'Menor → mayor'}</button></div>
      <div className="ix-catalog-table"><div className="ix-catalog-row head"><span>Material</span><span>12m</span><span>Volatilidad</span><span>Desde 2022</span><span>P95</span><span>Alzas</span></div>{filteredMaterials.map(row=><button type="button" className={`ix-catalog-row${row.n===materialName?' active':''}`} key={row.n} onClick={()=>selectMaterial(row.n)}><strong>{cleanName(row.n)}</strong><span>{signed(row.y,1)}</span><span>{fmt(row.v,2)} pp</span><span>{signed(row.s22,1)}</span><span>{signed(row.p95,1)}</span><span>{fmt(row.up,1)}%</span></button>)}</div>
    </section>

    <section className="ix-card ix-methodology">
      <div className="ix-card-head"><div><span>06 · METODOLOGÍA</span><h2>Documentación sin saturar la pantalla.</h2><p>Abre solo el bloque que necesites.</p></div></div>
      <div className="ix-method-grid"><details><summary>Fuente y cobertura</summary><p>Los indicadores se construyen con series del INPP disponibles en el paquete integrado, con corte a agosto de 2026. La cobertura temporal varía entre insumos.</p></details><details><summary>Qué representa un índice</summary><p>El índice muestra evolución relativa respecto a una base estadística. No equivale a pesos por metro cuadrado ni a una cotización de proveedor.</p></details><details><summary>Volatilidad y P95</summary><p>La volatilidad resume la dispersión de cambios mensuales. El P95 funciona como referencia de un movimiento mensual alto dentro de la distribución observada.</p></details><details><summary>Uso de la información</summary><p>La página está diseñada para exploración de costos, seguimiento de presión y priorización de insumos que requieren revisión más frecuente.</p></details></div>
    </section>

    <footer className="ix-footer"><span>INPP · corte agosto 2026</span><p>Los índices muestran evolución relativa y no sustituyen precios observados, cotizaciones de proveedor ni presupuestos ejecutivos de obra.</p></footer>
  </main>
}
