import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Download,
  Gauge,
  Home,
  Layers3,
  MapPin,
  Menu,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  X,
} from 'lucide-react'
import { marketStats, projects, zones } from './data'
import './styles.css'

const money = (value) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 0
}).format(value)

const shortMoney = (value) => {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)} mil M`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)} M`
  return money(value)
}

function Sparkline({ values }) {
  const width = 240
  const height = 62
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - 6 - ((v - min) / range) * (height - 16)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="55" x2={width} y2="55" className="spark-base" />
      <polyline points={points} className="spark-line" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Distribution({ labels, values }) {
  const max = Math.max(...values)
  return (
    <div className="distribution">
      {labels.map((label, i) => (
        <div className="distribution-row" key={label}>
          <div className="distribution-label">{label}</div>
          <div className="distribution-track"><span style={{ width: `${(values[i] / max) * 100}%` }} /></div>
          <div className="distribution-value">{values[i]}%</div>
        </div>
      ))}
    </div>
  )
}

function Metric({ label, value, meta, trend }) {
  return (
    <div className="metric-cell">
      <div className="metric-label">{label}</div>
      <div className="metric-main">{value}</div>
      {meta && <div className={`metric-meta ${trend === 'up' ? 'positive' : ''}`}>{meta}</div>}
    </div>
  )
}

function MapCanvas({ selected, onSelect, metric }) {
  const nodeRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return

    const map = L.map(nodeRef.current, {
      center: [23.245, -106.445],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (layerRef.current) layerRef.current.remove()
    const group = L.layerGroup().addTo(map)

    projects.forEach((p) => {
      const value = metric === 'Precio' ? `$${Math.round(p.priceM2 / 1000)}k`
        : metric === 'Venta' ? `${p.medianDays}d`
        : metric === 'Inventario' ? `${p.inventoryMonths}m`
        : `${p.absorption.toFixed(1)}`
      const active = selected.id === p.id
      const icon = L.divIcon({
        className: 'growa-marker-shell',
        html: `<button class="growa-marker ${active ? 'is-active' : ''}" aria-label="${p.name}"><span>${value}</span><i></i></button>`,
        iconSize: [58, 42],
        iconAnchor: [29, 34],
      })
      L.marker([p.lat, p.lng], { icon }).addTo(group).on('click', () => onSelect(p))
    })

    layerRef.current = group
  }, [selected, metric, onSelect])

  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.flyTo([selected.lat, selected.lng], 14, { duration: .7 })
  }, [selected.id])

  return <div ref={nodeRef} className="map-canvas" />
}

function Simulator({ project, onClose }) {
  const [units, setUnits] = useState(140)
  const [size, setSize] = useState(82)
  const [price, setPrice] = useState(Math.round(project.priceM2 / 100) * 100)
  const [oneBed, setOneBed] = useState(28)
  const [twoBed, setTwoBed] = useState(58)
  const threeBed = Math.max(0, 100 - oneBed - twoBed)

  useEffect(() => setPrice(Math.round(project.priceM2 / 100) * 100), [project.id])

  const baseAbsorption = project.absorption
  const priceEffect = Math.pow(project.priceM2 / price, 1.45)
  const mixEffect = 0.86 + ((oneBed * 1.12 + twoBed * 1.0 + threeBed * .72) / 100) * .18
  const projectedAbsorption = Math.max(.7, baseAbsorption * priceEffect * mixEffect)
  const sellout = Math.ceil(units / projectedAbsorption)
  const revenue = units * size * price
  const inventoryAfter = project.inventoryMonths + units / Math.max(project.absorption * 1.25, 1)
  const marketFit = Math.max(42, Math.min(96, Math.round(88 - Math.abs(price - project.priceM2) / 900 - Math.abs(size - 84) / 3)))

  return (
    <div className="simulator-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="simulator-panel">
        <div className="simulator-head">
          <div>
            <div className="eyebrow">LABORATORIO DE PROYECTO</div>
            <h2>Prueba el proyecto antes de lanzarlo.</h2>
            <p>El escenario se inserta contra el mercado de <strong>{project.zone.split(' · ')[0]}</strong>.</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18}/></button>
        </div>

        <div className="simulator-grid">
          <div className="simulator-controls">
            <Control label="Unidades" value={units} suffix="" min={40} max={320} step={5} onChange={setUnits} />
            <Control label="Superficie media" value={size} suffix=" m²" min={45} max={160} step={1} onChange={setSize} />
            <Control label="Precio de salida" value={price} prefix="$" suffix=" /m²" min={30000} max={90000} step={500} onChange={setPrice} moneyValue />

            <div className="mix-block">
              <div className="control-header"><span>Mezcla de producto</span><strong>{oneBed}% / {twoBed}% / {threeBed}%</strong></div>
              <div className="mix-labels"><span>1 rec.</span><span>2 rec.</span><span>3 rec.</span></div>
              <input type="range" min="0" max="70" value={oneBed} onChange={(e) => setOneBed(Math.min(Number(e.target.value), 100 - twoBed))} />
              <input type="range" min="20" max="85" value={twoBed} onChange={(e) => setTwoBed(Math.min(Number(e.target.value), 100 - oneBed))} />
            </div>
          </div>

          <div className="scenario-result">
            <div className="scenario-kicker">ESCENARIO BASE</div>
            <div className="scenario-number">{sellout}<span> meses</span></div>
            <div className="scenario-caption">para colocar {units} unidades al ritmo estimado</div>

            <div className="scenario-metrics">
              <div><span>Absorción estimada</span><strong>{projectedAbsorption.toFixed(1)} u/mes</strong></div>
              <div><span>Valor de venta</span><strong>{shortMoney(revenue)}</strong></div>
              <div><span>Inventario zona post-lanzamiento</span><strong>{inventoryAfter.toFixed(1)} meses</strong></div>
              <div><span>Ajuste producto–mercado</span><strong>{marketFit}/100</strong></div>
            </div>

            <div className="scenario-note">
              <Sparkles size={16}/>
              <p>{price > project.priceM2 * 1.06
                ? 'El precio está por encima del rango observado. La mayor penalización del escenario viene por velocidad de absorción.'
                : sellout < 24
                  ? 'La mezcla propuesta cae dentro del rango de mayor movimiento del submercado y mantiene un sell-out competitivo.'
                  : 'El proyecto es viable comercialmente, pero incrementa de forma material los meses de inventario de la zona.'}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function Control({ label, value, min, max, step, onChange, prefix = '', suffix = '', moneyValue = false }) {
  return (
    <div className="control-block">
      <div className="control-header">
        <span>{label}</span>
        <strong>{prefix}{moneyValue ? Number(value).toLocaleString('es-MX') : value}{suffix}</strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="range-ends"><span>{prefix}{min.toLocaleString('es-MX')}{suffix}</span><span>{prefix}{max.toLocaleString('es-MX')}{suffix}</span></div>
    </div>
  )
}

function Ficha({ project, onClose }) {
  const probability = [
    ['30 días', Math.max(6, Math.round(22 - project.medianDays / 11))],
    ['90 días', Math.max(20, Math.round(68 - project.medianDays / 4))],
    ['180 días', Math.min(92, Math.round(108 - project.medianDays / 5))],
    ['365 días', Math.min(98, Math.round(99 - project.medianDays / 30))],
  ]

  const printFicha = () => window.print()

  return (
    <div className="ficha-backdrop">
      <article className="ficha-sheet">
        <div className="ficha-actions no-print">
          <button className="secondary-button" onClick={onClose}>Cerrar</button>
          <button className="primary-button" onClick={printFicha}><Download size={15}/> Imprimir / PDF</button>
        </div>

        <header className="ficha-header">
          <div className="brand-lockup"><span className="brand-mark">G</span><span>GROWA / INMOBILIARIA</span></div>
          <div className="ficha-code">FICHA · {project.id.toUpperCase()} / 09.2026</div>
        </header>

        <div className="ficha-title-row">
          <div>
            <div className="eyebrow">ANÁLISIS DE MERCADO · MAZATLÁN</div>
            <h1>{project.name}</h1>
            <p>{project.zone}</p>
          </div>
          <div className="ficha-score"><span>Ajuste de mercado</span><strong>{project.score}</strong><em>/100</em></div>
        </div>

        <div className="ficha-rule" />

        <section className="ficha-hero-metrics">
          <Metric label="Precio observado" value={`$${project.priceM2.toLocaleString('es-MX')}/m²`} meta={`+${project.priceM2Change}% · 12 meses`} trend="up" />
          <Metric label="Tiempo mediano" value={`${project.medianDays} días`} meta="publicación → cierre" />
          <Metric label="Absorción" value={`${project.absorption} u/mes`} meta="ritmo observado" />
          <Metric label="Inventario" value={`${project.inventoryMonths} meses`} meta={project.risk} />
        </section>

        <div className="ficha-two-col">
          <section>
            <div className="section-title"><span>01</span><h3>LECTURA COMERCIAL</h3></div>
            <p className="lead-copy">El mercado comparable favorece <strong>{project.bestProduct}</strong>, con ticket de mayor movimiento en <strong>{project.ticket}</strong>. La señal de inventario actual se clasifica como <strong>{project.risk.toLowerCase()}</strong>.</p>
            <div className="ficha-mini-grid">
              <div><span>Unidades totales</span><strong>{project.totalUnits}</strong></div>
              <div><span>Disponibles</span><strong>{project.availableUnits}</strong></div>
              <div><span>Vendidas</span><strong>{project.soldUnits}</strong></div>
              <div><span>Reservadas</span><strong>{project.reservedUnits}</strong></div>
            </div>
          </section>

          <section>
            <div className="section-title"><span>02</span><h3>PROBABILIDAD DE VENTA</h3></div>
            <div className="probability-list">
              {probability.map(([period, pct]) => (
                <div key={period}><span>{period}</span><div><i style={{width:`${pct}%`}}/></div><strong>{pct}%</strong></div>
              ))}
            </div>
          </section>
        </div>

        <div className="ficha-two-col">
          <section>
            <div className="section-title"><span>03</span><h3>COMPRADOR</h3></div>
            <Distribution labels={['25–34','35–44','45–54','55+']} values={project.ageMix} />
            <div className="ficha-note"><span>Mayor incidencia</span><strong>{project.dominantBuyer} · {project.buyerOrigin}</strong></div>
          </section>
          <section>
            <div className="section-title"><span>04</span><h3>PRECIO / VELOCIDAD</h3></div>
            <div className="price-speed">
              {[-8,-4,0,4,8].map((delta) => {
                const p = project.priceM2 * (1 + delta/100)
                const days = Math.round(project.medianDays * Math.pow(1 + delta/100, 3.2))
                return <div key={delta}><span>{delta > 0 ? '+' : ''}{delta}%</span><strong>${Math.round(p/1000)}k/m²</strong><em>{days} días</em></div>
              })}
            </div>
          </section>
        </div>

        <footer className="ficha-footer">
          <span>Modelo demostrativo · datos de interfaz no contractuales</span>
          <span>Growa · inteligencia territorial aplicada</span>
        </footer>
      </article>
    </div>
  )
}

function App() {
  const [selected, setSelected] = useState(projects[0])
  const [metric, setMetric] = useState('Precio')
  const [section, setSection] = useState('Mercado')
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [fichaOpen, setFichaOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(p => `${p.name} ${p.zone}`.toLowerCase().includes(q))
  }, [query])

  const nav = ['Mercado','Proyectos','Comprador','Producto','Simulador']

  const navigate = (item) => {
    setSection(item)
    if (item === 'Simulador') setSimulatorOpen(true)
  }

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="rail-brand">G</div>
        <div className="rail-nav">
          <button className="rail-button active"><Home size={17}/></button>
          <button className="rail-button"><BarChart3 size={17}/></button>
          <button className="rail-button"><Building2 size={17}/></button>
          <button className="rail-button"><Users size={17}/></button>
        </div>
        <button className="rail-button rail-bottom"><Menu size={17}/></button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="wordmark"><strong>GROWA</strong><span>INMOBILIARIA</span></div>
          <nav className="topnav">
            {nav.map(item => <button key={item} className={section === item ? 'active' : ''} onClick={() => navigate(item)}>{item}</button>)}
          </nav>
          <div className="top-actions">
            <span className="data-state"><i/> DEMO DE PRODUCTO</span>
            <button className="avatar">AM</button>
          </div>
        </header>

        <main className="market-layout">
          <section className="map-stage">
            <div className="map-toolbar">
              <div className="search-box">
                <Search size={16}/>
                <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Zona, desarrollo o corredor" />
                <kbd>⌘ K</kbd>
              </div>
              <div className="metric-switch">
                {['Precio','Absorción','Venta','Inventario'].map(item => (
                  <button key={item} onClick={()=>setMetric(item)} className={metric === item ? 'active' : ''}>{item}</button>
                ))}
              </div>
            </div>

            <MapCanvas selected={selected} onSelect={setSelected} metric={metric} />

            <div className="map-caption">
              <div><span>MAZATLÁN</span><strong>Mercado vertical · septiembre 2026</strong></div>
              <div className="legend"><i className="legend-dot dark"/> seleccionado <i className="legend-dot light"/> comparable</div>
            </div>

            <div className="floating-project-list">
              <div className="floating-head"><span>PROYECTOS</span><em>{filteredProjects.length}</em></div>
              {filteredProjects.slice(0,4).map(p => (
                <button key={p.id} className={selected.id === p.id ? 'active' : ''} onClick={()=>setSelected(p)}>
                  <div><strong>{p.name}</strong><span>{p.zone.split(' · ')[0]}</span></div>
                  <div><strong>${Math.round(p.priceM2/1000)}k</strong><span>{p.absorption} u/mes</span></div>
                </button>
              ))}
            </div>
          </section>

          <aside className="insight-panel">
            <div className="project-context">
              <div>
                <div className="eyebrow">DESARROLLO SELECCIONADO</div>
                <h1>{selected.name}</h1>
                <p><MapPin size={13}/> {selected.zone}</p>
              </div>
              <button className="icon-button"><Layers3 size={17}/></button>
            </div>

            {section === 'Mercado' && <>
              <div className="hero-stat-grid">
                <Metric label="Precio observado" value={`$${selected.priceM2.toLocaleString('es-MX')}/m²`} meta={`↗ ${selected.priceM2Change}% · 12m`} trend="up" />
                <Metric label="Tiempo mediano" value={`${selected.medianDays} días`} meta="publicación → cierre" />
                <Metric label="Absorción" value={`${selected.absorption} u/mes`} meta="últimos 6 meses" />
                <Metric label="Inventario" value={`${selected.inventoryMonths} meses`} meta={selected.risk} />
              </div>

              <section className="panel-section price-section">
                <div className="section-heading"><div><span>PRECIO / M²</span><strong>12 meses</strong></div><button>Ver serie</button></div>
                <Sparkline values={selected.priceHistory}/>
                <div className="chart-foot"><span>${selected.priceHistory[0].toFixed(1)}k</span><span>HOY · ${selected.priceHistory.at(-1).toFixed(1)}k</span></div>
              </section>

              <section className="panel-section commercial-reading">
                <div className="section-heading"><div><span>LECTURA COMERCIAL</span><strong>Señal de mercado</strong></div><div className="score-badge">{selected.score}/100</div></div>
                <p>El producto con mejor movimiento observado es <b>{selected.bestProduct}</b>. El rango de ticket con mayor compatibilidad comercial se concentra en <b>{selected.ticket}</b>.</p>
                <div className="reading-tags"><span>{selected.dominantBuyer}</span><span>{selected.buyerOrigin}</span><span>{selected.risk}</span></div>
              </section>

              <section className="panel-section inventory-section">
                <div className="section-heading"><div><span>INVENTARIO</span><strong>{selected.availableUnits} disponibles de {selected.totalUnits}</strong></div><span className="mono">{selected.inventoryPct}%</span></div>
                <div className="inventory-bar"><i style={{width:`${selected.soldUnits/selected.totalUnits*100}%`}}/><i className="reserved" style={{width:`${selected.reservedUnits/selected.totalUnits*100}%`}}/></div>
                <div className="inventory-labels"><span>Vendidas {selected.soldUnits}</span><span>Reservadas {selected.reservedUnits}</span><span>Disponibles {selected.availableUnits}</span></div>
              </section>
            </>}

            {section === 'Proyectos' && <section className="section-view">
              <div className="section-view-head"><span>BENCHMARK</span><h2>Competidores directos</h2><p>No por distancia: por precio, tipología, tamaño y ritmo de venta.</p></div>
              <div className="benchmark-list">
                {projects.filter(p=>p.id!==selected.id).map((p,i)=><button key={p.id} onClick={()=>setSelected(p)}><span>0{i+1}</span><div><strong>{p.name}</strong><small>{p.zone}</small></div><div><strong>{Math.max(58, 92-i*11)}%</strong><small>similitud</small></div><ChevronRight size={16}/></button>)}
              </div>
            </section>}

            {section === 'Comprador' && <section className="section-view">
              <div className="section-view-head"><span>COMPRADOR</span><h2>Quién convierte, no quién pregunta.</h2><p>Perfil observado sobre cierres del segmento comparable.</p></div>
              <Distribution labels={['25–34 años','35–44 años','45–54 años','55+ años']} values={selected.ageMix}/>
              <div className="buyer-callout"><Users size={18}/><div><span>Mayor conversión</span><strong>{selected.dominantBuyer}</strong><p>{selected.buyerOrigin}</p></div></div>
              <div className="section-heading compact"><div><span>ORIGEN DE COMPRA</span><strong>participación</strong></div></div>
              <Distribution labels={['Mazatlán','Sinaloa','Nuevo León','CDMX','Extranjero','Otros']} values={selected.originMix}/>
            </section>}

            {section === 'Producto' && <section className="section-view">
              <div className="section-view-head"><span>PRODUCTO</span><h2>Qué está premiando el mercado.</h2><p>Lectura combinada de velocidad, precio y competencia.</p></div>
              <div className="product-fit-card"><div className="product-rank">01</div><div><span>Mayor ajuste</span><strong>{selected.bestProduct}</strong><p>{selected.ticket} · absorción superior al promedio del submercado</p></div><em>{selected.score}</em></div>
              <div className="mix-visual">
                {['1 recámara','2 recámaras','3 recámaras','Penthouse'].map((label,i)=><div key={label}><span>{label}</span><i><b style={{width:`${selected.unitMix[i]}%`}}/></i><strong>{selected.unitMix[i]}%</strong></div>)}
              </div>
              <div className="product-warning"><Target size={17}/><p><strong>Hueco observable:</strong> mantener ticket dentro de {selected.ticket} reduce la competencia directa frente al inventario más caro.</p></div>
            </section>}

            <div className="panel-actions">
              <button className="secondary-button" onClick={()=>setFichaOpen(true)}>Generar ficha</button>
              <button className="primary-button" onClick={()=>setSimulatorOpen(true)}><SlidersHorizontal size={15}/> Simular proyecto</button>
            </div>
          </aside>
        </main>

        <section className="market-strip">
          <div className="strip-label"><span>PULSO DE MERCADO</span><strong>Mazatlán</strong></div>
          <div><span>Precio medio</span><strong>${marketStats.avgPriceM2.toLocaleString('es-MX')}/m²</strong><em><ArrowUpRight size={12}/> {marketStats.yoyPrice}%</em></div>
          <div><span>Tiempo de venta</span><strong>{marketStats.avgDays} días</strong><em>mediana</em></div>
          <div><span>Absorción</span><strong>{marketStats.absorption} u/mes</strong><em>proyecto medio</em></div>
          <div><span>Inventario</span><strong>{marketStats.inventoryMonths} meses</strong><em>mercado</em></div>
          <div><span>Oferta activa</span><strong>{marketStats.activeUnits.toLocaleString('es-MX')}</strong><em>{marketStats.activeProjects} proyectos</em></div>
          <button className="strip-expand"><Gauge size={15}/> Ver mercado completo</button>
        </section>
      </div>

      {simulatorOpen && <Simulator project={selected} onClose={()=>{setSimulatorOpen(false); if(section==='Simulador') setSection('Mercado')}} />}
      {fichaOpen && <Ficha project={selected} onClose={()=>setFichaOpen(false)} />}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
