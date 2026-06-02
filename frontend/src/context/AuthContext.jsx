import { createContext, useContext } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

// Default context used when Auth0 is not configured
const AuthContext = createContext({
  isAuthenticated: false,
  isLoading:       false,
  user:            null,
  authError:       null,
  login:           () => {},
  logout:          () => {},
  getToken:        async () => { throw new Error('Auth not configured') },
})

export const useAppAuth = () => useContext(AuthContext)

// Mounted only when Auth0Provider is present (see main.jsx)
export function Auth0Bridge({ children }) {
  const {
    isAuthenticated, isLoading, user,
    loginWithRedirect, logout,
    getAccessTokenSilently,
  } = useAuth0()

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isLoading,
      user,
      login:    () => loginWithRedirect({ authorizationParams: { redirect_uri: window.location.origin } }),
      logout:   (opts) => logout({ logoutParams: { returnTo: window.location.origin, ...opts } }),
      getToken: getAccessTokenSilently,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
