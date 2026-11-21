/**
 * "Keep your list" — the account ask at the end of the first minute
 * (design/account-after-list.md; approved mock PBDvYh7MXrHZzibneCCRUH).
 *
 * The person has already seen their list; this sheet is the only place they
 * are asked to make an account. It covers the bottom of the list, never all of
 * it, so what they are saving stays in view.
 *
 * Signing in here does not save anything by itself: FirstMinute watches for the
 * account to appear and runs the save, then puts this sheet into its saving,
 * error or "you already have a home" view.
 */
import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeftIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AppleButton, authErrorMessage, useAuth } from "@/modules/auth"

export type KeepSheetView =
  | { kind: "ask"; title: string; description: string; error?: string | null }
  | { kind: "saving"; title: string; slow?: boolean }
  | { kind: "error"; message: string }
  | { kind: "existing"; homeName: string; count: number }

type Props = {
  view: KeepSheetView | null
  onClose: () => void
  onRetry: () => void
  onAddToExisting: () => void
  onSkipExisting: () => void
}

const TITLE = "font-display text-[1.375rem] leading-7 font-bold tracking-[-0.01em]"
const tasks = (n: number) => `${n} task${n === 1 ? "" : "s"}`

export function KeepListSheet({ view, onClose, onRetry, onAddToExisting, onSkipExisting }: Props) {
  // While saving the sheet can't be dismissed — until it has been slow, then it
  // can (the save keeps going underneath).
  const locked = view?.kind === "saving" && !view.slow
  return (
    <Sheet open={view !== null} onOpenChange={(o) => { if (!o && !locked) onClose() }}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-md rounded-t-3xl" showCloseButton={!locked} data-testid="keep-list-sheet">
        {/* Keyed on the error too: Apple's failure can arrive after the sheet opened. */}
        {view?.kind === "ask" && <Ask key={`${view.title}|${view.error ?? ""}`} title={view.title} description={view.description} initialError={view.error ?? null} />}

        {view?.kind === "saving" && (
          <SheetHeader className="pb-8" aria-busy="true">
            <SheetTitle className={TITLE}>{view.title}</SheetTitle>
            <SheetDescription role={view.slow ? "status" : undefined}>
              {view.slow ? "This is taking longer than usual. Check your connection. You can close this; it keeps saving." : "This takes a moment."}
            </SheetDescription>
          </SheetHeader>
        )}

        {view?.kind === "error" && (
          <>
            <SheetHeader>
              <SheetTitle className={TITLE}>Couldn’t save</SheetTitle>
              <SheetDescription role="alert">{view.message}</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button className="h-12 w-full text-base" onClick={onRetry}>Try again</Button>
            </div>
          </>
        )}

        {view?.kind === "existing" && (
          <>
            <SheetHeader>
              <SheetTitle className={TITLE}>You already have a home</SheetTitle>
              <SheetDescription>Add {view.count === 1 ? "this task" : `these ${tasks(view.count)}`} to “{view.homeName}”?</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Button className="h-12 w-full text-base" onClick={onAddToExisting}>Add {tasks(view.count)}</Button>
              <button type="button" onClick={onSkipExisting} className="block min-h-11 w-full text-center font-medium text-muted-foreground">
                Don’t add
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

type Mode = "choose" | "signup" | "signin"

function Ask({ title, description, initialError }: { title: string; description: string; initialError: string | null }) {
  const { signInWithApple, signUp, signIn } = useAuth()
  const [mode, setMode] = useState<Mode>("choose")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [busy, setBusy] = useState(false)

  async function apple() {
    if (busy) return
    setError(null)
    setBusy(true)
    const { error: err } = await signInWithApple()
    // Success either signs in here (popup, native sheet) or leaves for Apple
    // and comes back on a reload; the draft carries the save across it.
    setBusy(false)
    if (err) setError(authErrorMessage(err))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    const { error: err } = mode === "signin" ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
    setBusy(false)
    if (err) setError(authErrorMessage(err))
  }

  const go = (m: Mode) => { setMode(m); setError(null) }

  return (
    <>
      <SheetHeader>
        <SheetTitle className={TITLE}>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {mode === "choose" ? (
          <>
            <AppleButton label="Continue with Apple" onClick={() => void apple()} disabled={busy} />
            <button type="button" onClick={() => go("signup")} disabled={busy}
              className="w-full rounded-[14px] border border-[var(--hh-line2)] bg-[var(--hh-surface)] py-[14px] text-[0.9375rem] font-bold text-[var(--hh-ink)]">
              Continue with email
            </button>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <button type="button" onClick={() => go("choose")}
              className="hit-44 -ml-1 inline-flex items-center gap-1 self-start text-[0.9375rem] font-semibold text-[var(--hh-teal)]">
              <ChevronLeftIcon className="size-5" aria-hidden /> Other ways
            </button>
            <div>
              <label htmlFor="keep-email" className="mb-1.5 block text-sm font-medium">Email</label>
              <Input id="keep-email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
            </div>
            <div>
              <label htmlFor="keep-password" className="mb-1.5 block text-sm font-medium">Password</label>
              <div className="relative">
                <Input id="keep-password" type={show ? "text" : "password"} required
                  minLength={mode === "signup" ? 8 : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "At least 8 characters" : undefined}
                  value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pr-12 text-base" />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                  className="hit-44 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOffIcon className="size-5" aria-hidden /> : <EyeIcon className="size-5" aria-hidden />}
                </button>
              </div>
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
            {mode === "signup" ? (
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button type="button" onClick={() => go("signin")} className="hit-44 font-bold text-[var(--hh-teal)]">Sign in</button>
              </p>
            ) : (
              <p className="flex flex-wrap justify-center gap-x-4 text-center text-sm text-muted-foreground">
                <Link to="/reset" className="hit-44 font-bold text-[var(--hh-teal)]">Forgot your password?</Link>
                <button type="button" onClick={() => go("signup")} className="hit-44 font-bold text-[var(--hh-teal)]">Create an account</button>
              </p>
            )}
          </form>
        )}
        {error && <p role="alert" className="text-sm font-medium text-[var(--hh-clay-ink)]">{error}</p>}
        <p className="text-center text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
          By continuing you agree to our{" "}
          <Link to="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </div>
    </>
  )
}
