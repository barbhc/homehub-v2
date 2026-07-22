// Deploy re-trigger 2026-06-17: the Phase A merge (d30a027) did not fire a
// Vercel production build automatically; this no-op forces a fresh deploy.
import { Suspense, useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom"
import { trackPageview } from "@/lib/analytics"
import { AuthProvider, AuthGate, useAuth } from "@/modules/auth"
import { HomeProvider, HomeGate } from "@/modules/home"
import { AppLayout } from "@/components/AppLayout"
import { ErrorBoundary } from "@/components/layout"
import { lazyWithRetry } from "@/lib/lazyWithRetry"
import { hideBootSplash } from "@/lib/bootSplash"
import Index from "@/pages/Index"
import NotFound from "@/pages/NotFound"

/**
 * Dismisses the instant boot splash (painted by index.html) the moment auth
 * resolves — at which point the app is rendering either the landing page or a
 * redirect to /home, so real branded content is behind the fade.
 */
function BootSplashGate() {
  const { loading } = useAuth()
  useEffect(() => {
    if (!loading) hideBootSplash()
  }, [loading])
  return null
}

/** Manual SPA pageviews (PostHog init sets capture_pageview: false). */
function PageviewTracker() {
  const location = useLocation()
  useEffect(() => {
    trackPageview(location.pathname)
  }, [location.pathname])
  return null
}

// All routes use lazyWithRetry so stale-chunk errors after a deploy force a
// single hard reload instead of crashing the ErrorBoundary. See the helper
// for details.
const OnboardingInventory = lazyWithRetry(() => import("@/pages/OnboardingInventory"))
const OnboardingProfile = lazyWithRetry(() => import("@/pages/OnboardingProfile"))
const Home = lazyWithRetry(() => import("@/pages/Home"))
const Inventory = lazyWithRetry(() => import("@/pages/Inventory"))
// The Arc 2 redesigned add-item flow (photo-first hero, progressive disclosure,
// doc-type gate). The legacy AddItem page still exists for rollback but is no
// longer routed.
const AddItem = lazyWithRetry(() => import("@/pages/SmartAddItem"))
const InventoryDetail = lazyWithRetry(() => import("@/pages/InventoryDetail"))
const InventoryItemSetup = lazyWithRetry(() => import("@/pages/InventoryItemSetup"))
const Tasks = lazyWithRetry(() => import("@/pages/Tasks"))
const TaskDetail = lazyWithRetry(() => import("@/pages/TaskDetail"))
const Maintenance = lazyWithRetry(() => import("@/pages/Maintenance"))
const DeepClean = lazyWithRetry(() => import("@/pages/DeepClean"))
const CleanGuide = lazyWithRetry(() => import("@/pages/CleanGuide"))
const CarePage = lazyWithRetry(() => import("@/pages/CarePage"))
const ItemDetailPage = lazyWithRetry(() => import("@/pages/ItemDetailPage"))
const SchedulePage = lazyWithRetry(() => import("@/pages/SchedulePage"))
const CleaningPage = lazyWithRetry(() => import("@/pages/CleaningPage"))
const WarrantiesPage = lazyWithRetry(() => import("@/pages/WarrantiesPage"))
const ProvidersPage = lazyWithRetry(() => import("@/pages/ProvidersPage"))
const Settings = lazyWithRetry(() => import("@/pages/Settings"))
const ResetPassword = lazyWithRetry(() => import("@/pages/ResetPassword"))
const AuthPage = lazyWithRetry(() => import("@/pages/AuthPage"))
const ChatPage = lazyWithRetry(() => import("@/pages/ChatPage"))
const FaqPage = lazyWithRetry(() => import("@/pages/FaqPage"))
const AcceptInvite = lazyWithRetry(() => import("@/pages/AcceptInvite"))

/**
 * Troubleshooting merged into Ask — /troubleshoot now redirects to /chat,
 * preserving the ?item scope so "Fix a problem" lands in Ask scoped to the item.
 */
function TroubleshootRedirect() {
  const [params] = useSearchParams()
  const qs = params.toString()
  return <Navigate to={`/chat${qs ? `?${qs}` : ""}`} replace />
}

/**
 * App shell: providers (auth → home) then route tree.
 * AuthGate protects dashboard; HomeGate ensures home is set before care/inventory.
 */
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <BootSplashGate />
          <PageviewTracker />
          <HomeProvider>
            <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/signin" element={<AuthPage />} />
              <Route path="/signup" element={<AuthPage />} />
              <Route path="/reset" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/invite/:token" element={<AcceptInvite />} />
              <Route
                path="/onboarding/profile"
                element={
                  <AuthGate>
                    <OnboardingProfile />
                  </AuthGate>
                }
              />
              <Route
                path="/onboarding/inventory"
                element={
                  <AuthGate>
                    <OnboardingInventory />
                  </AuthGate>
                }
              />
              <Route
                element={
                  <AuthGate>
                    <HomeGate>
                      <AppLayout />
                    </HomeGate>
                  </AuthGate>
                }
              >
                <Route path="/home" element={<Home />} />
                <Route path="/care" element={<CarePage />} />
                <Route path="/items/:id" element={<ItemDetailPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/cleaning" element={<CleaningPage />} />
                <Route path="/troubleshoot" element={<TroubleshootRedirect />} />
                <Route path="/dashboard" element={<Navigate to="/home" replace />} />
                <Route path="/maintenance" element={<Maintenance />} />
                <Route path="/inventory">
                  <Route index element={<Inventory />} />
                  <Route path="add" element={<AddItem />} />
                  <Route path=":id/setup" element={<InventoryItemSetup />} />
                  <Route path=":id" element={<InventoryDetail />} />
                </Route>
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/tasks/:taskInstanceId" element={<TaskDetail />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/clean" element={<DeepClean />} />
                <Route path="/clean/:itemUnitId" element={<CleanGuide />} />
                <Route path="/warranties" element={<WarrantiesPage />} />
                <Route path="/providers" element={<ProvidersPage />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </HomeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
