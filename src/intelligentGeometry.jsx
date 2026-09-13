import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Activity,
  AlertTriangle,
  Box,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Crosshair,
  GitCompare,
  Layers3,
  MapPin,
  Move,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  ScanLine,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import './intelligentGeometry.css'

const FRAME_W = 320
const FRAME_H = 240
const MIN_BASELINE = 2.5
const HF_DEPTH_MODEL = 'onnx-community/depth-anything-v2-small-ONNX'
const BASELINE_KEY = 'growa_levantamiento3d_t0_v2'

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const finite=Number.isFinite
const rad=d=>d*Math.PI/180
const deg=r=>r*180/Math.PI
const norm360=d=>((d%360)+360)%360
const dist3=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})
const mul=(a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s})
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x})
const len=v=>Math.hypot(v.x,v.y,v.z)
const normalize=v=>{const n=len(v)||1;return{x:v.x/n,y:v.y/n,z:v.z/n}}
const pcode=i=>`P${String(i+1).padStart(2,'0')}`

function geoToLocal(p,r){
  if(!p||!r)return null
  const east=(p.lon-r.lon)*111320*Math.cos(rad(r.lat))
  const north=(p.lat-r.lat)*110540
  const up=finite(p.alt)&&finite(r.alt)?p.alt-r.alt:0
  return{x:east,y:north,z:up}
}

function rayFromPixel(heading,elevation,pixel,w=FRAME_W,h=FRAME_H,hfov=64){
  if(!finite(heading)||!pixel)return null
  const vfov=hfov*(h/w)
  const dh=(pixel.x/w-.5)*hfov
  const de=(.5-pixel.y/h)*vfov
  const H=rad(norm360(heading+dh)), E=rad(clamp((elevation||0)+de,-78,78))
  const ce=Math.cos(E)
  return normalize({x:Math.sin(H)*ce,y:Math.cos(H)*ce,z:Math.sin(E)})
}

function triangulate(a,b){
  const p1=a.origin,p2=b.origin,d1=normalize(a.dir),d2=normalize(b.dir),w0=sub(p1,p2)
  const A=dot(d1,d1),B=dot(d1,d2),C=dot(d2,d2),D=dot(d1,w0),E=dot(d2,w0)
  const den=A*C-B*B
  if(Math.abs(den)<1e-6)return null
  const s=(B*E-C*D)/den,t=(A*E-B*D)/den
  if(s<0||t<0)return null
  const q1=add(p1,mul(d1,s)),q2=add(p2,mul(d2,t)),point=mul(add(q1,q2),.5)
  const gap=dist3(q1,q2),baseline=dist3(p1,p2),angle=deg(Math.acos(clamp(Math.abs(dot(d1,d2)),-1,1)))
  const gps=[a.accuracy,b.accuracy].filter(finite)
  const gpsMean=gps.length?gps.reduce((x,y)=>x+y,0)/gps.length:null
  const trackMean=((a.trackScore||.6)+(b.trackScore||.6))/2
  const score=Math.round(clamp(
    clamp((baseline-1.5)/7,0,1)*25+
    clamp(angle/18,0,1)*30+
    clamp(1-gap/2.5,0,1)*20+
    clamp((trackMean-.45)/.5,0,1)*20+
    (finite(gpsMean)?clamp(1-gpsMean/25,0,1)*5:2),0,100))
  const uncertainty=clamp(gap+(gpsMean||10)*.12+(1-trackMean)*2,.25,12)
  return{point,gap,baseline,angle,score,uncertainty}
}

function polygonArea(points){
  if(points.length<3)return 0
  let s=0
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];s+=a.x*b.y-b.x*a.y}
  return Math.abs(s)/2
}
function area3D(points){
  if(points.length<3)return 0
  const p0=points[0];let s=0
  for(let i=1;i<points.length-1;i++)s+=len(cross(sub(points[i],p0),sub(points[i+1],p0)))/2
  return s
}
function planeInfo(points){
  if(points.length<3)return null
  const n=normalize(cross(sub(points[1],points[0]),sub(points[2],points[0])))
  const residual=points.reduce((m,p)=>Math.max(m,Math.abs(dot(n,sub(p,points[0])))),0)
  const z=Math.abs(n.z)
  const kind=z>.86?'plano horizontal':z<.28?'plano vertical':'plano inclinado'
  const slope=z>.02?Math.tan(Math.acos(clamp(z,0,1)))*100:null
  return{normal:n,residual,kind,slope}
}

function drawVideoCover(ctx,video,w,h){
  const vw=video.videoWidth,vh=video.videoHeight
  if(!vw||!vh)return false
  const src=vw/vh,target=w/h
  let sx=0,sy=0,sw=vw,sh=vh
  if(src>target){sw=vh*target;sx=(vw-sw)/2}else{sh=vw/target;sy=(vh-sh)/2}
  ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h)
  return true
}

function grayFromImageData(img){
  const g=new Uint8Array(img.width*img.height)
  for(let i=0,j=0;i<img.data.length;i+=4,j++)g[j]=(img.data[i]*77+img.data[i+1]*150+img.data[i+2]*29)>>8
  return g
}

function analyzeGray(gray,w,h){
  const gx=new Int16Array(w*h),gy=new Int16Array(w*h),mag=new Uint16Array(w*h)
  let brightness=0,magSum=0
  for(let i=0;i<gray.length;i++)brightness+=gray[i]
  brightness/=gray.length
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x
    const sx=-gray[i-w-1]-2*gray[i-1]-gray[i+w-1]+gray[i-w+1]+2*gray[i+1]+gray[i+w+1]
    const sy=-gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1]
    gx[i]=sx;gy[i]=sy
    const m=Math.min(1023,Math.hypot(sx,sy));mag[i]=m;magSum+=m
  }
  const sharpness=magSum/((w-2)*(h-2))
  const responses=[]
  for(let y=5;y<h-5;y+=3)for(let x=5;x<w-5;x+=3){
    let A=0,B=0,C=0
    for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++){
      const i=(y+yy)*w+x+xx,dx=gx[i],dy=gy[i];A+=dx*dx;B+=dx*dy;C+=dy*dy
    }
    const det=A*C-B*B,tr=A+C,R=det-.045*tr*tr
    if(R>2e9)responses.push({x,y,r:R})
  }
  responses.sort((a,b)=>b.r-a.r)
  const corners=[]
  for(const c of responses){
    if(corners.every(k=>(k.x-c.x)**2+(k.y-c.y)**2>150)){corners.push(c);if(corners.length>=48)break}
  }
  const edgeThreshold=Math.max(90,sharpness*2.2),edgePoints=[]
  for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2)if(mag[y*w+x]>edgeThreshold)edgePoints.push({x,y})
  const sample=edgePoints.length>420?edgePoints.filter((_,i)=>i%Math.ceil(edgePoints.length/420)===0):edgePoints
  const lines=[]
  for(let it=0;it<72&&sample.length>25;it++){
    const p1=sample[(it*37+11)%sample.length],p2=sample[(it*83+29)%sample.length]
    const dx=p2.x-p1.x,dy=p2.y-p1.y,L=Math.hypot(dx,dy)
    if(L<32)continue
    const a=dy/L,b=-dx/L,c=-(a*p1.x+b*p1.y),ux=dx/L,uy=dy/L
    let count=0,tmin=Infinity,tmax=-Infinity
    for(const p of sample){
      if(Math.abs(a*p.x+b*p.y+c)<2.5){count++;const t=(p.x-p1.x)*ux+(p.y-p1.y)*uy;tmin=Math.min(tmin,t);tmax=Math.max(tmax,t)}
    }
    if(count<18||tmax-tmin<44)continue
    const x1=p1.x+ux*tmin,y1=p1.y+uy*tmin,x2=p1.x+ux*tmax,y2=p1.y+uy*tmax
    const angle=Math.atan2(y2-y1,x2-x1)
    const mid={x:(x1+x2)/2,y:(y1+y2)/2}
    const duplicate=lines.some(q=>{
      let da=Math.abs(angle-q.angle);da=Math.min(da,Math.PI-da)
      return da<rad(7)&&Math.hypot(mid.x-q.mid.x,mid.y-q.mid.y)<22
    })
    if(!duplicate)lines.push({x1,y1,x2,y2,angle,mid,support:count,a,b,c})
    if(lines.length>=6)break
  }
  const vertices=[]
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
    const l1=lines[i],l2=lines[j],den=l1.a*l2.b-l2.a*l1.b
    if(Math.abs(den)<.12)continue
    const x=(l1.b*l2.c-l2.b*l1.c)/den,y=(l1.c*l2.a-l2.c*l1.a)/den
    if(x>8&&x<w-8&&y>8&&y<h-8&&vertices.every(v=>Math.hypot(v.x-x,v.y-y)>13))vertices.push({x,y,score:l1.support+l2.support})
  }
  const quadrants=new Set(corners.map(c=>`${c.x>w/2?1:0}${c.y>h/2?1:0}`)).size
  const light=clamp(1-Math.abs(brightness-130)/125,0,1)
  const focus=clamp((sharpness-18)/75,0,1)
  const structure=clamp((corners.length+vertices.length*1.5)/35,0,1)
  const coverage=quadrants/4
  const quality=Math.round((light*.2+focus*.3+structure*.35+coverage*.15)*100)
  return{corners,lines,vertices,brightness,sharpness,quality,edgeCount:edgePoints.length}
}

function nearestTarget(analysis,mode='auto'){
  if(!analysis)return null
  const center={x:FRAME_W/2,y:FRAME_H/2}
  const nearest=(arr,limit)=>arr.map(x=>({...x,d:Math.hypot(x.x-center.x,x.y-center.y)})).sort((a,b)=>a.d-b.d).find(x=>x.d<limit)
  const vertex=nearest(analysis.vertices,72)
  const corner=nearest(analysis.corners,58)
  let line=null,lineDist=Infinity
  for(const l of analysis.lines){const d=Math.abs(l.a*center.x+l.b*center.y+l.c);if(d<lineDist){lineDist=d;line=l}}
  if(mode==='borde'&&line&&lineDist<30){
    const candidates=[...analysis.vertices,...analysis.corners].map(x=>({...x,d:Math.abs(line.a*x.x+line.b*x.y+line.c)})).sort((a,b)=>a.d-b.d)
    const p=candidates.find(x=>x.d<7)||{x:center.x,y:center.y}
    return{type:'borde',x:p.x,y:p.y,confidence:clamp(1-lineDist/30,.2,1),line}
  }
  if(mode==='punto')return corner?{type:'punto',x:corner.x,y:corner.y,confidence:clamp(1-corner.d/70,.25,1)}:{type:'punto',...center,confidence:.25}
  if(vertex)return{type:'vértice',x:vertex.x,y:vertex.y,confidence:clamp(1-vertex.d/85,.35,1)}
  if(line&&lineDist<18)return{type:'borde',x:center.x,y:center.y,confidence:clamp(1-lineDist/20,.3,1),line}
  if(corner)return{type:'punto',x:corner.x,y:corner.y,confidence:clamp(1-corner.d/65,.25,1)}
  return null
}

function extractPatch(gray,w,h,x,y,r=10){
  x=Math.round(x);y=Math.round(y)
  if(x-r<0||y-r<0||x+r>=w||y+r>=h)return null
  const data=new Uint8Array((2*r+1)*(2*r+1));let k=0,mean=0
  for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++){const v=gray[(y+yy)*w+x+xx];data[k++]=v;mean+=v}
  mean/=data.length
  let norm=0;for(const v of data)norm+=(v-mean)*(v-mean)
  return{data,r,mean,norm:Math.sqrt(norm)||1}
}

function patchScore(gray,w,h,patch,x,y){
  const r=patch.r;x=Math.round(x);y=Math.round(y)
  if(x-r<0||y-r<0||x+r>=w||y+r>=h)return 0
  let mean=0,n=patch.data.length
  for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)mean+=gray[(y+yy)*w+x+xx]
  mean/=n
  let num=0,norm=0,k=0
  for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++){
    const b=gray[(y+yy)*w+x+xx]-mean,a=patch.data[k]-patch.mean;num+=a*b;norm+=b*b;k++
  }
  const corr=num/(patch.norm*(Math.sqrt(norm)||1))
  return clamp((corr+1)/2,0,1)
}

function trackPatch(gray,w,h,patch,analysis,last){
  const pool=[...(analysis?.vertices||[]),...(analysis?.corners||[])]
  if(last)pool.push(last)
  let best=null
  for(const p of pool){
    if(last&&Math.hypot(p.x-last.x,p.y-last.y)>95)continue
    const score=patchScore(gray,w,h,patch,p.x,p.y)
    if(!best||score>best.score)best={x:p.x,y:p.y,score}
  }
  return best
}

function drawOverlay(canvas,analysis,target,track,pending){
  if(!canvas)return
  canvas.width=FRAME_W;canvas.height=FRAME_H
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,FRAME_W,FRAME_H)
  ctx.lineWidth=1.3
  for(const l of analysis?.lines||[]){ctx.strokeStyle='rgba(115,255,190,.66)';ctx.beginPath();ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);ctx.stroke()}
  for(const c of (analysis?.corners||[]).slice(0,26)){ctx.fillStyle='rgba(255,255,255,.72)';ctx.beginPath();ctx.arc(c.x,c.y,1.8,0,Math.PI*2);ctx.fill()}
  for(const v of analysis?.vertices||[]){ctx.strokeStyle='rgba(255,222,117,.9)';ctx.strokeRect(v.x-4,v.y-4,8,8)}
  const active=pending&&track?track:target
  if(active){
    ctx.strokeStyle=pending?(track?.score>.62?'#73ffbe':'#ffb66d'):'#ffffff';ctx.lineWidth=2
    ctx.beginPath();ctx.arc(active.x,active.y,10,0,Math.PI*2);ctx.stroke()
    ctx.font='9px ui-monospace,monospace';ctx.fillStyle=ctx.strokeStyle;ctx.fillText(pending?`${pending.id} ${Math.round((track?.score||0)*100)}%`:(target?.type||'OBJ').toUpperCase(),active.x+13,active.y-8)
  }
}

function Viewer3D({points,edges,surfaces,resetToken}){
  const host=useRef(null),sceneRef=useRef(null),dynamicRef=useRef(null),cameraRef=useRef(null),controlsRef=useRef(null)
  useEffect(()=>{
    if(!host.current)return
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x0d100e);scene.fog=new THREE.Fog(0x0d100e,70,160)
    const camera=new THREE.PerspectiveCamera(44,1,.1,500);camera.position.set(18,-24,16)
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace
    host.current.appendChild(renderer.domElement)
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,0,2)
    const grid=new THREE.GridHelper(80,40,0x3e4741,0x202522);grid.rotation.x=Math.PI/2;scene.add(grid)
    scene.add(new THREE.HemisphereLight(0xffffff,0x243028,1.7));const dl=new THREE.DirectionalLight(0xffffff,2);dl.position.set(20,-20,30);scene.add(dl)
    const dynamic=new THREE.Group();scene.add(dynamic)
    sceneRef.current=scene;dynamicRef.current=dynamic;cameraRef.current=camera;controlsRef.current=controls
    const resize=()=>{if(!host.current)return;const w=host.current.clientWidth||1,h=host.current.clientHeight||1;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
    const ro=new ResizeObserver(resize);ro.observe(host.current);resize();let raf
    const loop=()=>{controls.update();renderer.render(scene,camera);raf=requestAnimationFrame(loop)};loop()
    return()=>{cancelAnimationFrame(raf);ro.disconnect();controls.dispose();renderer.dispose();renderer.domElement.remove()}
  },[])
  useEffect(()=>{
    const g=dynamicRef.current;if(!g)return
    while(g.children.length){const o=g.children.pop();o.traverse?.(x=>{x.geometry?.dispose?.();x.material?.dispose?.()})}
    const byId=new Map(points.map(p=>[p.id,p]))
    surfaces.forEach((s,i)=>{const pts=s.pointIds.map(id=>byId.get(id)).filter(Boolean);if(pts.length<3)return
      const pos=[];for(let k=1;k<pts.length-1;k++)pos.push(pts[0].x,pts[0].y,pts[0].z,pts[k].x,pts[k].y,pts[k].z,pts[k+1].x,pts[k+1].y,pts[k+1].z)
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals()
      g.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:i%2?0x74857a:0xb5c0b9,transparent:true,opacity:.26,side:THREE.DoubleSide,roughness:.8})))
    })
    edges.forEach(e=>{const a=byId.get(e.a),b=byId.get(e.b);if(!a||!b)return;const geo=new THREE.BufferGeometry().setFromPoints([a,b].map(p=>new THREE.Vector3(p.x,p.y,p.z)));g.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x7dffc1})))})
    points.forEach(p=>{const geo=new THREE.SphereGeometry(.24,14,14);const mat=new THREE.MeshStandardMaterial({color:p.semantic==='vértice'?0xffd979:0xf1f5f2});const m=new THREE.Mesh(geo,mat);m.position.set(p.x,p.y,p.z);g.add(m)})
  },[points,edges,surfaces])
  useEffect(()=>{
    if(!points.length||!cameraRef.current)return
    const box=new THREE.Box3();points.forEach(p=>box.expandByPoint(new THREE.Vector3(p.x,p.y,p.z)))
    const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3()),r=Math.max(s.x,s.y,s.z,8)
    controlsRef.current.target.copy(c);cameraRef.current.position.set(c.x+r,c.y-r*1.25,c.z+r*.8);controlsRef.current.update()
  },[resetToken])
  return <div className="ig-viewer" ref={host}/>
}

function demoGeometry(){
  const raw=[[-9,-12,0],[13,-12,.3],[13,10,.5],[-9,10,.1],[-4,-3,.2],[7,-3,.3],[7,5,.5],[-4,5,.3],[-4,-3,6.8],[7,-3,7],[7,5,7.1],[-4,5,6.9]]
  const points=raw.map((v,i)=>({id:pcode(i),x:v[0],y:v[1],z:v[2],semantic:i<4?'borde':'vértice',score:91,uncertainty:.45}))
  const edges=[['P01','P02'],['P02','P03'],['P03','P04'],['P04','P01'],['P05','P06'],['P06','P07'],['P07','P08'],['P08','P05']].map((e,i)=>({id:`E${i+1}`,a:e[0],b:e[1]}))
  const surfaces=[{id:'S01',name:'Terreno',pointIds:['P01','P02','P03','P04'],kind:'plano horizontal'},{id:'S02',name:'Huella',pointIds:['P05','P06','P07','P08'],kind:'plano horizontal'},{id:'S03',name:'Cubierta',pointIds:['P09','P10','P11','P12'],kind:'plano horizontal'}]
  return{points,edges,surfaces}
}

function Launcher(){
  const[open,setOpen]=useState(false)
  return<><button className="ig-launch" onClick={()=>setOpen(true)}><ScanLine size={16}/><span>LEVANTAMIENTO 3D</span><b>IA</b></button>{open&&<Scanner onClose={()=>setOpen(false)}/>}</>
}

function Scanner({onClose}){
  const[session,setSession]=useState(false),[paused,setPaused]=useState(false),[online,setOnline]=useState(navigator.onLine)
  const[cameraReady,setCameraReady]=useState(false),[cameraError,setCameraError]=useState('')
  const[pose,setPose]=useState(null),[reference,setReference]=useState(null),[orientation,setOrientation]=useState({heading:null,elevation:null,beta:null,gamma:null})
  const[analysis,setAnalysis]=useState(null),[target,setTarget]=useState(null),[track,setTrack]=useState(null),[mode,setMode]=useState('auto')
  const[pending,setPending]=useState(null),[message,setMessage]=useState('Inicia el levantamiento. El sistema detectará vértices, bordes y calidad de captura.')
  const[points,setPoints]=useState([]),[edges,setEdges]=useState([]),[surfaces,setSurfaces]=useState([]),[suggestion,setSuggestion]=useState(null)
  const[depthStatus,setDepthStatus]=useState('idle'),[depthMap,setDepthMap]=useState(null),[resetToken,setResetToken]=useState(0)
  const[baseline,setBaseline]=useState(()=>{try{return JSON.parse(localStorage.getItem(BASELINE_KEY)||'null')}catch{return null}})

  const videoRef=useRef(null),overlayRef=useRef(null),workCanvasRef=useRef(null),streamRef=useRef(null),watchRef=useRef(null),wakeRef=useRef(null),orientRef=useRef(null),loopRef=useRef(null)
  const latestGrayRef=useRef(null),latestAnalysisRef=useRef(null),poseRef=useRef(null),referenceRef=useRef(null),trackRef=useRef(null)
  useEffect(()=>{poseRef.current=pose},[pose]);useEffect(()=>{referenceRef.current=reference},[reference]);useEffect(()=>{trackRef.current=track},[track])

  useEffect(()=>{const a=()=>setOnline(true),b=()=>setOnline(false);addEventListener('online',a);addEventListener('offline',b);return()=>{removeEventListener('online',a);removeEventListener('offline',b);stopAll()}},[])

  const localPose=useMemo(()=>geoToLocal(pose,reference),[pose,reference])
  const activeHeading=finite(pose?.heading)?pose.heading:orientation.heading
  const baselineDistance=pending?.first&&localPose?dist3(pending.first.origin,localPose):null
  const pointMap=useMemo(()=>new Map(points.map(p=>[p.id,p])),[points])
  const metrics=useMemo(()=>{
    const z=points.map(p=>p.z).filter(finite),areas=surfaces.map(s=>polygonArea(s.pointIds.map(id=>pointMap.get(id)).filter(Boolean)))
    return{points:points.length,edges:edges.length,surfaces:surfaces.length,area:areas.reduce((a,b)=>a+b,0),height:z.length?Math.max(...z)-Math.min(...z):null,quality:points.length?Math.round(points.reduce((s,p)=>s+(p.score||0),0)/points.length):null}
  },[points,edges,surfaces,pointMap])

  const comparison=useMemo(()=>{
    if(!baseline?.points?.length||!points.length)return null
    const b=new Map(baseline.points.map(p=>[p.id,p]));const common=points.filter(p=>b.has(p.id));if(!common.length)return null
    const ds=common.map(p=>dist3(p,b.get(p.id)))
    return{changed:ds.filter(d=>d>.35).length,max:Math.max(...ds),mean:ds.reduce((a,c)=>a+c,0)/ds.length,added:points.filter(p=>!b.has(p.id)).length}
  },[baseline,points])

  const readiness=useMemo(()=>{
    if(!session)return{level:'idle',score:0,text:'Pulsa Iniciar levantamiento.'}
    if(!cameraReady)return{level:'bad',score:0,text:'La cámara no está disponible.'}
    if(!analysis)return{level:'warn',score:20,text:'Analizando la escena…'}
    if(analysis.brightness<42)return{level:'bad',score:25,text:'Muy oscuro. Busca mejor iluminación o gira ligeramente.'}
    if(analysis.brightness>225)return{level:'bad',score:25,text:'Imagen sobreexpuesta. Evita contraluz directo.'}
    if(analysis.sharpness<28)return{level:'warn',score:40,text:'Imagen inestable. Detén el celular un segundo.'}
    if(analysis.corners.length+analysis.vertices.length<8)return{level:'warn',score:48,text:'Poca geometría visible. Apunta a esquinas, juntas o bordes con textura.'}
    if(!pending)return{level:'good',score:analysis.quality,text:target?`Detectado: ${target.type}. Centra la mira y captura.`:'Mueve la mira hacia un borde o vértice.'}
    if(!finite(baselineDistance)||baselineDistance<MIN_BASELINE)return{level:'move',score:55,text:`Muévete lateralmente ${Math.max(0,MIN_BASELINE-(baselineDistance||0)).toFixed(1)} m más sin perder ${pending.id}.`}
    if(!track||track.score<.55)return{level:'bad',score:45,text:`Perdí ${pending.id}. Regresa lentamente hasta que el círculo vuelva al objetivo.`}
    const ray=rayFromPixel(activeHeading,orientation.elevation,track,FRAME_W,FRAME_H)
    if(!ray)return{level:'warn',score:55,text:'Falta orientación estable. Mantén el celular quieto un instante.'}
    const angle=deg(Math.acos(clamp(Math.abs(dot(pending.first.dir,ray)),-1,1)))
    if(angle<3.5)return{level:'move',score:68,text:'Aún hay poco paralaje. Muévete más hacia un costado.'}
    return{level:'ready',score:Math.round(clamp((analysis.quality+(track.score*100)+80)/3,0,100)),text:`Geometría suficiente. ${pending.id} listo para resolver.`}
  },[session,cameraReady,analysis,target,pending,baselineDistance,track,activeHeading,orientation.elevation])

  useEffect(()=>{
    if(!cameraReady||!session||paused)return
    const tick=()=>{
      const video=videoRef.current;if(!video?.videoWidth)return
      let canvas=workCanvasRef.current;if(!canvas){canvas=document.createElement('canvas');canvas.width=FRAME_W;canvas.height=FRAME_H;workCanvasRef.current=canvas}
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!drawVideoCover(ctx,video,FRAME_W,FRAME_H))return
      const img=ctx.getImageData(0,0,FRAME_W,FRAME_H),gray=grayFromImageData(img),a=analyzeGray(gray,FRAME_W,FRAME_H)
      latestGrayRef.current=gray;latestAnalysisRef.current=a;setAnalysis(a)
      let t=nearestTarget(a,mode);setTarget(t)
      let tr=null
      if(pending?.patch){tr=trackPatch(gray,FRAME_W,FRAME_H,pending.patch,a,trackRef.current||pending.pixel);setTrack(tr)}
      drawOverlay(overlayRef.current,a,t,tr,pending)
    }
    tick();loopRef.current=setInterval(tick,320);return()=>clearInterval(loopRef.current)
  },[cameraReady,session,paused,pending,mode])

  async function startCamera(){
    try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});streamRef.current=stream;setCameraReady(true);setCameraError('');requestAnimationFrame(()=>{if(videoRef.current)videoRef.current.srcObject=stream})}
    catch(e){setCameraReady(false);setCameraError(e?.message||'No fue posible abrir la cámara.')}
  }
  function stopCamera(){streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;if(videoRef.current)videoRef.current.srcObject=null;setCameraReady(false)}
  function gpsObj(p){return{lat:p.coords.latitude,lon:p.coords.longitude,alt:p.coords.altitude,accuracy:p.coords.accuracy,altAccuracy:p.coords.altitudeAccuracy,heading:p.coords.heading,speed:p.coords.speed,at:p.timestamp}}
  function startGps(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('GPS no disponible'));navigator.geolocation.getCurrentPosition(p=>{const q=gpsObj(p);setPose(q);if(!referenceRef.current){const r={lat:q.lat,lon:q.lon,alt:finite(q.alt)?q.alt:0};referenceRef.current=r;setReference(r)}if(watchRef.current===null)watchRef.current=navigator.geolocation.watchPosition(x=>setPose(gpsObj(x)),()=>{},{enableHighAccuracy:true,maximumAge:300,timeout:20000});resolve(q)},reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000})})}
  async function startOrientation(){try{if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){if(await DeviceOrientationEvent.requestPermission()!=='granted')return}const fn=e=>{const heading=finite(e.webkitCompassHeading)?e.webkitCompassHeading:finite(e.alpha)?norm360(360-e.alpha):null;const beta=finite(e.beta)?e.beta:null;setOrientation({heading,beta,gamma:finite(e.gamma)?e.gamma:null,elevation:finite(beta)?clamp(90-beta,-75,75):0})};orientRef.current=fn;addEventListener('deviceorientation',fn,true)}catch{}}
  async function wake(){try{if('wakeLock'in navigator)wakeRef.current=await navigator.wakeLock.request('screen')}catch{}}
  async function startScan(){if(!online){setMessage('Necesitas conexión para este modo.');return}setSession(true);setPaused(false);setMessage('Activando cámara, GPS y orientación…');await Promise.allSettled([startCamera(),startGps(),startOrientation(),wake()]);setMessage('Escaneo inteligente activo.')}
  function pause(){setPaused(true);setMessage('Levantamiento pausado.')}
  function resume(){setPaused(false);startCamera();startGps().catch(()=>{});startOrientation();wake();setMessage('Levantamiento reanudado.')}
  function stopAll(){stopCamera();if(watchRef.current!==null)navigator.geolocation?.clearWatch(watchRef.current);watchRef.current=null;if(orientRef.current)removeEventListener('deviceorientation',orientRef.current,true);orientRef.current=null;try{wakeRef.current?.release?.()}catch{}wakeRef.current=null;clearInterval(loopRef.current)}

  async function capture(){
    if(!session||paused)return
    const local=geoToLocal(pose,referenceRef.current),gray=latestGrayRef.current,a=latestAnalysisRef.current
    if(!local||!finite(activeHeading)||!gray){setMessage('Todavía no hay pose suficiente. Mantén cámara y ubicación activas.');return}
    if(!pending){
      const t=nearestTarget(a,mode)
      if(!t){setMessage('No encuentro un punto geométrico estable. Apunta a una esquina o borde mejor definido.');return}
      const patch=extractPatch(gray,FRAME_W,FRAME_H,t.x,t.y)
      if(!patch){setMessage('Acerca el objetivo al centro de la cámara.');return}
      const dir=rayFromPixel(activeHeading,orientation.elevation,t,FRAME_W,FRAME_H)
      if(!dir){setMessage('No hay orientación suficiente.');return}
      const id=pcode(points.length)
      setPending({id,semantic:t.type,pixel:{x:t.x,y:t.y},patch,first:{origin:local,dir,accuracy:pose?.accuracy,trackScore:t.confidence||.6}});setTrack({x:t.x,y:t.y,score:1})
      setMessage(`${id} fijado como ${t.type}. Ahora muévete lateralmente; el sistema intentará seguirlo solo.`)
      return
    }
    if(readiness.level!=='ready'){setMessage(readiness.text);return}
    const dir=rayFromPixel(activeHeading,orientation.elevation,track,FRAME_W,FRAME_H)
    const solved=triangulate(pending.first,{origin:local,dir,accuracy:pose?.accuracy,trackScore:track?.score||0})
    if(!solved||solved.angle<3.5){setMessage('La triangulación todavía es débil. Muévete un poco más hacia un costado.');return}
    const point={id:pending.id,...solved.point,semantic:pending.semantic,score:solved.score,uncertainty:solved.uncertainty,source:'visión+IMU+GPS'}
    const next=[...points,point];setPoints(next)
    if(point.semantic==='borde'&&next.length>1){const prev=next[next.length-2];if(prev.semantic==='borde'&&dist3(prev,point)<60)setEdges(e=>[...e,{id:`E${e.length+1}`,a:prev.id,b:point.id}])}
    if(next.length>=4){const group=next.slice(-4),info=planeInfo(group);if(info&&info.residual<.65&&area3D(group)>1)setSuggestion({pointIds:group.map(p=>p.id),...info,area:area3D(group)})}
    setPending(null);setTrack(null);setMessage(`${point.id} creado · ${point.semantic} · confianza ${point.score}/100 · incertidumbre indicativa ±${point.uncertainty.toFixed(1)} m.`);setResetToken(x=>x+1)
  }

  function acceptSurface(){if(!suggestion)return;setSurfaces(s=>[...s,{id:`S${String(s.length+1).padStart(2,'0')}`,name:suggestion.kind,pointIds:suggestion.pointIds,kind:suggestion.kind}]);setMessage(`${suggestion.kind} aceptado · ${suggestion.area.toFixed(1)} m².`);setSuggestion(null)}

  async function runDepth(){
    if(!cameraReady||depthStatus==='loading')return
    try{
      setDepthStatus('loading');setMessage('Cargando Depth Anything V2 Small y estimando profundidad relativa…')
      const canvas=workCanvasRef.current;if(!canvas)throw new Error('sin imagen')
      const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.84));const url=URL.createObjectURL(blob)
      const {pipeline}=await import('@huggingface/transformers')
      const estimator=await pipeline('depth-estimation',HF_DEPTH_MODEL)
      const out=await estimator(url);URL.revokeObjectURL(url)
      const d=out?.depth
      if(!d?.data||!d?.width||!d?.height)throw new Error('salida de profundidad no disponible')
      const cv=document.createElement('canvas');cv.width=d.width;cv.height=d.height;const cx=cv.getContext('2d');const img=cx.createImageData(d.width,d.height)
      for(let i=0;i<d.width*d.height;i++){const v=d.data[i];img.data[i*4]=v;img.data[i*4+1]=v;img.data[i*4+2]=v;img.data[i*4+3]=255}cx.putImageData(img,0,0)
      setDepthMap(cv.toDataURL('image/jpeg',.82));setDepthStatus('ready');setMessage('Profundidad neuronal lista. Es relativa: ayuda a separar planos y discontinuidades, pero no sustituye escala métrica.')
    }catch(e){setDepthStatus('error');setMessage(`No se pudo ejecutar profundidad neuronal en este dispositivo: ${e.message}`)}
  }

  function saveT0(){const snap={points,edges,surfaces,at:new Date().toISOString()};localStorage.setItem(BASELINE_KEY,JSON.stringify(snap));setBaseline(snap);setMessage('Estado T0 guardado para comparación temporal.')}
  function loadDemo(){const d=demoGeometry();setPoints(d.points);setEdges(d.edges);setSurfaces(d.surfaces);setSuggestion(null);setPending(null);setResetToken(x=>x+1);setMessage('Demo cargada: terreno, bordes, huella y cubierta como geometría consultable.')}

  return <div className="ig-modal"><div className="ig-shell">
    <header className="ig-header">
      <div><span>GROWA · LEVANTAMIENTO FÍSICO</span><h1>Geometría inteligente de sitio</h1><p>La cámara detecta estructura, te guía para obtener paralaje y convierte observaciones repetidas en geometría 3D consultable.</p></div>
      <div className="ig-header-actions"><b className={online?'on':''}>{online?<Wifi size={13}/>:<WifiOff size={13}/>} {online?'Internet':'Sin conexión'}</b><button onClick={onClose}><X size={19}/></button></div>
    </header>

    <div className={`ig-guide ${readiness.level}`}><div className="ig-guide-icon">{readiness.level==='ready'?<CheckCircle2/>:readiness.level==='move'?<Move/>:readiness.level==='bad'?<AlertTriangle/>:<Sparkles/>}</div><div><span>GUÍA DE CAPTURA</span><strong>{readiness.text}</strong></div><em>{readiness.score}/100</em></div>

    <main className="ig-layout">
      <section className="ig-camera-card">
        <div className="ig-card-head"><div><span>01 · CÁMARA</span><strong>{session?(paused?'Pausado':'Análisis geométrico activo'):'Preparación'}</strong></div><div className="ig-modes">{['auto','punto','borde'].map(m=><button key={m} className={mode===m?'active':''} onClick={()=>setMode(m)}>{m}</button>)}</div></div>
        <div className="ig-camera">
          {cameraReady?<video ref={videoRef} autoPlay muted playsInline/>:<div className="ig-empty"><Camera size={28}/><strong>{cameraError||'La cámara se activa al iniciar'}</strong><span>Sin instalación · navegador móvil · conexión a internet</span></div>}
          <canvas ref={overlayRef} className="ig-overlay"/>
          <div className="ig-reticle"><i/><b/></div>
          <div className="ig-hud top"><span>VÉRTICES {analysis?.vertices.length||0}</span><span>BORDES {analysis?.lines.length||0}</span><span>ESCENA {analysis?.quality||0}%</span></div>
          <div className="ig-hud bottom"><span>GPS {finite(pose?.accuracy)?`±${Math.round(pose.accuracy)} m`:'—'}</span><span>BASE {finite(baselineDistance)?`${baselineDistance.toFixed(1)} m`:'—'}</span><span>TRACK {pending?`${Math.round((track?.score||0)*100)}%`:'—'}</span><span>{target?.type?.toUpperCase()||'BUSCANDO'}</span></div>
        </div>
        <div className="ig-camera-actions">
          {!session?<button className="primary" onClick={startScan}><Play size={15}/> Iniciar levantamiento</button>:paused?<button className="primary" onClick={resume}><Play size={15}/> Reanudar</button>:<button onClick={pause}><Pause size={15}/> Pausar</button>}
          <button className="capture" disabled={!session||paused} onClick={capture}><Crosshair size={16}/>{pending?(readiness.level==='ready'?`Crear ${pending.id}`:`Seguir ${pending.id}`):'Capturar geometría'}</button>
          <button className="depth" disabled={!cameraReady||depthStatus==='loading'} onClick={runDepth}><BrainCircuit size={15}/>{depthStatus==='loading'?'Analizando…':'Profundidad IA'}</button>
        </div>
        <div className="ig-scene-stats"><div><span>Luz</span><b>{analysis?Math.round(analysis.brightness):'—'}</b></div><div><span>Nitidez</span><b>{analysis?Math.round(analysis.sharpness):'—'}</b></div><div><span>Puntos visuales</span><b>{analysis?.corners.length||0}</b></div><div><span>Orientación</span><b>{finite(activeHeading)?`${Math.round(activeHeading)}°`:'—'}</b></div></div>
        {depthMap&&<div className="ig-depth"><img src={depthMap}/><div><span>DEPTH ANYTHING V2</span><strong>Mapa de profundidad relativa</strong><p>Se usa como apoyo para separar planos y discontinuidades. La escala métrica viene de vistas múltiples y referencias.</p></div></div>}
      </section>

      <section className="ig-model-card">
        <div className="ig-card-head"><div><span>02 · MODELO</span><strong>Geometría construida</strong></div><button className="icon" onClick={()=>setResetToken(x=>x+1)}><RotateCcw size={15}/></button></div>
        <div className="ig-viewer-wrap"><Viewer3D points={points} edges={edges} surfaces={surfaces} resetToken={resetToken}/><div className="ig-viewer-label">arrastra para rotar · pellizca para acercar</div></div>
        <div className="ig-model-metrics"><Mini label="Puntos 3D" value={metrics.points}/><Mini label="Bordes" value={metrics.edges}/><Mini label="Superficies" value={metrics.surfaces}/><Mini label="Altura observada" value={finite(metrics.height)?`${metrics.height.toFixed(1)} m`:'—'}/></div>
        {suggestion&&<div className="ig-suggestion"><Layers3 size={18}/><div><span>PLANO DETECTADO</span><strong>{suggestion.kind} · {suggestion.area.toFixed(1)} m²</strong><p>Residual geométrico {suggestion.residual.toFixed(2)} m.</p></div><button onClick={acceptSurface}>Aceptar</button></div>}
        <div className="ig-demo"><button onClick={loadDemo}>Cargar demo geométrica</button><button disabled={!points.length} onClick={saveT0}>Guardar T0</button></div>
      </section>

      <aside className="ig-inspector">
        <div className="ig-card-head"><div><span>03 · RESULTADO</span><strong>Qué sabe el sistema</strong></div><Activity size={16}/></div>
        <div className="ig-summary"><Mini label="Calidad media" value={finite(metrics.quality)?`${metrics.quality}/100`:'—'}/><Mini label="Área modelada" value={metrics.area?`${metrics.area.toFixed(1)} m²`:'—'}/></div>
        <section><h3><ScanLine size={14}/> Detección en cámara</h3><p>Blanco = puntos visuales. Verde = bordes dominantes. Amarillo = intersecciones candidatas a vértice. El círculo grande es el objetivo que el sistema intenta fijar.</p></section>
        <section><h3><Ruler size={14}/> Geometría métrica</h3>{points.length?<div className="ig-point-list">{points.slice(-8).reverse().map(p=><div key={p.id}><span>{p.id}</span><strong>{p.semantic}</strong><em>{p.score}/100 · ±{p.uncertainty?.toFixed(1)||'—'} m</em></div>)}</div>:<p>Los puntos 3D aparecerán después de observar el mismo detalle desde al menos dos posiciones.</p>}</section>
        <section><h3><GitCompare size={14}/> Cambio temporal</h3>{comparison?<div className="ig-change"><Mini label="Puntos alterados" value={comparison.changed}/><Mini label="Cambio máximo" value={`${comparison.max.toFixed(2)} m`}/><Mini label="Cambio medio" value={`${comparison.mean.toFixed(2)} m`}/><Mini label="Nuevos" value={comparison.added}/></div>:<p>Guarda un T0 y vuelve al mismo sitio para comparar la geometría observada.</p>}</section>
        <section className="ig-how"><h3><BrainCircuit size={14}/> Motor usado</h3><p><b>En el celular:</b> gradientes Sobel, respuesta Harris, RANSAC de líneas, intersecciones, seguimiento por correlación normalizada, GPS e IMU. <b>Profundidad:</b> Depth Anything V2 Small en navegador. La reconstrucción métrica se valida con múltiples vistas.</p></section>
      </aside>
    </main>
    <footer className="ig-footer"><span><MapPin size={13}/> Coordenadas locales relativas al inicio.</span><span><AlertTriangle size={13}/> Medición preliminar: no sustituye levantamiento topográfico certificado.</span></footer>
  </div></div>
}

function Mini({label,value}){return<div className="ig-mini"><span>{label}</span><strong>{value}</strong></div>}
export default Launcher
