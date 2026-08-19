// Deploy re-trigger 2026-06-17: the Phase A merge (d30a027) did not fire a
// Vercel production build automatically; this no-op forces a fresh deploy.
import { Suspense, useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType, useSearchParams } from "react-router-dom"
import { SWRConfig } from "swr"
import { trackPageview } from "@/lib/analytics"
import { usePushDeepLink } from "@/hooks/usePushDeepLink"
import { readPersistedDashboardFallback } from "@/lib/swrPersist"
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
/** Follows a tapped notification once the router is available. Renders nothing. */
function PushDeepLinks() {
  usePushDeepLink()
  return null
}

function PageviewTracker() {
  const location = useLocation()
  useEffect(() => {
    trackPageview(location.pathname)
  }, [location.pathname])
  return null
}

/**
 * Start every page at its top.
 *
 * SPAs keep the window scroll position across route changes, so opening a
 * deep-clean guide from halfway down Home rendered the guide already scrolled —
 * a tester's words: "the page didn't start at the very top." A back navigation
 * is left alone: restoring the prior position there is what the user expects.
 */
function ScrollToTop() {
  const location = useLocation()
  const navType = useNavigationType()
  useEffect(() => {
    if (navType !== "POP") window.scrollTo(0, 0)
  }, [location.pathname, navType])
  return null
}

/**
 * Warm-start data, read from localStorage ONCE at module scope (before the first
 * render, so Home never flashes a skeleton it doesn't need) and kept in a stable
 * config object — a fresh object literal on every render would hand SWR a new
 * `fallback` identity each time.
 */
const SWR_CONFIG = { fallback: readPersistedDashboardFallback() }

// All routes use lazyWithRetry so stale-chunk errors after a deploy force a
// single hard reload instead of crashing the ErrorBoundary. See the helper
// for details.
// Public, and deliberately OUTSIDE AuthGate: App Store Connect requires a
// reachable Privacy Policy URL and a reviewer opens it signed out.
const Privacy = lazyWithRetry(() => import("@/pages/legal/Privacy"))
const Terms = lazyWithRetry(() => import("@/pages/legal/Terms"))
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
const SampleHome = lazyWithRetry(() => import("@/pages/SampleHome"))
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
      {/* Warm start: the last dashboard, read from localStorage once at module
          scope, is handed to SWR as `fallback` so reopening Home paints instantly
          instead of a blank skeleton. Deliberately NOT a custom cache `provider`
          — see swrPersist.ts for the StrictMode teardown that wedged Home. */}
      <SWRConfig value={SWR_CONFIG}>
      <BrowserRouter>
        <AuthProvider>
          <BootSplashGate />
          <PageviewTracker />
          <ScrollToTop />
          <HomeProvider>
            {/* INSIDE the provider: a push now names the home it came from, and
                following it may mean switching first. Mounted outside, the hook
                could not see home context at all. It renders null either way. */}
            <PushDeepLinks />
            <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/signin" element={<AuthPage />} />
              <Route path="/signup" element={<AuthPage />} />
              <Route path="/reset" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/invite/:token" element={<AcceptInvite />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route
                path="/onboarding/profile"
                element={
                  <AuthGate>
                    <OnboardingProfile />
                  </AuthGate>
                }
              />
              {/* Sample home. AuthGate but NOT HomeGate: the entire point is
                  that it works before you have a home — putting it inside
                  HomeGate would redirect exactly the people it exists for. */}
              <Route
                path="/sample"
                element={
                  <AuthGate>
                    <SampleHome />
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
      </SWRConfig>
    </ErrorBoundary>
  )
}

export default App
