import { useNavigate } from "react-router-dom"
import { CompassIcon, HouseIcon } from "lucide-react"
import { AuthScreen, AuthCTA, AUTH } from "@/modules/auth/components/authUi"

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <AuthScreen>
      <div className="flex flex-col items-center text-center">
        <div
          className="flex items-center justify-center mb-[18px]"
          style={{ width: 78, height: 78, borderRadius: "50%", background: "#EEF1F5" }}
        >
          <CompassIcon size={36} style={{ color: "#5B748F" }} />
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight" style={{ color: AUTH.ink }}>
          Page not found
        </h1>
        <p className="text-[15px] leading-relaxed mt-2 max-w-[280px]" style={{ color: AUTH.sub }}>
          That link led somewhere that doesn't exist. Let's get you back home.
        </p>
        <div className="mt-6 w-full">
          <AuthCTA onClick={() => navigate("/")}>
            <HouseIcon size={16} /> Go home
          </AuthCTA>
        </div>
      </div>
    </AuthScreen>
  )
}
