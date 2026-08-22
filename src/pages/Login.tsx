import { useState } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { Logo } from "@/components/Logo"
import { setAuth, setToken } from "@/lib/store"
import { authApi } from "@/lib/api"

export default function Login() {
  const nav = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [mode, setMode] = useState<"login" | "signup">(location.pathname === "/signup" ? "signup" : "login")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleModeChange = (newMode: "login" | "signup") => {
    setMode(newMode)
    nav(newMode === "signup" ? "/signup" : "/login")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (mode === "signup" && password.length < 6) {
        setError("Password must be at least 6 characters")
        setLoading(false)
        return
      }
      if (mode === "signup") {
        const response = await authApi.register(email, password, name)
        setAuth(response.user)
        setToken(response.token)
        nav("/dashboard")
      } else {
        const response = await authApi.login(email, password)
        setAuth(response.user)
        setToken(response.token)
        nav("/dashboard")
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050505]">
      <header className="border-b border-[#1f1f2a]">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-6">
          <Logo size="sm" />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-[#1f1f2a] bg-[#0c0c0f] p-8 shadow-2xl">
          <h1 className="text-2xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create account"}</h1>
          <p className="mt-2 text-sm text-[#9494a8]">
            {mode === "login" ? "Sign in to your Cloud Wire dashboard." : "Start protecting your sites in minutes."}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9494a8]">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[#1f1f2a] bg-[#121218] px-3.5 py-2.5 text-sm outline-none focus:border-[#8b5cf6]"
                  placeholder="Alex Rivera"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9494a8]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#1f1f2a] bg-[#121218] px-3.5 py-2.5 text-sm outline-none focus:border-[#8b5cf6]"
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9494a8]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#1f1f2a] bg-[#121218] px-3.5 py-2.5 text-sm outline-none focus:border-[#8b5cf6]"
                placeholder="••••••••"
                minLength={mode === "signup" ? 6 : 1}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#7c3aed] py-2.5 text-sm font-semibold text-white hover:bg-[#6d28d9] transition disabled:opacity-50">
              {loading ? "Loading..." : (mode === "login" ? "Sign in" : "Create account")}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-[#9494a8]">
            {mode === "login" ? (
              <>No account? <button type="button" onClick={() => handleModeChange("signup")} className="text-[#a78bfa] hover:underline">Sign up</button></>
            ) : (
              <>Have an account? <button type="button" onClick={() => handleModeChange("login")} className="text-[#a78bfa] hover:underline">Sign in</button></>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}
