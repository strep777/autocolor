import * as React from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { AuthProvider, useAuth } from '@/components/auth-provider'
import { BrandMark } from '@/components/brand'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { DashboardPage } from '@/pages/dashboard'
import { ProductsPage } from '@/pages/products'
import { ColorsPage } from '@/pages/colors'
import { ImportPage } from '@/pages/import'
import { SettingsPage } from '@/pages/settings'
import { UsersPage } from '@/pages/users'
import { LoginPage } from '@/pages/login'
import { useNavigate } from 'react-router-dom'

function Splash() {
  return (
    <div className="grid min-h-full place-items-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-pulse">
          <BrandMark size="lg" />
        </div>
        <div className="text-[12px] text-muted-foreground">正在准备工作台…</div>
      </div>
    </div>
  )
}

function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Splash />
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  return <Outlet />
}

function AdminRoute() {
  const { permissions, loading } = useAuth()
  if (loading) return <Splash />
  if (!permissions.can_manage) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="text-center">
        <div className="text-[64px] font-semibold leading-none tracking-[-0.05em] text-muted-foreground/25">404</div>
        <h1 className="mt-4 text-[18px] font-semibold tracking-tight">这个页面不存在</h1>
        <p className="mt-1.5 text-[12px] text-muted-foreground">可能链接过期了，回工作台继续吧。</p>
        <Button className="mt-5" onClick={() => navigate('/dashboard')}>
          回到工作台
        </Button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider delayDuration={250}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/finder" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/colors" element={<ColorsPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route element={<AdminRoute />}>
                  <Route path="/import" element={<ImportPage />} />
                  <Route path="/users" element={<UsersPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
            <Toaster />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
