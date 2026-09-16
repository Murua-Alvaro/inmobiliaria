import React, { useMemo, useState } from 'react'
import { indicatorsData as D } from './indicadoresData.js'
import { allMaterials } from './materialesFull.js'
import './indicadores.css'
import './scrollFix.css'

const fmt=(v,d=1)=>Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d})
const signed=(v,d=1)=>`${Number(v)>=0?'+':''}${fmt(v,d)}%`
const pp=(v,d=1)=>`${Number(v)>=0?'+':''}${fmt(v,d)} pp`
const months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const shortDate=value=>{const [y,m]=String(value||'').split('-').map(Number);return Number.isFinite(y)&&Number.isFinite(m)?`${months[m-1]} ${String(y).slice(-2)}`:String(value||'')}
const cleanName=name=>String(name||'').replace(/^\d+\.\s*/,'')
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))

const MODES={
  y:{label:'Inflación anual',short:'12m',key:'y',digits:1,suffix:'%',reference:5,referenceLabel:'referencia 5%'},
  i:{label:'Nivel del índice',short:'índice',key:'i',digits:1,suffix:'',reference:null,referenceLabel:''},
  m:{label:'Cambio mensual',short:'mensual',key:'m',digits:1,suffix:'%',reference:1,referenceLabel:'referencia 1% mensual'},
}

const PERIODS={
  24:{label:'24 meses',months:24},
  36:{label:'36 meses',months:36},
  60:{label:'5 años',months:60},
  all:{label:'Serie completa',months:null},
}

const RANKS={
  y:{label:'Inflación 12m',key:'y',help:'presión actual',format:v=>signed(v,1)},
  v:{label:'Volatilidad 12m',key:'v',help:'incertidumbre mensual',format:v=>`${fmt(v,2)} pp`},
  s22:{label:'Acumulado desde 2022',key:'s22',help:'cambio del índice',format:v=>signed(v,1)},
  p95:{label:'P95 mensual',key:'p95',help:'mes adverso de referencia',format:v=>signed(v,2)},
  up:{label:'Frecuencia de alza',key:'up',help:'meses con incremento',format:v=>`${fmt(v,1)}%`},
}

function Metric({label,value,note,emphasis=false,tone=''}){
  return <div className={`ix-metric${emphasis?' emphasis':''}${tone?` tone-${tone}`:''}`}><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>
}

function riskLevel(row){
  const y=Number(row?.y||0),v=Number(row?.v||0),p95=Number(row?.p95||0)
  if(y>=10||v>=4||p95>=6) return 'alta'
  if(y>=5||v>=1.5||p95>=3) return 'media'
  return 'baja'
}

function riskLabel(level){return level==='alta'?'Alta':level==='media'?'Media':'Baja'}

function TrendChart({data,mode}){
  const [hoverIndex,setHoverIndex]=useState(null)
  const cfg=MODES[mode]
  if(!data?.length) return null
  const w=1040,h=320,left=58,right=24,top=22,bottom=38
  const values=data.map(d=>Number(d[cfg.key])).filter(Number.isFinite)
  const rawMin=Math.min(...values,cfg.reference??Infinity),rawMax=Math.max(...values,cfg.reference??-Infinity)
  const rawRange=rawMax-rawMin||1,pad=rawRange*.14,min=rawMin-pad,max=rawMax+pad,range=max-min||1
  const x=i=>left+(i/(data.length-1||1))*(w-left-right),y=v=>top+(1-(v-min)/range)*(h-top-bottom)
  const points=data.map((d,i)=>`${x(i)},${y(Number(d[cfg.key]))}`).join(' ')
  const area=`${left},${h-bottom} ${points} ${w-right},${h-bottom}`
  const ticks=Array.from({length:5},(_,i)=>max-(i/4)*(max-min))
  const xIdx=[0,Math.round((data.length-1)*.25),Math.round((data.length-1)*.5),Math.round((data.length-1)*.75),data.length-1]
  const latest=data.at(-1),maxRow=data.reduce((a,b)=>Number(b[cfg.key])>Number(a[cfg.key])?b:a,data[0]),minRow=data.reduce((a,b)=>Number(b[cfg.key])<Number(a[cfg.key])?b:a,data[0])
  const maxIdx=data.indexOf(maxRow),minIdx=data.indexOf(minRow),formatVal=v=>cfg.suffix==='%'?signed(v,cfg.digits):fmt(v,cfg.digits)
  const focusIndex=hoverIndex===null?data.length-1:hoverIndex
  const focus=data[focusIndex]
  const fx=x(focusIndex),fy=y(Number(focus[cfg.key]))
  const boxX=clamp(fx+(fx>w*.72?-170:14),left+4,w-right-160)
  const boxY=clamp(fy-52,top+4,h-bottom-60)

  return <div className="ix-chart-pro">
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${cfg.label} de materiales de construcción`} onMouseLeave={()=>setHoverIndex(null)}>
      <defs><linearGradient id={`area-${mode}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#111" stopOpacity=".09"/><stop offset="100%" stopColor="#111" stopOpacity=".01"/></linearGradient></defs>
      {ticks.map((t,i)=><g key={i}><line x1={left} y1={y(t)} x2={w-right} y2={y(t)} className="ix-chart-grid"/><text x={left-10} y={y(t)+3} textAnchor="end" className="ix-y-label">{cfg.suffix==='%'?`${fmt(t,1)}%`:fmt(t,1)}</text></g>)}
      {cfg.reference!==null&&cfg.reference>=min&&cfg.reference<=max?<g><line x1={left} y1={y(cfg.reference)} x2={w-right} y2={y(cfg.reference)} className="ix-reference"/><text x={w-right} y={y(cfg.reference)-7} textAnchor="end" className="ix-ref-label">{cfg.referenceLabel}</text></g>:null}
      <polygon points={area} fill={`url(#area-${mode})`}/><polyline points={points} className="ix-trend-line" fill="none" vectorEffect="non-scaling-stroke"/>
      <circle cx={x(maxIdx)} cy={y(Number(maxRow[cfg.key]))} r="3.2" className="ix-extreme-dot"/><circle cx={x(minIdx)} cy={y(Number(minRow[cfg.key]))} r="3.2" className="ix-extreme-dot"/>
      {data.map((d,i)=><circle key={`${d.d}-${i}`} cx={x(i)} cy={y(Number(d[cfg.key]))} r="10" className="ix-hit-dot" onMouseEnter={()=>setHoverIndex(i)} />)}
      <line x1={fx} y1={top} x2={fx} y2={h-bottom} className="ix-focus-line"/>
      <circle cx={fx} cy={fy} r="5.3" className="ix-last-dot"/><circle cx={fx} cy={fy} r="9.5" className="ix-last-ring"/>
      <g className="ix-svg-tip" transform={`translate(${boxX},${boxY})`}><rect width="150" height="48" rx="7"/><text x="11" y="17">{shortDate(focus.d)}</text><text x="11" y="36" className="ix-svg-tip-value">{formatVal(focus[cfg.key])}</text></g>
      {xIdx.map(i=><text key={i} x={x(i)} y={h-10} textAnchor={i===0?'start':i===data.length-1?'end':'middle'} className="ix-x-label">{shortDate(data[i]?.d)}</text>)}
    </svg>
    <div className="ix-chart-extremes"><span>Máximo <b>{formatVal(maxRow[cfg.key])}</b> · {shortDate(maxRow.d)}</span><span>Último <b>{formatVal(latest[cfg.key])}</b> · {shortDate(latest.d)}</span><span>Mínimo <b>{formatVal(minRow[cfg.key])}</b> · {shortDate(minRow.d)}</span></div>
  </div>
}

function RankList({rows,metric='y',onSelect,active}){
  const cfg=RANKS[metric]
  const max=Math.max(...rows.map(r=>Math.abs(Number(r[cfg.key]||0))),1)
  return <div className="ix-rank-list">{rows.map((r,i)=>{const value=Number(r[cfg.key]||0);return <button type="button" className={`ix-rank${r.n===active?' active':''}`} key={r.n} onClick={()=>onSelect?.(r.n)}><span className="ix-rank-num">{String(i+1).padStart(2,'0')}</span><div className="ix-rank-copy"><strong>{cleanName(r.n)}</strong><i><em style={{width:`${Math.max(2,Math.abs(value)/max*100)}%`}}/></i></div><b>{cfg.format(value)}</b><span className={`ix-risk-dot ${riskLevel(r)}`} title={`Riesgo ${riskLabel(riskLevel(r))}`}/></button>})}</div>
}

function Control({label,children,wide=false}){
  return <label className={`ix-control${wide?' wide':''}`}><span>{label}</span>{children}</label>
}

export default function Indicadores(){
  const [materialName,setMaterialName]=useState('Subíndice materiales de construcción')
  const [chartMode,setChartMode]=useState('y')
  const [period,setPeriod]=useState('60')
  const [materialQuery,setMaterialQuery]=useState('')
  const [seriesType,setSeriesType]=useState('all')
  const [riskFilter,setRiskFilter]=useState('all')
  const [sortBy,setSortBy]=useState('y')
  const [rankMetric,setRankMetric]=useState('y')
  const [rankLimit,setRankLimit]=useState(10)
  const [compare,setCompare]=useState(['Subíndice materiales de construcción'])

  const selected=useMemo(()=>allMaterials.find(x=>x.n===materialName)||allMaterials.find(x=>x.n==='Subíndice materiales de construcción')||allMaterials[0],[materialName])
  const s=D.summary,latest=D.pressure.at(-1),yearAgo=D.pressure.find(x=>x.d==='2025-08')||D.pressure.at(-13)
  const accel=latest.y-yearAgo.y,ytd=(latest.i/D.pressure.find(x=>x.d==='2026-01').i-1)*100,recent24=D.pressure.slice(-24),recentLow=recent24.reduce((a,b)=>b.y<a.y?b:a,recent24[0])
  const pressureLabel=latest.y>=8?'Presión alta':latest.y>=5?'Presión en aumento':latest.y>=2?'Presión moderada':'Presión baja'
  const selectedDelta=selected.y-s.materials.yoy
  const selectedRisk=riskLevel(selected)

  const pressureWindow=useMemo(()=>{
    const months=PERIODS[period]?.months
    return months?D.pressure.slice(-months):D.pressure
  },[period])

  const filteredMaterials=useMemo(()=>{
    const q=materialQuery.trim().toLocaleLowerCase('es-MX')
    return allMaterials.filter(row=>{
      if(q&&!row.n.toLocaleLowerCase('es-MX').includes(q)) return false
      const isFamily=/^\d+\./.test(row.n)
      if(seriesType==='family'&&!isFamily) return false
      if(seriesType==='detail'&&isFamily) return false
      if(riskFilter==='high'&&riskLevel(row)!=='alta') return false
      if(riskFilter==='medium'&&riskLevel(row)!=='media') return false
      if(riskFilter==='low'&&riskLevel(row)!=='baja') return false
      if(riskFilter==='negative'&&Number(row.y)>=0) return false
      return true
    }).sort((a,b)=>Number(b[sortBy]||0)-Number(a[sortBy]||0))
  },[materialQuery,seriesType,riskFilter,sortBy])

  const ranked=useMemo(()=>[...allMaterials].sort((a,b)=>Number(b[rankMetric]||0)-Number(a[rankMetric]||0)).slice(0,rankLimit),[rankMetric,rankLimit])
  const riskCounts=useMemo(()=>allMaterials.reduce((acc,row)=>{acc[riskLevel(row)]++;return acc},{alta:0,media:0,baja:0}),[])
  const comparedRows=compare.map(name=>allMaterials.find(x=>x.n===name)).filter(Boolean)

  const toggleCompare=name=>setCompare(current=>{
    if(current.includes(name)) return current.filter(x=>x!==name)
    if(current.length>=3) return [...current.slice(1),name]
    return [...current,name]
  })
  const resetFilters=()=>{setPeriod('60');setChartMode('y');setSeriesType('all');setRiskFilter('all');setSortBy('y');setRankMetric('y');setRankLimit(10);setMaterialQuery('')}

  return <main className="ix-page">
    <section className="ix-control-deck">
      <div className="ix-control-intro"><span>INDICADORES / CONTROL ANALÍTICO</span><strong>Explora costos, riesgo y presión de insumos.</strong><p>Los controles modifican la lectura sin salir de la vista.</p></div>
      <div className="ix-controls-grid">
        <Control label="Periodo"><select value={period} onChange={e=>setPeriod(e.target.value)}>{Object.entries(PERIODS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Control>
        <Control label="Métrica de gráfica"><select value={chartMode} onChange={e=>setChartMode(e.target.value)}>{Object.entries(MODES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Control>
        <Control label="Material" wide><select value={materialName} onChange={e=>setMaterialName(e.target.value)}>{allMaterials.map(x=><option key={x.n} value={x.n}>{cleanName(x.n)}</option>)}</select></Control>
        <Control label="Ranking"><select value={rankMetric} onChange={e=>setRankMetric(e.target.value)}>{Object.entries(RANKS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Control>
        <button type="button" className="ix-reset" onClick={resetFilters}>Restablecer</button>
      </div>
      <div className="ix-filter-strip">
        <span>Filtrar catálogo</span>
        <button className={seriesType==='all'?'active':''} onClick={()=>setSeriesType('all')}>Todas</button>
        <button className={seriesType==='family'?'active':''} onClick={()=>setSeriesType('family')}>Familias</button>
        <button className={seriesType==='detail'?'active':''} onClick={()=>setSeriesType('detail')}>Materiales específicos</button>
        <i/>
        <button className={riskFilter==='high'?'active':''} onClick={()=>setRiskFilter(riskFilter==='high'?'all':'high')}>Riesgo alto · {riskCounts.alta}</button>
        <button className={riskFilter==='medium'?'active':''} onClick={()=>setRiskFilter(riskFilter==='medium'?'all':'medium')}>Medio · {riskCounts.media}</button>
        <button className={riskFilter==='negative'?'active':''} onClick={()=>setRiskFilter(riskFilter==='negative'?'all':'negative')}>Inflación negativa</button>
      </div>
    </section>

    <section className="ix-pulse">
      <div className="ix-pulse-copy"><span>PULSO DE COSTOS · AGOSTO 2026</span><strong>Los materiales vuelven a acelerar.</strong><p>La inflación anual del subíndice de materiales llegó a <b>{signed(latest.y,2)}</b>, frente a <b>{signed(yearAgo.y,2)}</b> un año antes. La presión ha subido <b>{pp(accel,2)}</b> en doce meses.</p></div>
      <div className="ix-pulse-metrics"><Metric label="Inflación anual" value={signed(latest.y,2)} note="materiales" emphasis/><Metric label="Aceleración 12m" value={pp(accel,2)} note="vs ago 2025"/><Metric label="Series al alza" value={`${fmt(s.materials.up,1)}%`} note="del paquete analizado"/><Metric label="2026 acumulado" value={signed(ytd,2)} note="ene–ago"/></div>
    </section>

    <section className="ix-card ix-pressure-card">
      <div className="ix-card-head ix-card-head--chart"><div><span>01 · TRAYECTORIA</span><h2>Presión de costos de construcción.</h2><p>Pasa el cursor por la gráfica y cambia periodo o métrica desde el panel superior.</p></div><div className="ix-mode-tabs">{Object.entries(MODES).map(([key,cfg])=><button key={key} className={chartMode===key?'active':''} onClick={()=>setChartMode(key)}>{cfg.short}</button>)}</div></div>
      <div className="ix-chart-layout"><TrendChart data={pressureWindow} mode={chartMode}/><aside className="ix-chart-read"><span>LECTURA ACTUAL</span><div className="ix-status-row"><h3>{pressureLabel}</h3><b className={`ix-risk-badge ${latest.y>=8?'alta':latest.y>=5?'media':'baja'}`}>{latest.y>=8?'alta':latest.y>=5?'media':'moderada'}</b></div><p>La inflación anual se ha re-acelerado desde el mínimo reciente de <b>{signed(recentLow.y,2)}</b> en {shortDate(recentLow.d)} y ya supera el ritmo observado hace doce meses.</p><div className="ix-read-grid"><div><span>Actual</span><strong>{signed(latest.y,2)}</strong></div><div><span>Hace 12m</span><strong>{signed(yearAgo.y,2)}</strong></div><div><span>Cambio mensual</span><strong>{signed(latest.m,2)}</strong></div><div><span>Volatilidad</span><strong>{fmt(latest.v,2)} pp</strong></div></div><details className="ix-mini-details"><summary>Cómo leer esta señal</summary><p>La aceleración interanual indica que el costo crece más rápido que hace un año; la volatilidad mensual muestra qué tan estable es ese proceso.</p></details></aside></div>
    </section>

    <section className="ix-card ix-material-card">
      <div className="ix-card-head"><div><span>02 · INSUMO ACTIVO</span><h2>{cleanName(selected.n)}</h2><p>Selecciona un material desde cualquier ranking, desplegable o catálogo.</p></div><div className="ix-card-actions"><span className={`ix-risk-badge ${selectedRisk}`}>Riesgo {riskLabel(selectedRisk)}</span><button type="button" className={compare.includes(selected.n)?'active':''} onClick={()=>toggleCompare(selected.n)}>{compare.includes(selected.n)?'Quitar comparación':'Añadir a comparar'}</button></div></div>
      <div className="ix-material-focus">
        <div className="ix-material-name"><span>SERIE SELECCIONADA</span><h3>{cleanName(selected.n)}</h3><p>{selectedDelta>=0?`Corre ${pp(selectedDelta,2)} por encima de la inflación general de materiales.`:`Corre ${pp(Math.abs(selectedDelta),2)} por debajo de la inflación general de materiales.`}</p></div>
        <Metric label="Inflación 12m" value={signed(selected.y,2)} note="ritmo actual" emphasis/><Metric label="Desde ene 2022" value={signed(selected.s22,1)} note="acumulado del índice"/><Metric label="Volatilidad 12m" value={`${fmt(selected.v,2)} pp`} note="dispersión mensual"/><Metric label="P95 mensual" value={signed(selected.p95,2)} note="mes adverso de referencia"/>
      </div>
      <div className="ix-material-risk"><div><span>Meses con alza</span><strong>{fmt(selected.up,1)}%</strong></div><div><span>Mejor mes histórico</span><strong>{signed(selected.best,2)}</strong></div><div><span>Peor mes histórico</span><strong>{signed(selected.worst,2)}</strong></div><div><span>Serie disponible</span><strong>{selected.start} → {selected.end}</strong></div></div>

      <div className="ix-compare-box">
        <div className="ix-compare-head"><div><span>COMPARADOR RÁPIDO</span><strong>Hasta 3 series</strong></div><small>Haz clic en “comparar” dentro del catálogo para sustituir o añadir.</small></div>
        <div className="ix-compare-table"><div className="ix-compare-row head"><span>Serie</span><span>12m</span><span>Desde 2022</span><span>Volatilidad</span><span>P95</span><span/></div>{comparedRows.map(row=><div className="ix-compare-row" key={row.n}><strong>{cleanName(row.n)}</strong><span>{signed(row.y,1)}</span><span>{signed(row.s22,1)}</span><span>{fmt(row.v,2)} pp</span><span>{signed(row.p95,1)}</span><button onClick={()=>toggleCompare(row.n)}>×</button></div>)}</div>
      </div>

      <details className="ix-material-library" open>
        <summary><div><span>CATÁLOGO INTERACTIVO</span><strong>Buscar, filtrar y ordenar materiales</strong><small>{filteredMaterials.length} de {allMaterials.length} series visibles</small></div><b>+</b></summary>
        <div className="ix-library-body">
          <div className="ix-library-tools"><div className="ix-library-search"><input value={materialQuery} onChange={e=>setMaterialQuery(e.target.value)} placeholder="Buscar cemento, varilla, pintura, cable…"/><span>{filteredMaterials.length} resultados</span></div><Control label="Ordenar por"><select value={sortBy} onChange={e=>setSortBy(e.target.value)}>{Object.entries(RANKS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></Control></div>
          <div className="ix-library-grid">{filteredMaterials.map(x=><article key={x.n} className={x.n===materialName?'active':''}><button type="button" className="ix-library-main" onClick={()=>setMaterialName(x.n)}><span>{cleanName(x.n)}</span><div><strong>{RANKS[sortBy].format(x[sortBy])}</strong><small>{RANKS[sortBy].help}</small></div></button><button type="button" className={`ix-compare-toggle${compare.includes(x.n)?' active':''}`} onClick={()=>toggleCompare(x.n)}>{compare.includes(x.n)?'✓':'+'}</button></article>)}</div>
        </div>
      </details>

      <div className="ix-material-tabs">{D.keyMaterials.map(x=><button className={x.n===materialName?'active':''} key={x.n} onClick={()=>setMaterialName(x.n)}>{cleanName(x.n).replace('Cable, alambre y conductores eléctricos','Cable eléctrico')}</button>)}</div>
    </section>

    <section className="ix-two ix-rank-zone">
      <article className="ix-card"><div className="ix-card-head"><div><span>03 · RANKING DINÁMICO</span><h2>{RANKS[rankMetric].label}.</h2><p>Haz clic en cualquier fila para convertirla en el insumo activo.</p></div><div className="ix-inline-controls"><select value={rankMetric} onChange={e=>setRankMetric(e.target.value)}>{Object.entries(RANKS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select><select value={rankLimit} onChange={e=>setRankLimit(Number(e.target.value))}><option value={6}>Top 6</option><option value={10}>Top 10</option><option value={15}>Top 15</option></select></div></div><RankList rows={ranked} metric={rankMetric} onSelect={setMaterialName} active={materialName}/></article>
      <article className="ix-card ix-risk-panel"><div className="ix-card-head"><div><span>04 · MAPA DE RIESGO</span><h2>Distribución de series por presión.</h2><p>Clasificación operativa basada en inflación, volatilidad y P95 mensual.</p></div></div><div className="ix-risk-summary"><button onClick={()=>setRiskFilter('high')}><span>ALTO</span><strong>{riskCounts.alta}</strong><small>series</small></button><button onClick={()=>setRiskFilter('medium')}><span>MEDIO</span><strong>{riskCounts.media}</strong><small>series</small></button><button onClick={()=>setRiskFilter('low')}><span>BAJO</span><strong>{riskCounts.baja}</strong><small>series</small></button></div><div className="ix-risk-guide"><div><b>Alta</b><p>Inflación ≥10%, volatilidad ≥4 pp o P95 ≥6%.</p></div><div><b>Media</b><p>Inflación ≥5%, volatilidad ≥1.5 pp o P95 ≥3%.</p></div><div><b>Baja</b><p>Por debajo de esos umbrales descriptivos.</p></div></div><small className="ix-method-note">Clasificación descriptiva para navegación; no es una recomendación de compra ni un pronóstico.</small></article>
    </section>

    <section className="ix-card ix-region"><div className="ix-card-head"><div><span>05 · REFERENCIA REGIONAL</span><h2>Culiacán frente al índice nacional.</h2><p>Referencia urbana para Sinaloa; no sustituye un costo observado de Mazatlán.</p></div><details className="ix-head-details"><summary>Metodología</summary><p>La brecha compara variaciones relativas del índice. La relación R² describe asociación contemporánea en el modelo disponible.</p></details></div><div className="ix-region-grid"><div className="ix-region-main"><span>CULIACÁN</span><strong>{signed(s.culiacan.yoy,2)}</strong><small>inflación 12m</small><div><b>{signed(s.culiacan.since2022,1)}</b><em>desde ene 2022</em></div></div><div className="ix-region-main"><span>NACIONAL</span><strong>{signed(s.national.yoy,2)}</strong><small>inflación 12m</small><div><b>{signed(s.national.since2022,1)}</b><em>desde ene 2022</em></div></div><div className="ix-region-read"><span>BRECHA ACTUAL</span><strong>{signed(s.premium.last,2)}</strong><p>Culiacán se ubica por debajo de la referencia nacional en el último mes. La brecha histórica desde 2022 promedia {signed(s.premium.avg,2)}.</p></div><div className="ix-region-read"><span>RELACIÓN DINÁMICA</span><strong>R² {fmt(D.model.r2*100,1)}%</strong><p>El movimiento nacional explica gran parte de la variación contemporánea de Culiacán; se usa como relación predictiva, no como causalidad.</p></div></div></section>

    <section className="ix-two ix-bottom"><article className="ix-card"><div className="ix-card-head"><div><span>06 · ESTRÉS HISTÓRICO</span><h2>Meses de mayor salto mensual.</h2><p>Referencia para escenarios de contingencia.</p></div></div><div className="ix-peak-grid">{D.peaks.slice(0,8).map(x=><div key={x.d}><span>{shortDate(x.d)}</span><strong>{signed(x.m,2)}</strong></div>)}</div></article><article className="ix-card"><div className="ix-card-head"><div><span>07 · RIESGO COMÚN</span><h2>Cuánto se mueven juntos los insumos.</h2><p>Análisis de componentes principales del paquete.</p></div></div><div className="ix-pca">{D.pca.slice(0,5).map(x=><div key={x.c}><span>Factor {x.c}</span><i><em style={{width:`${x.v/30*100}%`}}/></i><strong>{fmt(x.v,1)}%</strong></div>)}</div><p className="ix-card-note">El primer factor explica {fmt(D.pca[0].v,1)}% del movimiento conjunto; los primeros cuatro concentran {fmt(D.pca[3].a,1)}%.</p></article></section>

    <footer className="ix-footer"><span>INPP · corte agosto 2026</span><p>Los índices muestran evolución relativa. No son precios en pesos por m² ni cotizaciones de proveedor. La referencia de Culiacán se utiliza únicamente como aproximación urbana de Sinaloa.</p></footer>
  </main>
}
