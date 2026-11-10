import * as React from 'react'

import { api } from '@/lib/api'
import type { Permissions, User } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  permissions: Permissions
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = React.useState<User | null>(null)
  const [permissions, setPermissions] = React.useState<Permissions>({ can_manage: false })
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    try {
      const data = await api.auth.me()
      setUserState(data.user)
      setPermissions(data.permissions)
    } catch {
      setUserState(null)
      setPermissions({ can_manage: false })
    }
  }, [])

  React.useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  React.useEffect(() => {
    const onUnauthorized = () => {
      setUserState(null)
      setPermissions({ can_manage: false })
    }
    window.addEventListener('pc:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pc:unauthorized', onUnauthorized)
  }, [])

  const login = React.useCallback(async (username: string, password: string) => {
    const data = await api.auth.login(username, password)
    setUserState(data.user)
    setPermissions(data.permissions)
    return data.user
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUserState(null)
      setPermissions({ can_manage: false })
    }
  }, [])

  const setUser = React.useCallback((next: User) => {
    setUserState(next)
    setPermissions({ can_manage: next.role === 'admin' })
  }, [])

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return context
}
