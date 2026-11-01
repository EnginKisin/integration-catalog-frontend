import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './design-system.css'
import App from './App.tsx'
import { SessionProvider } from './auth/SessionProvider'
import { initializeNavigation } from './lib/navigation'

initializeNavigation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider><App /></SessionProvider>
  </StrictMode>,
)
