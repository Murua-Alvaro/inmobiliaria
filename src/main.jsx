import React,{useEffect,useState} from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PropertyIntelligence from './PropertyIntelligence.jsx'

function Root(){
  const [hash,setHash]=useState(()=>location.hash.replace(/^#/,'')||'home')
  useEffect(()=>{
    const sync=()=>setHash(location.hash.replace(/^#/,'')||'home')
    window.addEventListener('hashchange',sync)
    return()=>window.removeEventListener('hashchange',sync)
  },[])
  return hash==='property-intelligence'?<PropertyIntelligence/>:<App/>
}

createRoot(document.getElementById('root')).render(<Root/>)
