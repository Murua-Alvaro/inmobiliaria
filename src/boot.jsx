import React from 'react'
import { createRoot } from 'react-dom/client'
import './main.jsx'
import GeometryLauncher from './geometryScanner.jsx'
import './geometryScanner.css'

const host = document.createElement('div')
host.id = 'geometry-root'
document.body.appendChild(host)
createRoot(host).render(<GeometryLauncher />)
