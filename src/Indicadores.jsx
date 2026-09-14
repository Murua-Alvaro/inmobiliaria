import React, { useMemo, useState } from 'react'
import { indicatorsData as D } from './indicadoresData.js'
import './indicadores.css'

const fmt=(v,d=1)=>Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d})
const signed=(v,d=1)=>`${Number(v)>=0?'+':''}${fmt(v,d)}%`
const pp=(v,d=1)=>`${Number(v)>=0?'+':''}${fmt(v,d)} pp`
const months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const shortDate=value=>{
  const [y,m]=String(value||'').split('-').map(Number)
  return Number.isFinite(y)&&Number.isFinite(m)?`${months[m-1]} ${String(y).slice(-2)}`:String(value||'')
}

function Metric({label,value,note,emphasis=false}){
  return <div className={`ix-metric${emphasis?' emphasis':''}`}><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>
}

const MODES={
  y:{label:'Inflación anual',key:'y',digits:1,suffix:'%',reference:5,referenceLabel:'referencia 5%'},
  i:{label:'Nivel del índice',key:'i',digits:1,suffix:'',reference:null,referenceLabel:''},
  m:{label:'Cambio mensual',key:'m',digits:1,suffix:'%',reference:1,referenceLabel:'referencia 1% mensual'},
}

function TrendChart({data,mode}){
  const cfg=MODES[mode]
  const w=1040,h=320,left=58,right=24,top=22,bottom=38
  const values=data.map(d=>Number(d[cfg.key])).filter(Number.isFinite)
  const rawMin=Math.min(...values,cfg.reference??Infinity)
  const rawMax=Math.max(...values,cfg.reference??-Infinity)
  const rawRange=rawMax-rawMin||1
  const pad=rawRange*.14
  const min=rawMin-pad,max=rawMax+pad,range=max-min||1
  const x=i=>left+(i/(data.length-1||1))*(w-left-right)
  const y=v=>top+(1-(v-min)/range)*(h-top-bottom)
  const points=data.map((d,i)=>`${x(i)},${y(Number(d[cfg.key]))}`).join(' ')
  const area=`${left},${h-bottom} ${points} ${w-right},${h-bottom}`
  const ticks=Array.from({length:5},(_,i)=>max-(i/(4))*(max-min))
  const xIdx=[0,Math.round((data.length-1)*.25),Math.round((data.length-1)*.5),Math.round((data.length-1)*.75),data.length-1]
  const latest=data.at(-1)
  const maxRow=data.reduce((a,b)=>Number(b[cfg.key])>Number(a[cfg.key])?b:a,data[0])
  const minRow=data.reduce((a,b)=>Number(b[cfg.key])<Number(a[cfg.key])?b:a,data[0])
  const maxIdx=data.indexOf(maxRow),minIdx=data.indexOf(minRow)
  const formatVal=v=>cfg.suffix==='%'?signed(v,cfg.digits):fmt(v,cfg.digits)
  return <div className="ix-chart-pro">
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${cfg.label} de materiales de construcción`}>
      <defs><linearGradient id={`area-${mode}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#111" stopOpacity=".09"/><stop offset="100%" stopColor="#111" stopOpacity=".01"/></linearGradient></defs>
      {ticks.map((t,i)=><g key={i}><line x1={left} y1={y(t)} x2={w-right} y2={y(t)} className="ix-chart-grid"/><text x={left-10} y={y(t)+3} textAnchor="end" className="ix-y-label">{cfg.suffix==='%'?`${fmt(t,1)}%`:fmt(t,1)}</text></g>)}
      {cfg.reference!==null&&cfg.reference>=min&&cfg.reference<=max?<g><line x1={left} y1={y(cfg.reference)} x2={w-right} y2={y(cfg.reference)} className="ix-reference"/><text x={w-right} y={y(cfg.reference)-7} textAnchor="end" className="ix-ref-label">{cfg.referenceLabel}</text></g>:null}
      <polygon points={area} fill={`url(#area-${mode})`}/>
      <polyline points={points} className="ix-trend-line" fill="none" vectorEffect="non-scaling-stroke"/>
      <circle cx={x(maxIdx)} cy={y(Number(maxRow[cfg.key]))} r="3.2" className="ix-extreme-dot"/><circle cx={x(minIdx)} cy={y(Number(minRow[cfg.key]))} r="3.2" className="ix-extreme-dot"/>
      <circle cx={x(data.length-1)} cy={y(Number(latest[cfg.key]))} r="5.3" className="ix-last-dot"/><circle cx={x(data.length-1)} cy={y(Number(latest[cfg.key]))} r="9.5" className="ix-last-ring"/>
      {xIdx.map(i=><text key={i} x={x(i)} y={h-10} textAnchor={i===0?'start':i===data.length-1?'end':'middle'} className="ix-x-label">{shortDate(data[i]?.d)}</text>)}
      <text x={Math.min(w-right-8,x(data.length-1)-10)} y={Math.max(top+13,y(Number(latest[cfg.key]))-13)} textAnchor="end" className="ix-last-label">{formatVal(latest[cfg.key])}</text>
    </svg>
    <div className="ix-chart-extremes"><span>Máximo del periodo <b>{formatVal(maxRow[cfg.key])}</b> · {shortDate(maxRow.d)}</span><span>Mínimo <b>{formatVal(minRow[cfg.key])}</b> · {shortDate(minRow.d)}</span></div>
  </div>
}

function RankList({rows,kind}){
  const max=Math.max(...rows.map(r=>Math.abs(kind==='inflation'?r.y:r.v)),1)
  return <div className="ix-rank-list">{rows.map((r,i)=>{
    const value=kind==='inflation'?r.y:r.v
    return <div className="ix-rank" key={r.n}>
      <span className="ix-rank-num">{String(i+1).padStart(2,'0')}</span>
      <div className="ix-rank-copy"><strong>{r.n.replace(/^\d+\.\s*/, '')}</strong><i><em style={{width:`${Math.max(2,Math.abs(value)/max*100)}%`}}/></i></div>
      <b>{kind==='inflation'?signed(value,1):`${fmt(value,1)} pp`}</b>
    </div>
  })}</div>
}

export default function Indicadores(){
  const [materialName,setMaterialName]=useState('Subíndice materiales de construcción')
  const [chartMode,setChartMode]=useState('y')
  const selected=useMemo(()=>D.keyMaterials.find(x=>x.n===materialName)||D.keyMaterials[0],[materialName])
  const s=D.summary
  const latest=D.pressure.at(-1)
  const yearAgo=D.pressure.find(x=>x.d==='2025-08')||D.pressure.at(-13)
  const accel=latest.y-yearAgo.y
  const ytd=(latest.i/D.pressure.find(x=>x.d==='2026-01').i-1)*100
  const recent24=D.pressure.slice(-24)
  const recentLow=recent24.reduce((a,b)=>b.y<a.y?b:a,recent24[0])
  const pressureLabel=latest.y>=8?'Presión alta':latest.y>=5?'Presión en aumento':latest.y>=2?'Presión moderada':'Presión baja'
  const selectedDelta=selected.y-s.materials.yoy

  return <main className="ix-page">
    <section className="ix-pulse">
      <div className="ix-pulse-copy"><span>PULSO DE COSTOS · AGOSTO 2026</span><strong>Los materiales vuelven a acelerar.</strong><p>La inflación anual del subíndice de materiales llegó a <b>{signed(latest.y,2)}</b>, frente a <b>{signed(yearAgo.y,2)}</b> un año antes. La presión ha subido <b>{pp(accel,2)}</b> en doce meses.</p></div>
      <div className="ix-pulse-metrics"><Metric label="Inflación anual" value={signed(latest.y,2)} note="materiales" emphasis/><Metric label="Aceleración 12m" value={pp(accel,2)} note="vs ago 2025"/><Metric label="Series al alza" value={`${fmt(s.materials.up,1)}%`} note="del paquete analizado"/><Metric label="2026 acumulado" value={signed(ytd,2)} note="ene–ago"/></div>
    </section>

    <section className="ix-card ix-pressure-card">
      <div className="ix-card-head ix-card-head--chart"><div><span>01 · TRAYECTORIA</span><h2>Presión de costos de construcción.</h2><p>Lee tendencia, aceleración y magnitud; no solo el último dato.</p></div><div className="ix-mode-tabs">{Object.entries(MODES).map(([key,cfg])=><button key={key} className={chartMode===key?'active':''} onClick={()=>setChartMode(key)}>{cfg.label}</button>)}</div></div>
      <div className="ix-chart-layout">
        <TrendChart data={D.pressure} mode={chartMode}/>
        <aside className="ix-chart-read">
          <span>LECTURA ACTUAL</span><h3>{pressureLabel}</h3><p>La inflación anual se ha re-acelerado desde el mínimo reciente de <b>{signed(recentLow.y,2)}</b> en {shortDate(recentLow.d)} y ya supera el ritmo observado hace doce meses.</p>
          <div className="ix-read-grid"><div><span>Actual</span><strong>{signed(latest.y,2)}</strong></div><div><span>Hace 12m</span><strong>{signed(yearAgo.y,2)}</strong></div><div><span>Cambio mensual</span><strong>{signed(latest.m,2)}</strong></div><div><span>Volatilidad</span><strong>{fmt(latest.v,2)} pp</strong></div></div>
          <div className="ix-implication"><span>Implicación</span><p>Conviene actualizar presupuestos y contingencias con mayor frecuencia cuando la inflación anual acelera, aun si la volatilidad mensual permanece contenida.</p></div>
        </aside>
      </div>
    </section>

    <section className="ix-card ix-material-card">
      <div className="ix-card-head"><div><span>02 · INSUMOS</span><h2>Qué componente está moviendo el presupuesto.</h2><p>Selecciona un material y compáralo contra la canasta general.</p></div><label className="ix-select"><select value={materialName} onChange={e=>setMaterialName(e.target.value)}>{D.keyMaterials.map(x=><option key={x.n}>{x.n}</option>)}</select><b>⌄</b></label></div>
      <div className="ix-material-focus">
        <div className="ix-material-name"><span>SERIE SELECCIONADA</span><h3>{selected.n}</h3><p>{selectedDelta>=0?`Corre ${pp(selectedDelta,2)} por encima de la inflación general de materiales.`:`Corre ${pp(Math.abs(selectedDelta),2)} por debajo de la inflación general de materiales.`}</p></div>
        <Metric label="Inflación 12m" value={signed(selected.y,2)} note="ritmo actual" emphasis/>
        <Metric label="Desde ene 2022" value={signed(selected.s22,1)} note="acumulado del índice"/>
        <Metric label="Volatilidad 12m" value={`${fmt(selected.v,2)} pp`} note="variación mensual"/>
        <Metric label="P95 mensual" value={signed(selected.p95,2)} note="mes adverso de referencia"/>
      </div>
      <div className="ix-material-tabs">{D.keyMaterials.map(x=><button className={x.n===materialName?'active':''} key={x.n} onClick={()=>setMaterialName(x.n)}>{x.n.replace('Subíndice ','').replace('Cable, alambre y conductores eléctricos','Cable eléctrico')}</button>)}</div>
    </section>

    <section className="ix-two">
      <article className="ix-card"><div className="ix-card-head"><div><span>03 · INFLACIÓN INTERANUAL</span><h2>Insumos que más se encarecen.</h2><p>Ranking del último dato disponible.</p></div><small>ago 2026</small></div><RankList rows={D.topInflation.slice(0,8)} kind="inflation"/></article>
      <article className="ix-card"><div className="ix-card-head"><div><span>04 · VOLATILIDAD</span><h2>Insumos con mayor incertidumbre.</h2><p>Mayor dispersión mensual implica más riesgo de desviación presupuestal.</p></div><small>ventana móvil 12m</small></div><RankList rows={D.topVolatility.slice(0,8)} kind="volatility"/></article>
    </section>

    <section className="ix-card ix-region">
      <div className="ix-card-head"><div><span>05 · REFERENCIA REGIONAL</span><h2>Culiacán frente al índice nacional.</h2><p>Referencia urbana para Sinaloa; no sustituye un costo observado de Mazatlán.</p></div></div>
      <div className="ix-region-grid">
        <div className="ix-region-main"><span>CULIACÁN</span><strong>{signed(s.culiacan.yoy,2)}</strong><small>inflación 12m</small><div><b>{signed(s.culiacan.since2022,1)}</b><em>desde ene 2022</em></div></div>
        <div className="ix-region-main"><span>NACIONAL</span><strong>{signed(s.national.yoy,2)}</strong><small>inflación 12m</small><div><b>{signed(s.national.since2022,1)}</b><em>desde ene 2022</em></div></div>
        <div className="ix-region-read"><span>BRECHA ACTUAL</span><strong>{signed(s.premium.last,2)}</strong><p>Culiacán se ubica por debajo de la referencia nacional en el último mes. La brecha histórica desde 2022 promedia {signed(s.premium.avg,2)}.</p></div>
        <div className="ix-region-read"><span>RELACIÓN DINÁMICA</span><strong>R² {fmt(D.model.r2*100,1)}%</strong><p>El movimiento nacional explica gran parte de la variación contemporánea de Culiacán; se usa como relación predictiva, no como causalidad.</p></div>
      </div>
    </section>

    <section className="ix-two ix-bottom">
      <article className="ix-card"><div className="ix-card-head"><div><span>06 · ESTRÉS HISTÓRICO</span><h2>Meses de mayor salto mensual.</h2><p>Referencia para escenarios de contingencia.</p></div></div><div className="ix-peak-grid">{D.peaks.slice(0,8).map(x=><div key={x.d}><span>{shortDate(x.d)}</span><strong>{signed(x.m,2)}</strong></div>)}</div></article>
      <article className="ix-card"><div className="ix-card-head"><div><span>07 · RIESGO COMÚN</span><h2>Cuánto se mueven juntos los insumos.</h2><p>Análisis de componentes principales del paquete.</p></div></div><div className="ix-pca">{D.pca.slice(0,5).map(x=><div key={x.c}><span>Factor {x.c}</span><i><em style={{width:`${x.v/30*100}%`}}/></i><strong>{fmt(x.v,1)}%</strong></div>)}</div><p className="ix-card-note">El primer factor explica {fmt(D.pca[0].v,1)}% del movimiento conjunto; los primeros cuatro concentran {fmt(D.pca[3].a,1)}%.</p></article>
    </section>

    <footer className="ix-footer"><span>INPP · corte agosto 2026</span><p>Los índices muestran evolución relativa. No son precios en pesos por m² ni cotizaciones de proveedor. La referencia de Culiacán se utiliza únicamente como aproximación urbana de Sinaloa.</p></footer>
  </main>
}
