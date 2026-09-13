import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Crosshair } from 'lucide-react'
import './main.jsx'
import './geometryScanner.css'

function GeometryLazyLauncher() {
  const [Module, setModule] = useState(null)
  const [loading, setLoading] = useState(false)

  const open = async () => {
    if (loading) return
    setLoading(true)
    try {
      const mod = await import('./geometryScanner.jsx')
      setModule(() => mod.default)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelector('#geometry-root .geo-launcher')?.click()
      }))
    } finally {
      setLoading(false)
    }
  }

  if (Module) return <Module />
  return <button className="geo-launcher" onClick={open}><Crosshair size={15}/><span>{loading ? 'CARGANDO 3D…' : 'GEOMETRÍA 3D'}</span><b>BETA</b></button>
}

const host = document.createElement('div')
host.id = 'geometry-root'
document.body.appendChild(host)
createRoot(host).render(<GeometryLazyLauncher />)
