import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import OperatorGate from './components/OperatorGate.jsx'
import { installTheme } from './lib/theme.js'
import './theme.css'

installTheme()

createRoot(document.getElementById('root')).render(<OperatorGate><App /></OperatorGate>)
