import React from 'react'
import ReactDOM from 'react-dom/client'

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

import App from './App.jsx'
import { Auth0Bridge } from './context/AuthContext.jsx'

const DOMAIN    = import.meta.env.VITE_AUTH0_DOMAIN    || ''
const CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID || ''
const AUDIENCE  = import.meta.env.VITE_AUTH0_AUDIENCE  || ''

async function mount() {
  let Wrapper = ({ children }) => <>{children}</>

  if (DOMAIN && CLIENT_ID) {
    const { Auth0Provider } = await import('@auth0/auth0-react')
    Wrapper = ({ children }) => (
      <Auth0Provider
        domain={DOMAIN}
        clientId={CLIENT_ID}
        authorizationParams={{ redirect_uri: window.location.origin, audience: AUDIENCE }}
      >
        <Auth0Bridge>{children}</Auth0Bridge>
      </Auth0Provider>
    )
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Wrapper>
        <App />
      </Wrapper>
    </React.StrictMode>,
  )
}

mount()
