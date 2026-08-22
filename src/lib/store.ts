import { authApi, sitesApi, dnsApi, analyticsApi } from "./api"

export type Site = {
  id: string
  domain: string
  status: "active" | "pending" | "paused"
  plan: string
  threatsBlocked: number
  requests24h: number
  bandwidth: string
  ns1: string
  ns2: string
  ns3: string
  ns4: string
  createdAt: string
  ddosProtection: {
    enabled: boolean
    level: string
    underAttack: boolean
    layer3: boolean
    layer4: boolean
    layer7: boolean
    layer7Strength: number
  }
  rateLimiting: {
    enabled: boolean
    requestsPerMinute: number
    burstSize: number
  }
  botProtection: {
    enabled: boolean
    scoreThreshold: number
    jsChallenge: boolean
    captchaMode: string
  }
}

export type DnsRecord = {
  id: string
  type: string
  name: string
  content: string
  ttl: number
  proxied: boolean
}

export type WafRule = {
  id: string
  name: string
  expression: string
  action: "block" | "challenge" | "log" | "allow"
  enabled: boolean
}

const AUTH_KEY = "cw_auth"
const TOKEN_KEY = "cw_token"

export type AuthUser = {
  id?: string
  email: string
  name: string
  plan?: string
  billingCycle?: string
  billing_cycle?: string
}

export function normalizePlan(p?: string) {
  const n = String(p || "Standard").toLowerCase()
  if (n.includes("professional") || n === "pro") return "Professional"
  if (n.includes("indie")) return "Indie Hacker"
  return "Standard"
}

export function getPlanLimits(user?: AuthUser | null) {
  const plan = normalizePlan(user?.plan)
  if (plan === "Professional") return { plan, sites: Number.POSITIVE_INFINITY, projects: Number.POSITIVE_INFINITY }
  if (plan === "Indie Hacker") return { plan, sites: 5, projects: 5 }
  const billing = String(user?.billingCycle || user?.billing_cycle || "monthly").toLowerCase()
  if (billing === "annual") return { plan: "Standard", sites: 2, projects: 2 }
  return { plan: "Standard", sites: 1, projects: 1 }
}

export function getAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY) || localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAuth(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user))
    localStorage.setItem('user', JSON.stringify(user))
  } else {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem('user')
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token')
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem('token', token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('token')
  }
}

function mapSite(raw: any): Site {
  const ddos = raw.ddosProtection || raw.ddos_protection || {}
  const rate = raw.rateLimiting || raw.rate_limiting || {}
  const bot = raw.botProtection || raw.bot_protection || {}
  return {
    id: raw.id,
    domain: raw.domain,
    status: raw.status || 'pending',
    plan: raw.plan || 'Indie Hacker',
    threatsBlocked: Number(raw.threatsBlocked ?? raw.threats_blocked ?? 0),
    requests24h: Number(raw.requests24h ?? raw.requests_24h ?? 0),
    bandwidth: raw.bandwidth || '0 GB',
    ns1: raw.ns1 || 'ns1.cloudwire.cfd',
    ns2: raw.ns2 || 'ns2.cloudwire.cfd',
    ns3: raw.ns3 || 'ns3.cloudwire.cfd',
    ns4: raw.ns4 || 'ns4.cloudwire.cfd',
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    ddosProtection: {
      enabled: ddos.enabled !== false,
      level: ddos.level || 'extreme',
      underAttack: !!ddos.underAttack,
      layer3: ddos.layer3 !== false,
      layer4: ddos.layer4 !== false,
      layer7: ddos.layer7 !== false,
      layer7Strength: Number(ddos.layer7Strength || 7),
    },
    rateLimiting: {
      enabled: rate.enabled !== false,
      requestsPerMinute: rate.requestsPerMinute || 400,
      burstSize: rate.burstSize || 40,
    },
    botProtection: {
      enabled: bot.enabled !== false,
      scoreThreshold: bot.scoreThreshold || 20,
      jsChallenge: bot.jsChallenge !== false,
      captchaMode: bot.captchaMode || 'fun',
    },
  }
}

export async function listSites(): Promise<Site[]> {
  try {
    const data = await sitesApi.list()
    const rows = Array.isArray(data) ? data : (data?.sites || [])
    return rows.filter(Boolean).map(mapSite)
  } catch {
    return []
  }
}

export async function createSite(domain: string): Promise<Site> {
  const raw = await sitesApi.create(domain)
  return mapSite(raw)
}

export async function getSite(id: string): Promise<Site | undefined> {
  try {
    return mapSite(await sitesApi.get(id))
  } catch {
    return undefined
  }
}

export async function updateSite(id: string, patch: Partial<Site>) {
  await sitesApi.update(id, patch)
}

export async function deleteSite(id: string) {
  await sitesApi.delete(id)
}

export async function getDnsRecords(siteId: string): Promise<DnsRecord[]> {
  try {
    return await dnsApi.get(siteId)
  } catch {
    return defaultDns("example.com")
  }
}

export function defaultDns(domain: string): DnsRecord[] {
  return [
    { id: "1", type: "A", name: "@", content: "127.0.0.1", ttl: 60, proxied: true },
    { id: "2", type: "A", name: "www", content: "127.0.0.1", ttl: 60, proxied: true },
    { id: "3", type: "NS", name: "@", content: "ns1.cloudwire.cfd", ttl: 3600, proxied: false },
    { id: "4", type: "NS", name: "@", content: "ns2.cloudwire.cfd", ttl: 3600, proxied: false },
    { id: "5", type: "NS", name: "@", content: "ns3.cloudwire.cfd", ttl: 3600, proxied: false },
    { id: "6", type: "NS", name: "@", content: "ns4.cloudwire.cfd", ttl: 3600, proxied: false },
    { id: "7", type: "TXT", name: "@", content: "v=spf1 include:_spf.cloudwire.cfd ~all", ttl: 3600, proxied: false },
    { id: "8", type: "CNAME", name: "www", content: domain, ttl: 60, proxied: true },
  ]
}

export function defaultWaf(): WafRule[] {
  return [
    { id: "m1", name: "SQL Injection", expression: "(http.request.uri.query contains \"union select\") or (http.request.body contains \"' or 1=1\")", action: "block", enabled: true },
    { id: "m2", name: "XSS Filter", expression: "(http.request.uri.query contains \"<script\") or (http.request.body contains \"javascript:\")", action: "block", enabled: true },
    { id: "m3", name: "Path Traversal", expression: "http.request.uri.path contains \"../\"", action: "block", enabled: true },
    { id: "m4", name: "Bot Score Challenge", expression: "cf.bot_management.score lt 20", action: "challenge", enabled: true },
    { id: "m5", name: "Rate Limit API", expression: "http.request.uri.path contains \"/api/\" and rate(1m) > 40", action: "block", enabled: true },
    { id: "m6", name: "RCE / Command Injection", expression: "(http.request.body contains \"system(\") or (http.request.uri.query contains \"cmd=\")", action: "block", enabled: true },
    { id: "m7", name: "SSRF", expression: "(http.request.uri.query contains \"169.254.169.254\") or (http.request.body contains \"file://\")", action: "block", enabled: true },
    { id: "m8", name: "Header Injection", expression: "http.request.headers contains \"\\r\\n\"", action: "block", enabled: true },
    { id: "m9", name: "Layer 7 HTTP Flood", expression: "rate(1s) > 25 and not cf.bot_management.verified", action: "challenge", enabled: true },
    { id: "m10", name: "XML / XXE", expression: "http.request.body contains \"<!ENTITY\"", action: "block", enabled: true },
  ]
}

export async function getAnalytics(siteId: string) {
  try {
    return await analyticsApi.get(siteId)
  } catch {
    return {
      requests24h: 0,
      threatsBlocked: 0,
      bandwidth: "0 GB",
      traffic: [],
      threats: []
    }
  }
}
