import { useNavigate } from "react-router"
import { Logo } from "@/components/Logo"

export default function Docs() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050505]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 rounded-lg border border-[#1f1f2a] bg-[#121218] px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-[#8b5cf6]/50 transition"
          >
            &larr; go back
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-2xl border border-[#1f1f2a] bg-[#0c0c0f] p-10 shadow-2xl">
          <div className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 rounded-full border border-purple-500/20 mb-4">
            Documentation
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
            Coming soon
          </h1>
          <p className="text-sm text-zinc-400 mb-8">
            documentation developer guides, API references, and hosting tutorials are coming soon. This page is still being set up.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] px-6 py-2.5 text-sm font-semibold text-white transition shadow-lg shadow-purple-950/50 active:scale-95"
          >
            &larr; go back
          </button>
        </div>
      </main>
    </div>
  )
}
