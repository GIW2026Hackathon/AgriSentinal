import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, clearSession, getStoredUser, getToken, storeSession } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser())
  const [loading, setLoading] = useState(Boolean(getToken()))

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return undefined
    }
    let active = true
    api
      .get('/auth/me')
      .then(({ user: fresh }) => {
        if (!active) return
        setUser(fresh)
        storeSession(getToken(), fresh)
      })
      .catch(() => {
        if (!active) return
        setUser(null)
        clearSession()
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    const onUnauthorized = () => {
      setUser(null)
      clearSession()
    }
    window.addEventListener('agrisentinel:unauthorized', onUnauthorized)
    return () => {
      active = false
      window.removeEventListener('agrisentinel:unauthorized', onUnauthorized)
    }
  }, [])

  const login = useCallback(async (email, password, portal = 'farmer') => {
    const data = await api.post('/auth/login', { email, password, portal })
    storeSession(data.token, data.user)
    setUser(data.user)
    return data.user
  }, [])

  const googleLogin = useCallback(async (credential) => {
    const data = await api.post('/auth/google', { credential })
    storeSession(data.token, data.user)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload)
    storeSession(data.token, data.user)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Token may already be invalid.
    }
    clearSession()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, googleLogin, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
