import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/push'
import { initDiscreet } from './lib/discreet'
import { initTheme } from './lib/theme'
import { initInstall } from './lib/install'

initDiscreet()
initTheme()
initInstall()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void registerServiceWorker()
