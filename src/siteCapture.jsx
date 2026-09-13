import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Crosshair, Ruler, ScanLine, RotateCcw, Trash2, Check, AlertTriangle, Target, SquareDashed, Move3D } from 'lucide-react'
import './siteCapture.css'

const AW=192, AH=144
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)
const shoelace=pts=>Math.abs(pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+p.x*q.y-q.x*p.y},0))/2

function analyzeFrame(ctx,w,h){
  const img=ctx.getImageData(0,0,w,h), src=img.data
  const g=new Float32Array(w*h)
  let mean=0
  for(let i=0,j=0;i<src.length;i+=4,j++){const v=.2126*src[i]+.7152*src[i+1]+.0722*src[i+2];g[j]=v;mean+=v}
  mean/=g.length
  const gx=new Float32Array(w*h), gy=new Float32Array(w*h), mag=new Float32Array(w*h)
  let mSum=0,mSq=0
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x
    const sx=-g[i-w-1]-2*g[i-1]-g[i+w-1]+g[i-w+1]+2*g[i+1]+g[i+w+1]
    const sy=-g[i-w-1]-2*g[i-w]-g[i-w+1]+g[i+w-1]+2*g[i+w]+g[i+w+1]
    gx[i]=sx;gy[i]=sy;const m=Math.hypot(sx,sy);mag[i]=m;mSum+=m;mSq+=m*m
  }
  const n=(w-2)*(h-2),mMean=mSum/n,mStd=Math.sqrt(Math.max(0,mSq/n-mMean*mMean)),thr=mMean+mStd*.85
  const edges=[]
  for(let y=2;y<h-2;y+=1)for(let x=2;x<w-2;x+=1){const i=y*w+x;if(mag[i]>thr)edges.push({x,y,m:mag[i]})}
  const sharpness=mMean
  const density=edges.length/(w*h)

  // Shi-Tomasi-like corner score using local gradient tensor.
  const candidates=[]
  for(let y=6;y<h-6;y+=3)for(let x=6;x<w-6;x+=3){
    let a=0,b=0,c=0
    for(let yy=-3;yy<=3;yy++)for(let xx=-3;xx<=3;xx++){const i=(y+yy)*w+(x+xx);a+=gx[i]*gx[i];b+=gx[i]*gy[i];c+=gy[i]*gy[i]}
    const tr=a+c,det=a*c-b*b,disc=Math.sqrt(Math.max(0,tr*tr-4*det)),lambda=(tr-disc)/2
    if(lambda>12000)candidates.push({x,y,s:lambda})
  }
  candidates.sort((a,b)=>b.s-a.s)
  const corners=[]
  for(const c of candidates){if(corners.length>=55)break;if(corners.every(p=>dist(p,c)>7))corners.push(c)}

  // Compact probabilistic Hough transform over strong edge pixels.
  const strong=edges.filter((_,i)=>i%Math.max(1,Math.floor(edges.length/1200))===0 || edges.length<1200)
  const diag=Math.ceil(Math.hypot(w,h)), thetaCount=90, acc=new Uint16Array(thetaCount*(diag*2+1)), rb=diag*2+1
  for(const p of strong){for(let ti=0;ti<thetaCount;ti++){const t=(ti*2)*Math.PI/180;const r=Math.round(p.x*Math.cos(t)+p.y*Math.sin(t))+diag;if(r>=0&&r<rb)acc[ti*rb+r]++}}
  const peaks=[]
  for(let ti=0;ti<thetaCount;ti++)for(let r=0;r<rb;r++){const v=acc[ti*rb+r];if(v>10)peaks.push({ti,r:r-diag,v})}
  peaks.sort((a,b)=>b.v-a.v)
  const lines=[]
  for(const p of peaks){if(lines.length>=12)break;const theta=p.ti*2*Math.PI/180;if(lines.some(l=>Math.abs(l.theta-theta)<.08&&Math.abs(l.r-p.r)<7))continue;lines.push({theta,r:p.r,v:p.v})}

  return {mean,sharpness,density,corners,lines}
}

function lineSegment(line,w,h){
  const c=Math.cos(line.theta),s=Math.sin(line.theta),pts=[]
  if(Math.abs(s)>1e-6){let y=(line.r-0*c)/s;if(y>=0&&y<=h)pts.push({x:0,y});y=(line.r-w*c)/s;if(y>=0&&y<=h)pts.push({x:w,y})}
  if(Math.abs(c)>1e-6){let x=(line.r-0*s)/c;if(x>=0&&x<=w)pts.push({x,y:0});x=(line.r-h*s)/c;if(x>=0&&x<=w)pts.push({x,y:h})}
  return pts.length>=2?[pts[0],pts[1]]:null
}

function nearestSnap(p,analysis,mode){
  if(!analysis)return {...p,type:'libre'}
  let best=null,bestD=18
  if(mode!=='borde')for(const c of analysis.corners){const d=dist(p,c);if(d<bestD){best={x:c.x,y:c.y,type:'vértice'};bestD=d}}
  if(mode!=='punto')for(const l of analysis.lines){const c=Math.cos(l.theta),s=Math.sin(l.theta);const signed=p.x*c+p.y*s-l.r;const d=Math.abs(signed);if(d<bestD){best={x:p.x-signed*c,y:p.y-signed*s,type:'borde'};bestD=d}}
  return best||{...p,type:'libre'}
}

export default function SiteCapture(){
  const videoRef=useRef(null), overlayRef=useRef(null), workRef=useRef(null), streamRef=useRef(null), rafRef=useRef(null)
  const [started,setStarted]=useState(false),[cameraError,setCameraError]=useState('')
  const [analysis,setAnalysis]=useState(null),[mode,setMode]=useState('auto'),[points,setPoints]=useState([])
  const [scale,setScale]=useState(null),[reference,setReference]=useState(.297),[calibrationMode,setCalibrationMode]=useState(false)
  const [frozen,setFrozen]=useState(false),[message,setMessage]=useState('Inicia la cámara y apunta a una superficie con bordes claros.')
  const [orientation,setOrientation]=useState({beta:null,gamma:null})

  const guidance=useMemo(()=>{
    if(!analysis)return {level:'idle',text:'Esperando cámara'}
    if(analysis.mean<45)return {level:'bad',text:'Muy oscuro · aumenta la iluminación'}
    if(analysis.mean>220)return {level:'bad',text:'Exceso de luz · evita reflejos'}
    if(analysis.sharpness<38)return {level:'move',text:'Imagen poco definida · mantén el teléfono estable o acércate'}
    if(analysis.corners.length<6)return {level:'move',text:'Faltan referencias · apunta a esquinas, juntas o bordes definidos'}
    if(analysis.density>.26)return {level:'move',text:'Demasiado detalle · acércate a la superficie que quieres medir'}
    return {level:'ready',text:'Escena utilizable · toca un borde o vértice'}
  },[analysis])

  const measurement=useMemo(()=>{
    if(points.length<2)return null
    if(points.length===2)return {kind:'length',px:dist(points[0],points[1]),m:scale?dist(points[0],points[1])*scale:null}
    const areaPx=shoelace(points)
    return {kind:'area',px:areaPx,m2:scale?areaPx*scale*scale:null,perimeter:scale?points.reduce((s,p,i)=>s+dist(p,points[(i+1)%points.length]),0)*scale:null}
  },[points,scale])

  useEffect(()=>()=>stop(),[])
  useEffect(()=>{
    const h=e=>setOrientation({beta:Number.isFinite(e.beta)?e.beta:null,gamma:Number.isFinite(e.gamma)?e.gamma:null})
    window.addEventListener('deviceorientation',h,true);return()=>window.removeEventListener('deviceorientation',h,true)
  },[])

  async function start(){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false})
      streamRef.current=stream;setStarted(true);setCameraError('');setFrozen(false)
      requestAnimationFrame(()=>{if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play().catch(()=>{})}})
      loop();setMessage('La cámara detecta vértices y bordes. Toca directamente sobre la geometría que quieras conservar.')
    }catch(e){setCameraError(e?.message||'No fue posible abrir la cámara');setMessage('No se pudo abrir la cámara. Revisa el permiso del navegador.')}
  }
  function stop(){if(rafRef.current)cancelAnimationFrame(rafRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null}
  function loop(){
    let last=0
    const tick=t=>{
      rafRef.current=requestAnimationFrame(tick);if(frozen)return
      const v=videoRef.current;if(!v?.videoWidth||t-last<280)return;last=t
      const c=workRef.current,ctx=c.getContext('2d',{willReadFrequently:true});c.width=AW;c.height=AH;ctx.drawImage(v,0,0,AW,AH)
      const a=analyzeFrame(ctx,AW,AH);setAnalysis(a);drawOverlay(a)
    };rafRef.current=requestAnimationFrame(tick)
  }
  function drawOverlay(a){
    const c=overlayRef.current;if(!c)return;const rect=c.getBoundingClientRect();c.width=Math.max(1,Math.round(rect.width*devicePixelRatio));c.height=Math.max(1,Math.round(rect.height*devicePixelRatio));const ctx=c.getContext('2d');ctx.scale(devicePixelRatio,devicePixelRatio);ctx.clearRect(0,0,rect.width,rect.height)
    const sx=rect.width/AW,sy=rect.height/AH
    ctx.lineWidth=1.3;ctx.strokeStyle='rgba(99,255,166,.85)';for(const l of a.lines){const seg=lineSegment(l,AW,AH);if(!seg)continue;ctx.beginPath();ctx.moveTo(seg[0].x*sx,seg[0].y*sy);ctx.lineTo(seg[1].x*sx,seg[1].y*sy);ctx.stroke()}
    ctx.fillStyle='rgba(255,255,255,.9)';for(const p of a.corners.slice(0,40)){ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,2.2,0,Math.PI*2);ctx.fill()}
    points.forEach((p,i)=>{ctx.fillStyle='#ffd65a';ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#111';ctx.font='600 10px sans-serif';ctx.fillText(String(i+1),p.x*sx-3,p.y*sy+3)})
    if(points.length>1){ctx.strokeStyle='#ffd65a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(points[0].x*sx,points[0].y*sy);for(const p of points.slice(1))ctx.lineTo(p.x*sx,p.y*sy);if(points.length>2)ctx.closePath();ctx.stroke()}
  }
  useEffect(()=>{if(analysis)drawOverlay(analysis)},[points,analysis])

  function tap(e){
    if(!started||!analysis)return
    const r=overlayRef.current.getBoundingClientRect(),p={x:(e.clientX-r.left)/r.width*AW,y:(e.clientY-r.top)/r.height*AH}
    const snapped=nearestSnap(p,analysis,mode)
    setPoints(prev=>prev.length>=8?[snapped]:[...prev,snapped])
    setMessage(snapped.type==='libre'?'Punto manual añadido. Intenta tocar más cerca de una esquina o borde para ajuste automático.':`Ajustado automáticamente a ${snapped.type}.`)
  }
  function calibrate(){
    if(points.length!==2){setCalibrationMode(true);setPoints([]);setMessage('Calibración: toca dos extremos de una distancia conocida sobre la misma superficie.');return}
    const px=dist(points[0],points[1]);if(px<3)return
    setScale(reference/px);setCalibrationMode(false);setPoints([]);setMessage(`Escala local fijada con ${reference} m. Ahora puedes medir líneas o áreas sobre ese mismo plano.`)
  }
  function reset(){setPoints([]);setScale(null);setCalibrationMode(false);setMessage('Medición reiniciada.');if(analysis)drawOverlay(analysis)}
  function toggleFreeze(){setFrozen(v=>!v);setMessage(frozen?'Análisis en vivo reanudado.':'Imagen congelada. Puedes marcar puntos con precisión.')}

  return <div className="sc-app">
    <header className="sc-head"><div><span>GROWA · CAPTURA DE SITIO</span><h1>Medición visual inteligente</h1><p>La cámara encuentra bordes y vértices; tú confirmas la geometría y el sistema mide sobre el plano.</p></div><div className={`sc-status ${guidance.level}`}><b>{guidance.level==='ready'?<Check/>:<AlertTriangle/>}</b><span>{guidance.text}</span></div></header>

    <main className="sc-layout">
      <section className="sc-camera-card">
        <div className="sc-toolbar">
          <div className="sc-modes">{['auto','punto','borde'].map(x=><button key={x} className={mode===x?'active':''} onClick={()=>setMode(x)}>{x}</button>)}</div>
          <button onClick={toggleFreeze} disabled={!started}>{frozen?'Reanudar imagen':'Congelar imagen'}</button>
        </div>
        <div className="sc-camera">
          {started?<video ref={videoRef} autoPlay muted playsInline/>:<div className="sc-empty"><Camera/><strong>{cameraError||'Cámara lista para iniciar'}</strong><span>No necesitas crear puntos a mano: la captura ajusta cada toque al borde o vértice más cercano.</span></div>}
          <canvas ref={overlayRef} onPointerDown={tap}/><div className="sc-reticle"><Crosshair/></div>
          <div className="sc-hud"><span>VÉRTICES {analysis?.corners.length||0}</span><span>LÍNEAS {analysis?.lines.length||0}</span><span>NITIDEZ {analysis?Math.round(analysis.sharpness):'—'}</span></div>
        </div>
        <canvas ref={workRef} className="sc-work"/>
        <div className="sc-actions">
          {!started?<button className="primary" onClick={start}><Camera/> Iniciar cámara</button>:<button onClick={()=>setPoints([])}><Trash2/> Limpiar puntos</button>}
          <button className={calibrationMode?'active':''} onClick={calibrate}><Target/> {scale?'Recalibrar':calibrationMode&&points.length===2?'Aplicar escala':'Calibrar escala'}</button>
          <select value={reference} onChange={e=>setReference(Number(e.target.value))}><option value="0.297">A4 · 29.7 cm</option><option value="0.210">A4 · 21.0 cm</option><option value="0.0856">Tarjeta · 8.56 cm</option><option value="1">Referencia · 1 m</option></select>
          <button onClick={reset}><RotateCcw/> Reiniciar</button>
        </div>
      </section>

      <aside className="sc-result">
        <div className="sc-result-head"><span>RESULTADO</span><strong>{calibrationMode?'Calibración':points.length>=3?'Superficie':points.length===2?'Distancia':'Sin selección'}</strong></div>
        <div className="sc-kpis">
          <K label="Puntos" value={points.length}/><K label="Escala" value={scale?`${(scale*1000).toFixed(2)} mm/px`:'sin calibrar'}/><K label="Pitch" value={Number.isFinite(orientation.beta)?`${orientation.beta.toFixed(0)}°`:'—'}/><K label="Roll" value={Number.isFinite(orientation.gamma)?`${orientation.gamma.toFixed(0)}°`:'—'}/>
        </div>
        <section className="sc-measure"><h2><Ruler/> Medición</h2>{!measurement?<p>Toca 2 puntos para medir una distancia o 3–8 para cerrar un área. Los puntos se ajustan automáticamente a la geometría detectada.</p>:measurement.kind==='length'?<div className="sc-big"><span>Distancia</span><strong>{measurement.m?`${measurement.m.toFixed(3)} m`:`${measurement.px.toFixed(1)} px`}</strong><small>{scale?'métrica local sobre el plano':'calibra una distancia conocida para obtener metros'}</small></div>:<div className="sc-big"><span>Área</span><strong>{measurement.m2?`${measurement.m2.toFixed(2)} m²`:`${measurement.px.toFixed(0)} px²`}</strong><small>{measurement.perimeter?`perímetro ${measurement.perimeter.toFixed(2)} m`:'calibra la escala para medir en unidades reales'}</small></div>}</section>
        <section><h2><ScanLine/> Qué está haciendo</h2><p><b>Blanco:</b> vértices candidatos. <b>Verde:</b> líneas dominantes. <b>Amarillo:</b> geometría que tú aceptaste. Cada toque se corrige al elemento detectado más cercano.</p></section>
        <section><h2><SquareDashed/> Uso que sí sirve</h2><p>Fachadas, bardas, puertas, claros, plataformas, pisos y cualquier superficie aproximadamente plana. Coloca una referencia conocida en el mismo plano, calibra una vez y mide sin dibujar a ojo.</p></section>
        <section className="sc-warning"><h2><Move3D/> Límite actual</h2><p>Esta versión mide de forma robusta <b>sobre un plano calibrado</b>. No te voy a mostrar metros 3D inventados con GPS y brújula del celular. El siguiente nivel 3D requiere AR métrico compatible o reconstrucción multivista en servidor.</p></section>
      </aside>
    </main>
  </div>
}
function K({label,value}){return <div><span>{label}</span><strong>{value}</strong></div>}
