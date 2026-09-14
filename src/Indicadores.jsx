import React, { useMemo, useState } from 'react'
import { indicatorsData as D } from './indicadoresData.js'
import './indicadores.css'

const fmt=(v,d=1)=>Number(v).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d})
const signed=(v,d=1)=>`${Number(v)>=0?'+':''}${fmt(v,d)}%`

function Metric({label,value,note}){
  return <div className="ix-metric"><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>
}

function LineChart({data,keyName='y'}){
  const w=900,h=230,p=28
  const vals=data.map(d=>Number(d[keyName])).filter(Number.isFinite)
  const lo=Math.min(...vals), hi=Math.max(...vals), range=hi-lo||1
  const points=data.map((d,i)=>`${p+(i/(data.length-1||1))*(w-p*2)},${p+(1-(Number(d[keyName])-lo)/range)*(h-p*2)}`).join(' ')
  const last=data.at(-1)
  return <div className="ix-chart">
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={p} y1={h-p} x2={w-p} y2={h-p} className="ix-axis"/>
      <line x1={p} y1={p} x2={w-p} y2={p} className="ix-grid"/>
      <polyline points={points} className="ix-line" fill="none" vectorEffect="non-scaling-stroke"/>
      {data.map((d,i)=>d.stress?<rect key={d.d} x={p+(i/(data.length-1||1))*(w-p*2)-3} y={h-p+7} width="6" height="8" className="ix-stress-mark"/>:null)}
    </svg>
    <div className="ix-chart-foot"><span>{data[0]?.d}</span><strong>{last?.d} · {signed(last?.[keyName],2)}</strong></div>
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
  const selected=useMemo(()=>D.keyMaterials.find(x=>x.n===materialName)||D.keyMaterials[0],[materialName])
  const s=D.summary
  const latest=D.pressure.at(-1)
  return <main className="ix-page">
    <section className="ix-hero">
      <div><span className="ix-kicker">COSTOS DE CONSTRUCCIÓN · CORTE AGO 2026</span><h1>Indicadores para desarrollar.</h1><p>Presión de insumos, volatilidad, referencia regional y señales de riesgo presupuestal. Los índices describen evolución relativa; no son cotizaciones de proveedor.</p></div>
      <div className="ix-hero-meta"><strong>{D.meta.series}</strong><span>series analizadas</span><i/><strong>{D.meta.cities}</strong><span>ciudades comparables</span></div>
    </section>

    <section className="ix-kpis">
      <Metric label="Materiales · inflación 12m" value={signed(s.materials.yoy,2)} note="Subíndice materiales de construcción"/>
      <Metric label="Materiales · desde ene 2022" value={signed(s.materials.since2022,1)} note="cambio acumulado del índice"/>
      <Metric label="Culiacán · inflación 12m" value={signed(s.culiacan.yoy,2)} note="referencia urbana de Sinaloa"/>
      <Metric label="Prima Culiacán vs nacional" value={signed(s.premium.last,2)} note="último mes disponible"/>
    </section>

    <section className="ix-card ix-pressure">
      <div className="ix-card-head"><div><span>01 · PRESIÓN DE COSTOS</span><h2>Inflación anual de materiales.</h2></div><div className={`ix-status ${latest.stress?'stress':''}`}><i/><div><span>Estado actual</span><strong>{latest.stress?'Estrés':'Sin estrés'}</strong></div></div></div>
      <LineChart data={D.pressure} keyName="y"/>
      <div className="ix-note-grid"><Metric label="Último dato" value={signed(latest.y,2)} note="inflación 12 meses"/><Metric label="Cambio mensual" value={signed(latest.m,2)} note="ago 2026"/><Metric label="Volatilidad móvil" value={`${fmt(latest.v,2)} pp`} note="desviación 12 meses"/><Metric label="Índice" value={fmt(latest.i,2)} note="nivel exportado"/></div>
    </section>

    <section className="ix-card">
      <div className="ix-card-head"><div><span>02 · INSUMOS</span><h2>Qué está presionando el presupuesto.</h2></div><label className="ix-select"><select value={materialName} onChange={e=>setMaterialName(e.target.value)}>{D.keyMaterials.map(x=><option key={x.n}>{x.n}</option>)}</select><b>⌄</b></label></div>
      <div className="ix-material-focus">
        <div className="ix-material-name"><span>Serie seleccionada</span><h3>{selected.n}</h3><p>Lectura para presupuesto y compras, no precio unitario en pesos.</p></div>
        <Metric label="Índice actual" value={fmt(selected.i,2)}/>
        <Metric label="Inflación 12m" value={signed(selected.y,2)}/>
        <Metric label="Desde ene 2022" value={signed(selected.s22,1)}/>
        <Metric label="Volatilidad 12m" value={`${fmt(selected.v,2)} pp`}/>
        <Metric label="P95 mensual" value={signed(selected.p95,2)} note="mes adverso de referencia"/>
      </div>
      <div className="ix-material-tabs">{D.keyMaterials.map(x=><button className={x.n===materialName?'active':''} key={x.n} onClick={()=>setMaterialName(x.n)}>{x.n.replace('Subíndice ','').replace('Cable, alambre y conductores eléctricos','Cable eléctrico')}</button>)}</div>
    </section>

    <section className="ix-two">
      <article className="ix-card"><div className="ix-card-head"><div><span>03 · INFLACIÓN</span><h2>Mayores presiones interanuales.</h2></div><small>ago 2026</small></div><RankList rows={D.topInflation.slice(0,10)} kind="inflation"/></article>
      <article className="ix-card"><div className="ix-card-head"><div><span>04 · VOLATILIDAD</span><h2>Insumos con mayor riesgo de presupuesto.</h2></div><small>volatilidad móvil 12m</small></div><RankList rows={D.topVolatility.slice(0,10)} kind="volatility"/></article>
    </section>

    <section className="ix-card ix-region">
      <div className="ix-card-head"><div><span>05 · REFERENCIA REGIONAL</span><h2>Culiacán frente al índice nacional.</h2></div><small>Culiacán es referencia de Sinaloa; no sustituye a Mazatlán.</small></div>
      <div className="ix-region-grid">
        <div className="ix-region-main"><span>Culiacán</span><strong>{signed(s.culiacan.yoy,2)}</strong><small>inflación 12m</small><div><b>{signed(s.culiacan.since2022,1)}</b><em>desde ene 2022</em></div></div>
        <div className="ix-region-main"><span>Nacional</span><strong>{signed(s.national.yoy,2)}</strong><small>inflación 12m</small><div><b>{signed(s.national.since2022,1)}</b><em>desde ene 2022</em></div></div>
        <div className="ix-region-read"><span>Prima regional actual</span><strong>{signed(s.premium.last,2)}</strong><p>La referencia de Culiacán se ubica por debajo del índice nacional en el último mes. La prima histórica desde 2022 promedia {signed(s.premium.avg,2)}.</p></div>
        <div className="ix-region-read"><span>Modelo dinámico</span><strong>R² {fmt(D.model.r2*100,1)}%</strong><p>La inflación contemporánea nacional tiene coeficiente {fmt(D.model.b1,2)} y el rezago de un mes {fmt(D.model.lag,2)}. Asociación predictiva, no causalidad estructural.</p></div>
      </div>
    </section>

    <section className="ix-two ix-bottom">
      <article className="ix-card"><div className="ix-card-head"><div><span>06 · MESES EXTREMOS</span><h2>Picos históricos de materiales.</h2></div></div><div className="ix-peak-grid">{D.peaks.slice(0,8).map(x=><div key={x.d}><span>{x.d}</span><strong>{signed(x.m,2)}</strong></div>)}</div></article>
      <article className="ix-card"><div className="ix-card-head"><div><span>07 · FACTORES COMUNES</span><h2>Concentración del movimiento conjunto.</h2></div></div><div className="ix-pca">{D.pca.slice(0,5).map(x=><div key={x.c}><span>Componente {x.c}</span><i><em style={{width:`${x.v/30*100}%`}}/></i><strong>{fmt(x.v,1)}%</strong></div>)}</div><p className="ix-card-note">El primer componente explica {fmt(D.pca[0].v,1)}% de la variación conjunta; los primeros cuatro acumulan {fmt(D.pca[3].a,1)}%.</p></article>
    </section>

    <footer className="ix-footer"><span>Base: paquete INPP cargado al proyecto · corte agosto 2026</span><p>Uso recomendado: contingencia, compras, escalamiento de contratos y comparación regional. No interpretar el índice como costo local por m² ni como cotización de proveedor.</p></footer>
  </main>
}
