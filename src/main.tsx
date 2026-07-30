import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from './app/providers'
import { AppRoutes } from './app/routes'
import './styles/theme.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado no index.html.')

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </StrictMode>,
)
