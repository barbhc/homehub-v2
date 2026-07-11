import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { HouseIcon, Loader2, CheckIcon, ArrowRightIcon, Link2OffIcon, UserCheckIcon } from "lucide-react"
import { useAuth } from "@/modules/auth"
import { AuthScreen, AuthMark, AuthCTA, AUTH } from "@/modules/auth/components/authUi"
import { getInviteByToken, acceptInvite, type InviteDetails } from "@/modules/home"

type PageState = "loading" | "ready" | "accepting" | "success" | "error" | "auth-required"

const PERMISSIONS = [
  "See and complete the home's tasks",
  "Browse items, manuals and warranties",
  "Ask the assistant about anything in the home",
]

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [state, setState] = useState<PageState>("loading")
  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [acceptedHomeName, setAcceptedHomeName] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setState("auth-required"); return }
    if (!token) { setState("error"); setError("Invalid invite link."); return }

    getInviteByToken(token).then((res) => {
      if (res.error) { setState("error"); setError("Invite not found or has been revoked."); return }
      const inv = res.data!
      if (inv.accepted_by) { setState("error"); setError("This invite has already been used."); return }
      if (new Date(inv.expires_at) < new Date()) { setExpired(true); setState("error"); setError("This invite has expired."); return }
      setInvite(inv)
      setState("ready")
    })
  }, [token, user, authLoading])

  const handleAccept = useCallback(async () => {
    if (!token) return
    setState("accepting")
    const result = await acceptInvite(token)
    if (result.success) { setAcceptedHomeName(result.home_name); setState("success") }
    else { setError(result.error); setState("error") }
  }, [token])

  // Full reload so the home context picks up the new membership.
  const handleGoHome = useCallback(() => { window.location.href = "/home" }, [])
  const handleGoSignIn = useCallback(() => {
    navigate(`/signin?returnTo=${encodeURIComponent(window.location.pathname)}`)
  }, [navigate])

  const homeName = invite?.home?.name ?? "this home"

  if (state === "loading" || state === "accepting") {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center">
          <Loader2 className="size-9 animate-spin" style={{ color: AUTH.teal }} />
          <p className="mt-4 text-[15px]" style={{ color: AUTH.sub }}>
            {state === "accepting" ? "Joining home…" : "Loading invite…"}
          </p>
        </div>
      </AuthScreen>
    )
  }

  if (state === "auth-required") {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center">
          <AuthMark />
          <h1 className="font-display text-2xl font-extrabold tracking-tight mt-5" style={{ color: AUTH.ink }}>Sign in to join</h1>
          <p className="text-[15px] leading-relaxed mt-2 max-w-[290px]" style={{ color: AUTH.sub }}>
            Sign in or create an account, then we'll bring you right back to this invite.
          </p>
          <div className="mt-6 w-full"><AuthCTA onClick={handleGoSignIn}>Sign in</AuthCTA></div>
        </div>
      </AuthScreen>
    )
  }

  if (state === "success") {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center mb-[18px]" style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--hh-teal-wash)" }}>
            <CheckIcon size={34} style={{ color: AUTH.teal }} />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight" style={{ color: AUTH.ink }}>You're in!</h1>
          <p className="text-[15px] mt-2" style={{ color: AUTH.sub }}>
            You've joined <span className="font-semibold" style={{ color: AUTH.ink }}>{acceptedHomeName}</span>.
          </p>
          <div className="mt-6 w-full"><AuthCTA onClick={handleGoHome}>Go to your home <ArrowRightIcon size={18} /></AuthCTA></div>
        </div>
      </AuthScreen>
    )
  }

  if (state === "error") {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center mb-[18px]" style={{ width: 74, height: 74, borderRadius: "50%", background: "#F1F5F8" }}>
            <Link2OffIcon size={32} style={{ color: "#5B748F" }} />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight" style={{ color: AUTH.ink }}>
            {expired ? "This invite has expired" : "Can't join"}
          </h1>
          <p className="text-[15px] leading-relaxed mt-2 max-w-[290px]" style={{ color: AUTH.sub }}>
            {expired ? "Ask the owner to send a fresh link, then open it again." : error}
          </p>
          <div className="mt-6 w-full">
            <AuthCTA onClick={() => navigate(user ? "/home" : "/signin")}>{user ? "Go to your home" : "Go to sign in"}</AuthCTA>
          </div>
        </div>
      </AuthScreen>
    )
  }

  // ready
  return (
    <AuthScreen>
      <div className="flex flex-col items-center text-center">
        <AuthMark />
        <h1 className="font-display text-2xl font-extrabold tracking-tight mt-5" style={{ color: AUTH.ink }}>You're invited</h1>
        <p className="text-[15px] leading-relaxed mt-2 max-w-[290px]" style={{ color: AUTH.sub }}>
          {invite?.creator?.full_name ? <><span className="font-semibold" style={{ color: AUTH.ink }}>{invite.creator.full_name}</span> invited you</> : "You've been invited"} to help look after their home.
        </p>
      </div>

      <div className="mt-6 bg-white flex items-center gap-3.5" style={{ borderRadius: 20, boxShadow: "0 2px 14px rgba(11,26,22,0.07)", padding: 18 }}>
        <div className="flex items-center justify-center shrink-0" style={{ width: 48, height: 48, borderRadius: 16, background: "linear-gradient(135deg,#EAF3EF,#DCE9E4)" }}>
          <HouseIcon size={26} strokeWidth={1.6} style={{ color: AUTH.teal }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[19px] font-extrabold tracking-[-0.3px] truncate" style={{ color: AUTH.ink }}>{homeName}</div>
          <div className="inline-flex items-center gap-1.5 mt-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.3px]" style={{ background: "var(--hh-teal-wash)", color: AUTH.teal }}>
            <UserCheckIcon size={11} /> Joining as {invite?.role ?? "member"}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {PERMISSIONS.map((p) => (
          <div key={p} className="flex items-center gap-2.5">
            <CheckIcon size={16} strokeWidth={2.6} className="shrink-0" style={{ color: AUTH.teal }} />
            <span className="text-[13.5px]" style={{ color: "#3A4A45" }}>{p}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <AuthCTA onClick={handleAccept}>Join {homeName} <ArrowRightIcon size={18} /></AuthCTA>
        <button onClick={() => navigate(user ? "/home" : "/")} className="w-full py-2 text-[15px] font-semibold" style={{ color: AUTH.sub }}>Not now</button>
      </div>
    </AuthScreen>
  )
}
