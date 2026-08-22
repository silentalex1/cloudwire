const getApiBase = () => {
  const meta = import.meta as any
  if (meta && meta.env && meta.env.VITE_API_URL) {
    return meta.env.VITE_API_URL
  }
  // In production, use the Render backend URL
  if (meta && meta.env && meta.env.PROD) {
    return 'https://cloudwire-api.onrender.com/api'
  }
  return '/api'
}

const API_BASE = getApiBase()

let projectUnlockToken = ''

export function setProjectUnlock(token: string) {
  projectUnlockToken = token || ''
}

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('cw_token') || localStorage.getItem('token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (projectUnlockToken) {
    headers['X-Project-Unlock'] = projectUnlockToken
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch (err: any) {
    if (API_BASE === '/api') {
      try {
        const apiPort = (import.meta as any).env?.VITE_API_PORT || 10000
        response = await fetch(`http://localhost:${apiPort}/api${endpoint}`, {
          ...options,
          headers,
          credentials: 'include',
        })
      } catch (fallbackErr: any) {
        throw new Error('Unable to connect to CloudWire server. Please ensure the backend server is running.')
      }
    } else {
      throw new Error('Unable to connect to CloudWire server. Please ensure the backend server is running.')
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `Request failed with status ${response.status}` }))
    throw new Error(error.error || `Request failed with status ${response.status}`)
  }

  return response.json()
}

export const authApi = {
  register: (email: string, password: string, name?: string) =>
    apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  getMe: () => apiRequest('/auth/me'),
}

export const sitesApi = {
  list: () => apiRequest('/sites'),
  create: (domain: string) =>
    apiRequest('/sites', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),
  get: (id: string) => apiRequest(`/sites/${id}`),
  update: (id: string, data: any) =>
    apiRequest(`/sites/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiRequest(`/sites/${id}`, {
      method: 'DELETE',
    }),
  enableDdos: (id: string) =>
    apiRequest(`/sites/${id}/ddos/enable`, {
      method: 'POST',
    }),
  disableDdos: (id: string) =>
    apiRequest(`/sites/${id}/ddos/disable`, {
      method: 'POST',
    }),
  setUnderAttack: (id: string) =>
    apiRequest(`/sites/${id}/under-attack`, {
      method: 'POST',
    }),
  host: (domain: string, files: Record<string, string>) =>
    apiRequest('/web/host-site', {
      method: 'POST',
      body: JSON.stringify({ domain, files }),
    }),
  listFiles: (domain: string) =>
    apiRequest(`/web/site/${encodeURIComponent(domain)}/files`),
  getFile: (domain: string, filename: string) =>
    apiRequest(`/web/site/${encodeURIComponent(domain)}/file/${encodeURIComponent(filename)}`),
  uploadFile: (domain: string, filename: string, content: string) =>
    apiRequest(`/web/site/${encodeURIComponent(domain)}/upload`, {
      method: 'POST',
      body: JSON.stringify({ filename, content }),
    }),
}

export const dnsApi = {
  get: (siteId: string) => apiRequest(`/dns/${siteId}`),
  create: (siteId: string, data: any) =>
    apiRequest(`/dns/${siteId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (siteId: string, recordId: string, data: any) =>
    apiRequest(`/dns/${siteId}/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (siteId: string, recordId: string) =>
    apiRequest(`/dns/${siteId}/${recordId}`, {
      method: 'DELETE',
    }),
}

export const analyticsApi = {
  get: (siteId: string) => apiRequest(`/analytics/${siteId}`),
  track: (siteId: string, data?: any) =>
    apiRequest(`/analytics/${siteId}/track`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  update: (siteId: string, data: any) =>
    apiRequest(`/analytics/${siteId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

export const projectsApi = {
  list: () => apiRequest('/projects'),
  getCommunity: () => apiRequest('/projects/community'),
  create: (name: string, description?: string) =>
    apiRequest('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  getComments: (projectId: string) => apiRequest(`/projects/${projectId}/comments`),
  addComment: (projectId: string, text: string) =>
    apiRequest(`/projects/${projectId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  getPublicPreview: (projectId: string) => apiRequest(`/projects/${projectId}/preview`),
  listFiles: (projectId: string) => apiRequest(`/projects/${projectId}/files`),
  getFile: (projectId: string, filename: string) => apiRequest(`/projects/${projectId}/files/${encodeURIComponent(filename)}`),
  saveFile: (projectId: string, filename: string, content: string) =>
    apiRequest(`/projects/${projectId}/files/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  deleteFile: (projectId: string, filename: string) =>
    apiRequest(`/projects/${projectId}/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),
  remix: (projectId: string) =>
    apiRequest(`/projects/${projectId}/remix`, {
      method: 'POST',
    }),
  like: (projectId: string) =>
    apiRequest(`/projects/${projectId}/like`, {
      method: 'POST',
    }),
  start: (projectId: string) =>
    apiRequest(`/projects/${projectId}/start`, {
      method: 'POST',
    }),
  recordView: (projectId: string) =>
    apiRequest(`/projects/${projectId}/view`, {
      method: 'POST',
    }),
  recordClick: (projectId: string) =>
    apiRequest(`/projects/${projectId}/click`, {
      method: 'POST',
    }),
  getAnalytics: (projectId: string) => apiRequest(`/projects/${projectId}/analytics`),
  togglePrivacy: (projectId: string, isPrivate: boolean) =>
    apiRequest(`/projects/${projectId}/privacy`, {
      method: 'PUT',
      body: JSON.stringify({ isPrivate }),
    }),
  delete: (projectId: string) =>
    apiRequest(`/projects/${projectId}`, {
      method: 'DELETE',
    }),
  getShared: () => apiRequest('/projects/shared'),
  share: (projectId: string, data: { target: string; access: string; setPassword?: boolean; password?: string }) =>
    apiRequest(`/projects/${projectId}/share`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  unlock: (projectId: string, password: string) =>
    apiRequest(`/projects/${projectId}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  checkAccess: (projectId: string, password: string) =>
    apiRequest(`/projects/${projectId}/check-access`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
}
