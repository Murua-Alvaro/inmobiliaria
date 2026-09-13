import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ScanLine } from 'lucide-react'
import './main.jsx'

function GeometryLazyLauncher() {
  const [Module, setModule] = useState(null)
  const [loading, setLoading] = useState(false)

  const open = async () => {
    if (loading) return
    setLoading(true)
    try {
      const mod = await import('./intelligentGeometry.jsx')
      setModule(() => mod.default)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelector('#geometry-root .ig-launch')?.click()
      }))
    } finally {
      setLoading(false)
    }
  }

  if (Module) return <Module />
  return <button className="geo-launcher" onClick={open}><ScanLine size={15}/><span>{loading ? 'CARGANDO VISIÓN…' : 'LEVANTAMIENTO 3D'}</span><b>IA</b></button>
}

const host = document.createElement('div')
host.id = 'geometry-root'
document.body.appendChild(host)
createRoot(host).render(<GeometryLazyLauncher />)
