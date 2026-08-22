
import { Link } from "react-router-dom"
import { Logo } from "@/components/Logo"
import { WireField } from "@/components/WireField"
import { Shield, Zap, Globe, Lock, Activity, Server, CheckCircle2, Terminal } from "lucide-react"
import { useState, useEffect, useCallback } from "react"

const features = [
  { icon: Shield, title: "Web Application Firewall", desc: "Managed and custom rules stop SQLi, XSS, RCE, and zero-days at the edge before they reach origin." },
  { icon: Zap, title: "Global DDoS & Bot Fight", desc: "Layer 3/4/7 flood control, bot fingerprinting, JS challenges, Turnstile, and under-attack mode on every request." },
  { icon: Globe, title: "Works with Any DNS Provider", desc: "Use Namecheap, Cloudflare, or any DNS provider. Add A or CNAME records pointing to CloudWire. No DNS migration required." },
  { icon: Lock, title: "SSL / TLS Everywhere", desc: "Automatic certificates, HSTS, TLS 1.3, and flexible, full, or strict origin modes." },
  { icon: Activity, title: "Real-time Analytics", desc: "Live request logs, threat scores, bandwidth, and cache hit ratios from the edge." },
  { icon: Server, title: "Origin Shield", desc: "SSRF-safe proxying, adaptive rate limits, hotlink protection, and always-HTTPS redirects." },
]

const attackLogs = [
  { type: "BLOCKED", threat: "SQL Injection", ip: "192.0.2.1", location: "FRA" },
  { type: "BLOCKED", threat: "XSS Attack", ip: "203.0.113.42", location: "LHR" },
  { type: "BLOCKED", threat: "Bot Attack", ip: "198.51.100.8", location: "NYC" },
  { type: "ALLOWED", threat: "Normal Request", ip: "172.16.0.45", location: "SFO" },
  { type: "BLOCKED", threat: "DDoS Pattern", ip: "10.0.0.99", location: "AMS" },
  { type: "BLOCKED", threat: "Path Traversal", ip: "192.168.1.15", location: "SIN" },
  { type: "ALLOWED", threat: "Normal Request", ip: "203.0.113.156", location: "FRA" },
  { type: "BLOCKED", threat: "Command Injection", ip: "198.51.100.234", location: "LHR" },
  { type: "BLOCKED", threat: "Header Injection", ip: "10.0.0.78", location: "NYC" },
  { type: "ALLOWED", threat: "Normal Request", ip: "172.16.0.92", location: "SFO" },
]

function LiveTerminal() {
  const [logs, setLogs] = useState(attackLogs.slice(0, 5))

  const addRandomLog = useCallback(() => {
    const randomLog = attackLogs[Math.floor(Math.random() * attackLogs.length)]
    setLogs(prev => [randomLog, ...prev].slice(0, 8))
  }, [])

  useEffect(() => {
    const interval = setInterval(addRandomLog, 2000)
    return () => clearInterval(interval)
  }, [addRandomLog])

  return (
    <div className="rounded-xl border border-[#1f1f2a] bg-[#0a0a0f] p-4 font-mono text-xs" role="log" aria-live="polite">
      <div className="mb-3 flex items-center gap-2 border-b border-[#1f1f2a] pb-2">
        <Terminal className="h-4 w-4 text-[#8b5cf6]" aria-hidden="true" />
        <span className="text-[#9494a8]">Live WAF Logs</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-[#4ade80]">
          <span className="h-2 w-2 rounded-full bg-[#4ade80] animate-pulse" aria-hidden="true" />
          Real-time
        </span>
      </div>
      <div className="space-y-1.5">
        {logs.map((log, i) => (
          <div key={`${log.ip}-${i}`} className={`flex items-center gap-2 ${log.type === 'BLOCKED' ? 'text-red-400' : 'text-green-400'}`}>
            <span className="text-[#9494a8]">[{log.type}]</span>
            <span className="text-white">{log.threat}</span>
            <span className="text-[#9494a8]">from</span>
            <span className="text-[#a78bfa]">{log.ip}</span>
            <span className="text-[#9494a8]">at Edge</span>
            <span className="text-[#f59e0b]">({log.location})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const user = localStorage.getItem('cw_auth') || localStorage.getItem('user')
    const token = localStorage.getItem('cw_token') || localStorage.getItem('token')
    setIsLoggedIn(!!(user || token))
  }, [])

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050505]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-[#9494a8] md:flex">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
            <a href="#how" className="hover:text-white transition">How it works</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/docs" className="rounded-lg border border-[#1f1f2a] bg-[#121218] px-3.5 py-2 text-sm font-medium text-[#9494a8] hover:text-white hover:border-[#8b5cf6]/40 transition">
              Document
            </Link>
            {isLoggedIn ? (
              <Link to="/dashboard" className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] transition shadow-[0_0_24px_rgba(124,58,237,0.35)] flex items-center gap-1.5">
                Back to dashboard &rarr;
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-4 py-2 text-sm text-[#9494a8] hover:text-white transition">Log in</Link>
                <Link to="/signup" className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] transition shadow-[0_0_24px_rgba(124,58,237,0.35)]">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
      <section className="relative overflow-hidden pt-16">
        <WireField />
        <div className="relative z-10 mx-auto max-w-6xl px-6 pb-28 pt-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/30 bg-[#4ade80]/10 px-4 py-1.5 text-xs font-medium text-[#4ade80]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80] animate-pulse" />
            Edge Network Live
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
            Protect every request
            <br />
            <span className="bg-gradient-to-r from-[#a78bfa] via-[#8b5cf6] to-white bg-clip-text text-transparent">
              before it hits origin
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[#b4b4c8]">
            Cloud Wire is your edge network. Add simple DNS records in Namecheap, Cloudflare, or any registrar. We block threats, absorb attacks and accelerate traffic worldwide.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {isLoggedIn ? (
              <Link to="/dashboard" className="rounded-xl bg-[#7c3aed] px-8 py-3.5 text-base font-semibold text-white hover:bg-[#6d28d9] transition shadow-[0_0_40px_rgba(124,58,237,0.4)]">
                Back to dashboard
              </Link>
            ) : (
              <Link to="/signup" className="rounded-xl bg-[#7c3aed] px-8 py-3.5 text-base font-semibold text-white hover:bg-[#6d28d9] transition shadow-[0_0_40px_rgba(124,58,237,0.4)]">
                Start protecting free
              </Link>
            )}
            <a href="#how" className="rounded-xl border border-[#1f1f2a] bg-[#121218] px-8 py-3.5 text-base font-medium text-white hover:border-[#8b5cf6]/50 transition">
              See how it works
            </a>
          </div>
          
          <div className="mt-12 max-w-2xl mx-auto">
            <LiveTerminal />
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-[#1f1f2a] bg-[#0c0c0f] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Everything you need at the edge</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[#9494a8]">No simulations. Real WAF engine, real DNS verification, real request logging. Works with Namecheap, Cloudflare, and all DNS providers.</p>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-[#1f1f2a] bg-[#121218] p-6 transition hover:border-[#8b5cf6]/40 hover:bg-white/[0.05]">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#8b5cf6]/15 text-[#a78bfa] group-hover:bg-[#8b5cf6]/25 transition">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#9494a8]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-[#1f1f2a] bg-[#0c0c0f] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Simple, transparent pricing</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[#9494a8]">Professional edge protection without the enterprise price tag.</p>
          
          <div className="mt-8 flex items-center justify-center gap-4">
            <button 
              onClick={() => setBilling('monthly')}
              className={`text-sm font-medium transition ${billing === 'monthly' ? 'text-white' : 'text-[#9494a8]'}`}
            >
              Monthly
            </button>
            <button 
              onClick={() => setBilling('annual')}
              className={`relative rounded-full px-3 py-1 text-sm font-medium transition ${billing === 'annual' ? 'bg-[#7c3aed] text-white' : 'text-[#9494a8]'}`}
            >
              Annual
              <span className="absolute -top-2 -right-2 rounded-full bg-[#78350f] px-1.5 py-0.5 text-[10px] font-bold text-white">-20%</span>
            </button>
          </div>
          
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            <div className="rounded-2xl border border-[#1f1f2a] bg-[#121218] p-8">
              <h3 className="text-lg font-semibold">Standard</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">${billing === 'annual' ? '8' : '10'}</span>
                <span className="text-[#9494a8]">/month</span>
              </div>
              <p className="mt-2 text-sm text-[#9494a8]">Perfect for personal projects and small sites</p>
              <ul className="mt-6 space-y-3 text-sm text-[#9494a8]">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> {billing === 'annual' ? '2 website projects -- host up to 2 website domains' : '1 website project -- host up to 1 website domain'}</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> Basic WAF rules</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> 10GB bandwidth</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> Community support</li>
              </ul>
              <Link to="/login" className="mt-8 block rounded-lg border border-[#1f1f2a] bg-[#0c0c0f] px-4 py-3 text-center text-sm font-medium text-white hover:border-[#8b5cf6]/50 transition">
                Get started
              </Link>
            </div>
            <div className="rounded-2xl border-2 border-[#8b5cf6] bg-[#121218] p-8 relative shadow-[0_0_40px_rgba(139,92,246,0.2)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#7c3aed] px-3 py-1 text-xs font-medium text-white">
                Most Popular
              </div>
              <h3 className="text-lg font-semibold">Indie Hacker</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">${billing === 'annual' ? '12' : '15'}</span>
                <span className="text-[#9494a8]">/month</span>
              </div>
              <p className="mt-2 text-sm text-[#9494a8]">Special pricing for bootstrappers and indie hackers</p>
              <ul className="mt-6 space-y-3 text-sm text-[#9494a8]">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> 5 website projects -- host up to 5 other website domains</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> Advanced WAF rules</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> 50GB bandwidth</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> Priority support</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> Real-time analytics</li>
              </ul>
              <Link to="/login" className="mt-8 block rounded-lg bg-[#7c3aed] px-4 py-3 text-center text-sm font-medium text-white hover:bg-[#6d28d9] transition shadow-[0_0_24px_rgba(124,58,237,0.35)]">
                Get started
              </Link>
            </div>
            <div className="rounded-2xl border border-[#1f1f2a] bg-[#121218] p-8">
              <h3 className="text-lg font-semibold">Professional</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">${billing === 'annual' ? '24' : '30'}</span>
                <span className="text-[#9494a8]">/month</span>
              </div>
              <p className="mt-2 text-sm text-[#9494a8]">For growing teams and production workloads</p>
              <ul className="mt-6 space-y-3 text-sm text-[#9494a8]">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> Unlimited websites</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> Custom WAF rules</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> 200GB bandwidth</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> Dedicated support</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" /> API access</li>
              </ul>
              <Link to="/login" className="mt-8 block rounded-lg border border-[#1f1f2a] bg-[#0c0c0f] px-4 py-3 text-center text-sm font-medium text-white hover:border-[#8b5cf6]/50 transition">
                Get started
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-[#1f1f2a] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Go live in three steps</h2>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              { step: "01", title: "Add your domain", desc: "Create a site in the dashboard. We'll show you the DNS records to add." },
              { step: "02", title: "Update DNS records", desc: "Add A or CNAME records in Namecheap, Cloudflare, or your DNS provider. Keep using their DNS management." },
              { step: "03", title: "Traffic is protected", desc: "Every request hits our edge first. WAF, cache, SSL and analytics activate instantly." },
            ].map((s) => (
              <div key={s.step} className="relative rounded-2xl border border-[#1f1f2a] bg-[#0c0c0f] p-8">
                <div className="text-4xl font-bold text-[#8b5cf6]/30">{s.step}</div>
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-[#9494a8]">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      </main>

      <footer className="border-t border-[#1f1f2a] py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <Logo size="sm" />
          <p className="text-sm text-[#9494a8]">Cloud Wire — edge security & performance</p>
        </div>
      </footer>
    </div>
  )
}
