import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Activity,
  Camera,
  Cpu,
  Crosshair,
  GitCompare,
  Layers3,
  MapPin,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'

const MODEL_API = (import.meta.env.VITE_GEOMETRY_API_URL || '').replace(/\/$/, '')
const BASELINE_KEY = 'growa_geometry_baseline_v1'
const MIN_BASELINE = 2.5
const MAX_KEYFRAMES = 36

const MODEL_STACK = [
  ['Coincidencia visual', 'ALIKED + LightGlue', 'encuentra el mismo detalle entre vistas'],
  ['Relocalización', 'hloc', 'recupera pose 6-DoF contra un modelo previo'],
  ['Reconstrucción rápida', 'VGGT', 'profundidad, cámaras y point maps'],
  ['Refinamiento GIS', 'OpenSfM / COLMAP', 'ajuste, georreferencia y nube densa'],
  ['Cambio 3D', 'Open3D + PDAL', 'registro, superficies y diferencias temporales'],
]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const finite = Number.isFinite
const rad = d => d * Math.PI / 180
const deg = r => r * 180 / Math.PI
const norm360 = d => ((d % 360) + 360) % 360
const length3 = v => Math.hypot(v.x, v.y, v.z)
const distance3 = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z)
const dot = (a,b) => a.x*b.x + a.y*b.y + a.z*b.z
const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})
const mul = (a,s) => ({x:a.x*s,y:a.y*s,z:a.z*s})
const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x})
const normalize = v => { const n = length3(v) || 1; return {x:v.x/n,y:v.y/n,z:v.z/n} }

function geoToLocal(position, reference) {
  if (!position || !reference) return null
  const lat0 = rad(reference.lat)
  const east = (position.lon-reference.lon) * 111320 * Math.cos(lat0)
  const north = (position.lat-reference.lat) * 110540
  const up = finite(position.alt) && finite(reference.alt) ? position.alt-reference.alt : 0
  return { x:east, y:north, z:up }
}

function rayFromPose(heading, elevation) {
  if (!finite(heading)) return null
  const h = rad(norm360(heading))
  const e = rad(finite(elevation) ? elevation : 0)
  const ce = Math.cos(e)
  return normalize({ x:Math.sin(h)*ce, y:Math.cos(h)*ce, z:Math.sin(e) })
}

function triangulateRays(a, b) {
  const p1 = a.origin, p2 = b.origin, d1 = normalize(a.dir), d2 = normalize(b.dir)
  const w0 = sub(p1,p2)
  const A = dot(d1,d1), B = dot(d1,d2), C = dot(d2,d2)
  const D = dot(d1,w0), E = dot(d2,w0)
  const den = A*C-B*B
  if (Math.abs(den) < 1e-5) return null
  const s = (B*E-C*D)/den
  const t = (A*E-B*D)/den
  if (s < 0 || t < 0) return null
  const q1 = add(p1,mul(d1,s))
  const q2 = add(p2,mul(d2,t))
  const point = mul(add(q1,q2),0.5)
  const gap = distance3(q1,q2)
  const baseline = distance3(p1,p2)
  const angle = deg(Math.acos(clamp(Math.abs(dot(d1,d2)),-1,1)))
  const avgAcc = [a.accuracy,b.accuracy].filter(finite).reduce((s,v,_,arr)=>s+v/arr.length,0) || null
  const score = Math.round(clamp(
    (clamp((baseline-2)/8,0,1)*30) +
    (clamp(angle/18,0,1)*30) +
    (clamp(1-gap/2.5,0,1)*25) +
    (finite(avgAcc)?clamp(1-avgAcc/20,0,1)*15:6),
  0,100))
  return { point, gap, baseline, angle, score, avgAcc }
}

function polygonAreaXY(points) {
  if (points.length < 3) return 0
  let sum = 0
  for (let i=0;i<points.length;i++) {
    const a = points[i], b = points[(i+1)%points.length]
    sum += a.x*b.y - b.x*a.y
  }
  return Math.abs(sum)/2
}

function polygonArea3D(points) {
  if (points.length < 3) return 0
  const p0 = points[0]
  let area = 0
  for (let i=1;i<points.length-1;i++) {
    const v1 = sub(points[i],p0)
    const v2 = sub(points[i+1],p0)
    area += length3(cross(v1,v2))/2
  }
  return area
}

function surfaceType(points) {
  if (points.length < 3) return 'superficie'
  const n = normalize(cross(sub(points[1],points[0]),sub(points[2],points[0])))
  const verticality = Math.abs(n.z)
  if (verticality > .86) return 'horizontal / plataforma'
  if (verticality < .28) return 'vertical / fachada'
  return 'inclinada / talud'
}

function fmt(n, decimals=1, suffix='') {
  return finite(n) ? `${n.toFixed(decimals)}${suffix}` : '—'
}

function pointCode(index) { return `P${String(index+1).padStart(2,'0')}` }

function demoState(version='t0') {
  const extension = version === 't1' ? 3.2 : 0
  const pts = [
    [-12,-18,0], [16,-18,.4], [17,16,.8], [-13,17,.2],
    [-5,-4,.2], [8+extension,-4,.4], [8+extension,7,.6], [-5,7,.3],
    [-5,-4,7.8], [8+extension,-4,8.1], [8+extension,7,8.0], [-5,7,7.9],
  ].map((v,i)=>({id:pointCode(i),label:pointCode(i),x:v[0],y:v[1],z:v[2],score:version==='t0'?91:88,source:'demo'}))
  const surfaces = [
    {id:'S01',name:'Predio',pointIds:['P01','P02','P03','P04'],kind:'horizontal / plataforma'},
    {id:'S02',name:'Huella construida',pointIds:['P05','P06','P07','P08'],kind:'horizontal / plataforma'},
    {id:'S03',name:'Cubierta',pointIds:['P09','P10','P11','P12'],kind:'horizontal / plataforma'},
    {id:'S04',name:'Fachada sur',pointIds:['P05','P06','P10','P09'],kind:'vertical / fachada'},
    {id:'S05',name:'Fachada este',pointIds:['P06','P07','P11','P10'],kind:'vertical / fachada'},
  ]
  return {points:pts,surfaces,volumes:[]}
}

function captureVideoFrame(video, quality=.76) {
  return new Promise(resolve => {
    if (!video?.videoWidth || !video?.videoHeight) return resolve(null)
    const targetW = Math.min(960, video.videoWidth)
    const ratio = targetW/video.videoWidth
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = Math.round(video.videoHeight*ratio)
    const ctx = canvas.getContext('2d',{alpha:false})
    ctx.drawImage(video,0,0,canvas.width,canvas.height)
    canvas.toBlob(blob => resolve(blob),'image/jpeg',quality)
  })
}

function GeometryViewer({ points, surfaces, volumes, selectedIds, resetToken }) {
  const host = useRef(null)
  const sceneRef = useRef(null)
  const dynamicRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)

  useEffect(() => {
    if (!host.current) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0f0e)
    scene.fog = new THREE.Fog(0x0d0f0e,60,130)
    const camera = new THREE.PerspectiveCamera(42,1,.1,500)
    camera.position.set(28,-34,25)
    const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.current.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera,renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0,0,2)
    controls.maxPolarAngle = Math.PI*.49
    const grid = new THREE.GridHelper(80,40,0x3c413e,0x222724)
    grid.rotation.x = Math.PI/2
    scene.add(grid)
    const axes = new THREE.AxesHelper(4)
    scene.add(axes)
    scene.add(new THREE.HemisphereLight(0xffffff,0x313631,1.5))
    const light = new THREE.DirectionalLight(0xffffff,2.1)
    light.position.set(20,-20,35)
    scene.add(light)
    const dynamic = new THREE.Group()
    scene.add(dynamic)
    sceneRef.current = scene
    dynamicRef.current = dynamic
    cameraRef.current = camera
    controlsRef.current = controls

    const resize = () => {
      if (!host.current) return
      const w = host.current.clientWidth || 1, h = host.current.clientHeight || 1
      camera.aspect = w/h
      camera.updateProjectionMatrix()
      renderer.setSize(w,h,false)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host.current)
    resize()
    let frame
    const animate = () => { controls.update(); renderer.render(scene,camera); frame=requestAnimationFrame(animate) }
    animate()
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const group = dynamicRef.current
    if (!group) return
    while (group.children.length) {
      const child = group.children.pop()
      child.traverse?.(obj=>{ obj.geometry?.dispose?.(); if (Array.isArray(obj.material)) obj.material.forEach(m=>m.dispose?.()); else obj.material?.dispose?.() })
    }
    const byId = new Map(points.map(p=>[p.id,p]))

    surfaces.forEach((surface,index) => {
      const pts = surface.pointIds.map(id=>byId.get(id)).filter(Boolean)
      if (pts.length<3) return
      const positions=[]
      for (let i=1;i<pts.length-1;i++) positions.push(
        pts[0].x,pts[0].y,pts[0].z,
        pts[i].x,pts[i].y,pts[i].z,
        pts[i+1].x,pts[i+1].y,pts[i+1].z,
      )
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
      geo.computeVertexNormals()
      const material = new THREE.MeshStandardMaterial({
        color:index===0?0x53645a:0xa7b1aa,
        transparent:true,
        opacity:index===0?.18:.28,
        side:THREE.DoubleSide,
        roughness:.84,
        metalness:.04,
      })
      group.add(new THREE.Mesh(geo,material))
      const lineGeo = new THREE.BufferGeometry().setFromPoints([...pts,pts[0]].map(p=>new THREE.Vector3(p.x,p.y,p.z)))
      group.add(new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:0xcbd2cd,transparent:true,opacity:.72})))
    })

    volumes.forEach(volume => {
      const pts = volume.baseIds.map(id=>byId.get(id)).filter(Boolean)
      if (pts.length<3) return
      const shape = new THREE.Shape()
      shape.moveTo(pts[0].x,pts[0].y)
      pts.slice(1).forEach(p=>shape.lineTo(p.x,p.y))
      shape.closePath()
      const z0 = pts.reduce((s,p)=>s+p.z,0)/pts.length
      const geo = new THREE.ExtrudeGeometry(shape,{depth:volume.height,bevelEnabled:false})
      geo.translate(0,0,z0)
      const mesh = new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0xd6ddd8,transparent:true,opacity:.18,side:THREE.DoubleSide}))
      group.add(mesh)
    })

    points.forEach(point => {
      const selected = selectedIds.includes(point.id)
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(selected?.42:.28,18,18),
        new THREE.MeshStandardMaterial({color:selected?0xffffff:0xa7b2ab,emissive:selected?0x333333:0x000000,roughness:.45})
      )
      sphere.position.set(point.x,point.y,point.z)
      sphere.userData.pointId = point.id
      group.add(sphere)
      const stemGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(point.x,point.y,0),new THREE.Vector3(point.x,point.y,point.z)])
      group.add(new THREE.Line(stemGeo,new THREE.LineBasicMaterial({color:0x343936,transparent:true,opacity:.42})))
    })
  }, [points,surfaces,volumes,selectedIds])

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current || !points.length) return
    const box = new THREE.Box3()
    points.forEach(p=>box.expandByPoint(new THREE.Vector3(p.x,p.y,p.z)))
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.x,size.y,size.z,8)
    controlsRef.current.target.copy(center)
    cameraRef.current.position.set(center.x+radius*.9,center.y-radius*1.25,center.z+radius*.75)
    controlsRef.current.update()
  }, [resetToken])

  return <div ref={host} className="geo-viewer" />
}

function GeometryLauncher() {
  const [open,setOpen] = useState(false)
  return <>
    <button className="geo-launcher" onClick={()=>setOpen(true)}><Crosshair size={15}/><span>GEOMETRÍA 3D</span><b>BETA</b></button>
    {open && <GeometryScanner onClose={()=>setOpen(false)} />}
  </>
}

function GeometryScanner({ onClose }) {
  const [session,setSession] = useState(false)
  const [paused,setPaused] = useState(false)
  const [cameraReady,setCameraReady] = useState(false)
  const [cameraError,setCameraError] = useState('')
  const [pose,setPose] = useState(null)
  const [orientation,setOrientation] = useState({heading:null,beta:null,gamma:null,elevation:null})
  const [reference,setReference] = useState(null)
  const [points,setPoints] = useState([])
  const [surfaces,setSurfaces] = useState([])
  const [volumes,setVolumes] = useState([])
  const [selectedIds,setSelectedIds] = useState([])
  const [pending,setPending] = useState(null)
  const [message,setMessage] = useState('Listo para crear geometría consultable del sitio.')
  const [keyframes,setKeyframes] = useState([])
  const [resetToken,setResetToken] = useState(0)
  const [baseline,setBaseline] = useState(()=>{
    try { return JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null') } catch { return null }
  })
  const [volumeHeight,setVolumeHeight] = useState(3)
  const [job,setJob] = useState(null)
  const [pipelineOpen,setPipelineOpen] = useState(false)
  const [online,setOnline] = useState(navigator.onLine)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const watchRef = useRef(null)
  const wakeRef = useRef(null)
  const orientationHandlerRef = useRef(null)
  const keyframeTimerRef = useRef(null)
  const referenceRef = useRef(null)
  const poseRef = useRef(null)

  useEffect(()=>{ referenceRef.current=reference },[reference])
  useEffect(()=>{ poseRef.current=pose },[pose])

  useEffect(()=>{
    const onOn=()=>setOnline(true), onOff=()=>setOnline(false)
    window.addEventListener('online',onOn); window.addEventListener('offline',onOff)
    return ()=>{ window.removeEventListener('online',onOn); window.removeEventListener('offline',onOff); stopAll() }
  },[])

  useEffect(()=>{
    if (!cameraReady || !session || paused) return
    const collect = async () => {
      if (keyframes.length >= MAX_KEYFRAMES) return
      const blob = await captureVideoFrame(videoRef.current,.7)
      if (!blob) return
      const p = poseRef.current
      setKeyframes(prev=>prev.length>=MAX_KEYFRAMES?prev:[...prev,{blob,at:Date.now(),pose:p}])
    }
    keyframeTimerRef.current = setInterval(collect,2200)
    return ()=>clearInterval(keyframeTimerRef.current)
  },[cameraReady,session,paused,keyframes.length])

  const localPose = useMemo(()=>geoToLocal(pose,reference),[pose,reference])
  const activeHeading = finite(pose?.heading) ? pose.heading : orientation.heading
  const baselineDistance = pending?.first && localPose ? distance3(pending.first.origin,localPose) : null

  const selectedPoints = useMemo(()=>selectedIds.map(id=>points.find(p=>p.id===id)).filter(Boolean),[selectedIds,points])
  const measurement = useMemo(()=>{
    if (selectedPoints.length===2) {
      const [a,b]=selectedPoints
      const horizontal=Math.hypot(a.x-b.x,a.y-b.y)
      const dz=b.z-a.z
      return {mode:'line',distance:distance3(a,b),horizontal,dz,slope:horizontal>.25?dz/horizontal*100:null}
    }
    if (selectedPoints.length>=3) return {mode:'area',area3d:polygonArea3D(selectedPoints),areaXY:polygonAreaXY(selectedPoints),kind:surfaceType(selectedPoints)}
    return null
  },[selectedPoints])

  const comparison = useMemo(()=>{
    if (!baseline?.points?.length || !points.length) return null
    const baseMap=new Map(baseline.points.map(p=>[p.id,p]))
    const currentMap=new Map(points.map(p=>[p.id,p]))
    const common=points.filter(p=>baseMap.has(p.id)).map(p=>({id:p.id,d:distance3(p,baseMap.get(p.id))}))
    const changed=common.filter(item=>item.d>.35)
    const added=points.filter(p=>!baseMap.has(p.id)).length
    const removed=baseline.points.filter(p=>!currentMap.has(p.id)).length
    const max=common.length?Math.max(...common.map(x=>x.d)):0
    const baseArea=(baseline.surfaces||[]).reduce((sum,s)=>sum+polygonAreaXY(s.pointIds.map(id=>baseMap.get(id)).filter(Boolean)),0)
    const nowArea=surfaces.reduce((sum,s)=>sum+polygonAreaXY(s.pointIds.map(id=>currentMap.get(id)).filter(Boolean)),0)
    return {changed:changed.length,added,removed,max,areaDelta:nowArea-baseArea}
  },[baseline,points,surfaces])

  const siteMetrics = useMemo(()=>{
    const zs=points.map(p=>p.z).filter(finite)
    const lot=surfaces.find(s=>s.name==='Predio')
    const footprint=surfaces.find(s=>s.name==='Huella construida')
    const byId=new Map(points.map(p=>[p.id,p]))
    const lotArea=lot?polygonAreaXY(lot.pointIds.map(id=>byId.get(id)).filter(Boolean)):null
    const footprintArea=footprint?polygonAreaXY(footprint.pointIds.map(id=>byId.get(id)).filter(Boolean)):null
    return {
      lotArea,
      footprintArea,
      occupation:finite(lotArea)&&finite(footprintArea)&&lotArea>0?footprintArea/lotArea*100:null,
      height:zs.length?Math.max(...zs)-Math.min(...zs):null,
      pointQuality:points.length?Math.round(points.reduce((s,p)=>s+(p.score||70),0)/points.length):null,
    }
  },[points,surfaces])

  async function startCamera() {
    try {
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false})
      streamRef.current=stream
      setCameraReady(true); setCameraError('')
      requestAnimationFrame(()=>{ if(videoRef.current) videoRef.current.srcObject=stream })
    } catch (error) {
      setCameraReady(false); setCameraError(error?.message || 'No fue posible abrir la cámara.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t=>t.stop())
    streamRef.current=null
    if (videoRef.current) videoRef.current.srcObject=null
    setCameraReady(false)
  }

  function positionFromBrowser(position) {
    return {
      lat:position.coords.latitude,
      lon:position.coords.longitude,
      alt:position.coords.altitude,
      accuracy:position.coords.accuracy,
      altAccuracy:position.coords.altitudeAccuracy,
      heading:position.coords.heading,
      speed:position.coords.speed,
      at:position.timestamp,
    }
  }

  function startGps() {
    return new Promise((resolve,reject)=>{
      if (!navigator.geolocation) return reject(new Error('GPS no disponible'))
      navigator.geolocation.getCurrentPosition(position=>{
        const next=positionFromBrowser(position)
        setPose(next)
        if (!referenceRef.current) {
          const ref={lat:next.lat,lon:next.lon,alt:finite(next.alt)?next.alt:0}
          referenceRef.current=ref; setReference(ref)
        }
        if (watchRef.current===null) watchRef.current=navigator.geolocation.watchPosition(p=>setPose(positionFromBrowser(p)),()=>{}, {enableHighAccuracy:true,maximumAge:250,timeout:20000})
        resolve(next)
      },reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000})
    })
  }

  async function startOrientation() {
    try {
      if (typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function') {
        const status=await DeviceOrientationEvent.requestPermission()
        if (status!=='granted') return
      }
      if (orientationHandlerRef.current) window.removeEventListener('deviceorientation',orientationHandlerRef.current,true)
      const handler=event=>{
        const heading=finite(event.webkitCompassHeading)?event.webkitCompassHeading:finite(event.alpha)?norm360(360-event.alpha):null
        const beta=finite(event.beta)?event.beta:null
        const elevation=finite(beta)?clamp(90-beta,-75,75):0
        setOrientation({heading,beta,gamma:finite(event.gamma)?event.gamma:null,elevation})
      }
      orientationHandlerRef.current=handler
      window.addEventListener('deviceorientation',handler,true)
    } catch {}
  }

  async function acquireWakeLock() {
    try { if ('wakeLock' in navigator && !wakeRef.current) wakeRef.current=await navigator.wakeLock.request('screen') } catch {}
  }

  async function startScan() {
    if (!online) { setMessage('La captura está diseñada para trabajar con internet. Conéctate y vuelve a iniciar.'); return }
    setMessage('Activando cámara, GPS y orientación…')
    setSession(true); setPaused(false)
    await Promise.allSettled([startCamera(),startGps(),startOrientation(),acquireWakeLock()])
    setMessage('Escaneo activo. Apunta la mira a un vértice y captura la primera observación.')
  }

  function pauseScan() { setPaused(true); setMessage('Escaneo pausado. La geometría permanece en memoria.') }
  function resumeScan() { setPaused(false); startCamera(); startGps().catch(()=>{}); startOrientation(); acquireWakeLock(); setMessage('Escaneo reanudado.') }

  function stopAll() {
    stopCamera()
    if (watchRef.current!==null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current=null
    if (orientationHandlerRef.current) window.removeEventListener('deviceorientation',orientationHandlerRef.current,true)
    orientationHandlerRef.current=null
    if (keyframeTimerRef.current) clearInterval(keyframeTimerRef.current)
    try { wakeRef.current?.release?.() } catch {}
    wakeRef.current=null
  }

  async function captureSighting() {
    if (!session || paused) return
    const local=geoToLocal(pose,referenceRef.current)
    const heading=activeHeading
    const dir=rayFromPose(heading,orientation.elevation)
    if (!local || !dir) { setMessage('Falta una pose válida. Mantén GPS y orientación activos antes de marcar.'); return }
    const blob=await captureVideoFrame(videoRef.current,.82)
    const observation={origin:local,dir,accuracy:pose?.accuracy,heading,elevation:orientation.elevation,at:Date.now(),frame:blob}
    if (!pending) {
      const id=pointCode(points.length)
      setPending({id,first:observation})
      setMessage(`${id} observado desde A. Muévete al menos ${MIN_BASELINE.toFixed(1)} m y vuelve a apuntar al mismo vértice.`)
      return
    }
    const baseline=distance3(pending.first.origin,local)
    if (baseline<MIN_BASELINE) { setMessage(`Base insuficiente: ${baseline.toFixed(1)} m. Aléjate ${(MIN_BASELINE-baseline).toFixed(1)} m más.`); return }
    const solved=triangulateRays(pending.first,observation)
    if (!solved || solved.angle<3.5) { setMessage('La geometría de observación es débil. Cambia más tu posición lateral y repite la segunda vista.'); return }
    const point={id:pending.id,label:pending.id,...solved.point,score:solved.score,gap:solved.gap,baseline:solved.baseline,angle:solved.angle,source:'triangulado'}
    setPoints(prev=>[...prev,point])
    setSelectedIds([point.id])
    if (pending.first.frame) setKeyframes(prev=>prev.length>=MAX_KEYFRAMES?prev:[...prev,{blob:pending.first.frame,at:pending.first.at,pose:null}])
    if (blob) setKeyframes(prev=>prev.length>=MAX_KEYFRAMES?prev:[...prev,{blob,at:Date.now(),pose}])
    setPending(null)
    setMessage(`${point.id} resuelto · confianza geométrica ${point.score}/100 · separación de rayos ${point.gap.toFixed(2)} m.`)
  }

  function cancelPending() { setPending(null); setMessage('Punto pendiente cancelado.') }

  function togglePoint(id) {
    setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])
  }

  function createSurface() {
    if (selectedPoints.length<3) { setMessage('Selecciona al menos tres puntos para crear una superficie.'); return }
    const id=`S${String(surfaces.length+1).padStart(2,'0')}`
    const kind=surfaceType(selectedPoints)
    const name=kind.includes('fachada')?`Fachada ${id}`:kind.includes('talud')?`Talud ${id}`:`Superficie ${id}`
    setSurfaces(prev=>[...prev,{id,name,pointIds:[...selectedIds],kind}])
    setMessage(`${name} creada · ${polygonArea3D(selectedPoints).toFixed(1)} m² · ${kind}.`)
  }

  function createVolume() {
    if (selectedPoints.length<3) { setMessage('Selecciona la base del volumen con tres o más puntos.'); return }
    const area=polygonAreaXY(selectedPoints)
    const id=`V${String(volumes.length+1).padStart(2,'0')}`
    setVolumes(prev=>[...prev,{id,baseIds:[...selectedIds],height:volumeHeight,area,volume:area*volumeHeight}])
    setMessage(`${id} creado · ${area.toFixed(1)} m² de base · ${(area*volumeHeight).toFixed(1)} m³.`)
  }

  function deleteSelection() {
    const ids=new Set(selectedIds)
    setPoints(prev=>prev.filter(p=>!ids.has(p.id)))
    setSurfaces(prev=>prev.filter(s=>!s.pointIds.some(id=>ids.has(id))))
    setVolumes(prev=>prev.filter(v=>!v.baseIds.some(id=>ids.has(id))))
    setSelectedIds([])
  }

  function saveBaseline() {
    const snapshot={points,surfaces,volumes,at:new Date().toISOString()}
    localStorage.setItem(BASELINE_KEY,JSON.stringify(snapshot))
    setBaseline(snapshot)
    setMessage('Estado T0 guardado. Un levantamiento posterior puede compararse punto por punto y superficie por superficie.')
  }

  function loadDemo(version) {
    const t0=demoState('t0')
    if (version==='t1' && !baseline) {
      const snap={...t0,at:new Date().toISOString()}
      localStorage.setItem(BASELINE_KEY,JSON.stringify(snap)); setBaseline(snap)
    }
    const state=demoState(version)
    setPoints(state.points); setSurfaces(state.surfaces); setVolumes(state.volumes); setSelectedIds([]); setPending(null); setResetToken(v=>v+1)
    setMessage(version==='t0'?'Demo T0 cargada: predio + edificio descompuestos en geometría consultable.':'Demo T1 cargada: el edificio se amplió 3.2 m hacia el este; revisa Comparación.')
  }

  function clearModel() {
    setPoints([]); setSurfaces([]); setVolumes([]); setSelectedIds([]); setPending(null); setMessage('Modelo limpio. Puedes iniciar un levantamiento nuevo.')
  }

  async function runAdvancedPipeline() {
    if (!MODEL_API) {
      setPipelineOpen(true)
      setMessage('La interfaz ya está preparada para el worker GPU. Falta conectar VITE_GEOMETRY_API_URL para ejecutar VGGT/OpenSfM/LightGlue en servidor; no se simulan resultados.')
      return
    }
    if (!keyframes.length) { setMessage('Captura algunas vistas antes de lanzar reconstrucción densa.'); return }
    try {
      setJob({status:'subiendo'})
      const form=new FormData()
      form.append('metadata',new Blob([JSON.stringify({reference,points,surfaces,createdAt:new Date().toISOString()})],{type:'application/json'}),'metadata.json')
      keyframes.forEach((frame,i)=>frame.blob && form.append('images',frame.blob,`frame-${String(i+1).padStart(3,'0')}.jpg`))
      const response=await fetch(`${MODEL_API}/jobs/reconstruct`,{method:'POST',body:form})
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data=await response.json()
      setJob({status:'en cola',id:data.id || data.jobId || 'job'})
      setMessage(`Reconstrucción avanzada enviada${data.id||data.jobId?` · ${data.id||data.jobId}`:''}.`)
    } catch (error) {
      setJob({status:'error'})
      setMessage(`No fue posible iniciar el procesamiento GPU: ${error.message}`)
    }
  }

  const qualityClass = !points.length?'neutral':siteMetrics.pointQuality>=80?'good':siteMetrics.pointQuality>=60?'warn':'bad'

  return <div className="geo-modal">
    <div className="geo-shell">
      <header className="geo-header">
        <div className="geo-title"><div className="geo-kicker">GROWA · INMOBILIARIA / GEOMETRÍA INTELIGENTE</div><h1>Escáner 3D de sitio</h1><p>Convierte vértices físicos en puntos, superficies, volúmenes y cambios medibles.</p></div>
        <div className="geo-header-actions">
          <span className={`geo-online ${online?'on':''}`}>{online?<Wifi size={13}/>:<WifiOff size={13}/>} {online?'Internet':'Sin conexión'}</span>
          <button onClick={onClose} className="geo-icon"><X size={19}/></button>
        </div>
      </header>

      <div className="geo-message"><span>{message}</span><b className={qualityClass}>{points.length?`CALIDAD ${siteMetrics.pointQuality}/100`:'SIN MODELO'}</b></div>

      <main className="geo-grid">
        <section className="geo-capture-panel">
          <div className="geo-panel-head"><div><span>01 · CAPTURA</span><strong>{session?(paused?'Sesión pausada':'Instrumentación activa'):'Preparar levantamiento'}</strong></div><em>{keyframes.length}/{MAX_KEYFRAMES} vistas</em></div>
          <div className="geo-camera-stage">
            {cameraReady?<video ref={videoRef} autoPlay muted playsInline/>:<div className="geo-camera-empty"><Camera size={26}/><strong>{session?'Cámara no disponible':'La cámara se activa al iniciar'}</strong><span>{cameraError || 'HTTPS · cámara trasera · GPS de alta precisión'}</span></div>}
            <div className="geo-crosshair"><i/><b/><span/></div>
            <div className="geo-hud-top"><span>GPS {finite(pose?.accuracy)?`±${Math.round(pose.accuracy)} m`:'—'}</span><span>RUMBO {finite(activeHeading)?`${Math.round(activeHeading)}°`:'—'}</span><span>ELEV. {fmt(orientation.elevation,0,'°')}</span></div>
            <div className="geo-hud-bottom"><div><span>E</span><b>{fmt(localPose?.x,1,' m')}</b></div><div><span>N</span><b>{fmt(localPose?.y,1,' m')}</b></div><div><span>Z</span><b>{fmt(localPose?.z,1,' m')}</b></div><div><span>BASE</span><b>{fmt(baselineDistance,1,' m')}</b></div></div>
          </div>
          <div className="geo-capture-actions">
            {!session?<button className="geo-primary" onClick={startScan}><Play size={15}/> Iniciar escaneo</button>:paused?<button className="geo-primary" onClick={resumeScan}><Play size={15}/> Reanudar</button>:<button className="geo-secondary" onClick={pauseScan}><Pause size={15}/> Pausar</button>}
            <button className="geo-target" disabled={!session||paused} onClick={captureSighting}><Crosshair size={16}/>{pending?`Resolver ${pending.id}`:'Marcar punto'}</button>
            {pending&&<button className="geo-quiet" onClick={cancelPending}>Cancelar {pending.id}</button>}
          </div>
          {pending&&<div className="geo-guidance"><Sparkles size={15}/><div><span>TRIANGULACIÓN ACTIVA</span><strong>{pending.id} · segunda vista</strong><p>Muévete lateralmente manteniendo el mismo vértice en la mira. Base recomendada 4–12 m.</p><div><i style={{width:`${clamp((baselineDistance||0)/8,0,1)*100}%`}}/></div></div></div>}
        </section>

        <section className="geo-model-panel">
          <div className="geo-panel-head"><div><span>02 · MODELO</span><strong>Geometría consultable</strong></div><div className="geo-mini-actions"><button onClick={()=>setResetToken(v=>v+1)} title="Reencuadrar"><RotateCcw size={14}/></button><button onClick={clearModel} title="Limpiar"><Trash2 size={14}/></button></div></div>
          <div className="geo-viewer-wrap"><GeometryViewer points={points} surfaces={surfaces} volumes={volumes} selectedIds={selectedIds} resetToken={resetToken}/><div className="geo-viewer-legend"><span><i/> punto</span><span><i/> superficie</span><span>arrastra para rotar · pellizca para zoom</span></div></div>
          <div className="geo-demo-row"><button onClick={()=>loadDemo('t0')}>Cargar demo T0</button><button onClick={()=>loadDemo('t1')}>Ver cambio T1</button></div>
        </section>

        <aside className="geo-inspector">
          <div className="geo-inspector-head"><span>03 · INTELIGENCIA</span><strong>Medición y descomposición</strong></div>
          <div className="geo-metrics">
            <Mini label="Puntos" value={points.length}/><Mini label="Superficies" value={surfaces.length}/><Mini label="Área predio" value={finite(siteMetrics.lotArea)?`${siteMetrics.lotArea.toFixed(0)} m²`:'—'}/><Mini label="Ocupación" value={finite(siteMetrics.occupation)?`${siteMetrics.occupation.toFixed(1)}%`:'—'}/>
          </div>

          <div className="geo-section">
            <div className="geo-section-title"><span>PUNTOS</span><b>{selectedIds.length} seleccionados</b></div>
            <div className="geo-point-list">{points.length?points.map(p=><button key={p.id} className={selectedIds.includes(p.id)?'selected':''} onClick={()=>togglePoint(p.id)}><span>{p.id}</span><b>{fmt(p.x,1)}, {fmt(p.y,1)}, {fmt(p.z,1)}</b><em>{p.score||'—'}</em></button>):<p>Los puntos resueltos aparecerán aquí.</p>}</div>
          </div>

          <div className="geo-section geo-measure">
            <div className="geo-section-title"><span>MEDICIÓN</span><Ruler size={14}/></div>
            {!measurement?<p>Selecciona 2 puntos para distancia/desnivel o 3+ para superficie.</p>:measurement.mode==='line'?<div className="geo-readouts"><Mini label="Distancia 3D" value={`${measurement.distance.toFixed(2)} m`}/><Mini label="Horizontal" value={`${measurement.horizontal.toFixed(2)} m`}/><Mini label="Desnivel" value={`${measurement.dz>=0?'+':''}${measurement.dz.toFixed(2)} m`}/><Mini label="Pendiente" value={finite(measurement.slope)?`${measurement.slope.toFixed(1)}%`:'—'}/></div>:<><div className="geo-readouts"><Mini label="Área 3D" value={`${measurement.area3d.toFixed(1)} m²`}/><Mini label="Proyección" value={`${measurement.areaXY.toFixed(1)} m²`}/></div><div className="geo-detected"><Sparkles size={14}/><span>Geometría detectada</span><strong>{measurement.kind}</strong></div></>}
            <div className="geo-tool-row"><button disabled={selectedPoints.length<3} onClick={createSurface}><Layers3 size={14}/> Crear superficie</button><div className="geo-height"><span>h</span><input type="number" min=".5" step=".5" value={volumeHeight} onChange={e=>setVolumeHeight(Math.max(.5,Number(e.target.value)||.5))}/><em>m</em></div><button disabled={selectedPoints.length<3} onClick={createVolume}><Plus size={14}/> Volumen</button></div>
            {!!selectedIds.length&&<button className="geo-delete-selection" onClick={deleteSelection}>Eliminar selección</button>}
          </div>

          <div className="geo-section">
            <div className="geo-section-title"><span>CAMBIO TEMPORAL</span><GitCompare size={14}/></div>
            {comparison?<div className="geo-change-grid"><Mini label="Puntos alterados" value={comparison.changed}/><Mini label="Desplazamiento máx." value={`${comparison.max.toFixed(2)} m`}/><Mini label="Nuevos / faltantes" value={`${comparison.added} / ${comparison.removed}`}/><Mini label="Δ superficie" value={`${comparison.areaDelta>=0?'+':''}${comparison.areaDelta.toFixed(1)} m²`}/></div>:<p>Guarda un estado T0 para comparar el próximo levantamiento.</p>}
            <button className="geo-wide-button" disabled={!points.length} onClick={saveBaseline}><Save size={14}/> Guardar estado T0</button>
          </div>

          <div className="geo-section">
            <div className="geo-section-title"><span>MOTOR AVANZADO</span><Cpu size={14}/></div>
            <button className="geo-pipeline-toggle" onClick={()=>setPipelineOpen(v=>!v)}><Sparkles size={14}/><div><strong>Pipeline de visión y 3D</strong><span>{MODEL_API?'Worker GPU conectado':'Interfaz preparada · worker GPU pendiente'}</span></div></button>
            {pipelineOpen&&<div className="geo-model-stack">{MODEL_STACK.map(([role,model,desc])=><div key={model}><span>{role}</span><strong>{model}</strong><p>{desc}</p></div>)}</div>}
            <button className="geo-wide-button dark" disabled={!keyframes.length} onClick={runAdvancedPipeline}><UploadCloud size={14}/> {job?.status==='subiendo'?'Subiendo…':'Reconstrucción avanzada'}</button>
          </div>
        </aside>
      </main>

      <footer className="geo-footer"><span><MapPin size={13}/> Coordenadas locales ENU · origen fijado al iniciar</span><span><Activity size={13}/> La triangulación móvil es indicativa; la precisión jurídica/topográfica requiere control GNSS/GCP.</span></footer>
    </div>
  </div>
}

function Mini({label,value}) { return <div className="geo-mini"><span>{label}</span><strong>{value}</strong></div> }

export default GeometryLauncher
