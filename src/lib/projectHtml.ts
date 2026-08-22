const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
const BASE_STYLES = `<style>
*, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #f4f4f5; line-height: 1.5; }
.min-h-screen { min-height: 100vh; }
.flex { display: flex; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.text-center { text-align: center; }
.p-6 { padding: 1.5rem; }
.p-8 { padding: 2rem; }
.p-4 { padding: 1rem; }
.max-w-md { max-width: 28rem; }
.w-full { width: 100%; }
.rounded-2xl { border-radius: 1rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-full { border-radius: 9999px; }
.border { border-width: 1px; }
.bg-zinc-950 { background-color: #09090b; }
.bg-zinc-900 { background-color: #18181b; }
.text-white { color: #ffffff; }
.text-zinc-400 { color: #a1a1aa; }
.text-purple-400 { color: #c084fc; }
.text-purple-300 { color: #d8b4fe; }
.text-3xl { font-size: 1.875rem; line-height: 2.25rem; font-weight: 700; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.font-mono { font-family: ui-monospace, monospace; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-6 { margin-bottom: 1.5rem; }
.inline-block { display: inline-block; }
.inline-flex { display: inline-flex; }
.gap-2 { gap: 0.5rem; }
.shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
</style>`

const BABEL_STANDALONE = '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>'
const REACT_LIBS = '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script><script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>'

export function defaultProjectHtml(name: string, description?: string, subdomain?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
</head>
<body class="bg-zinc-950 text-white min-h-screen flex items-center justify-center p-6 font-sans">
  <div class="max-w-md w-full rounded-2xl bg-zinc-900 border border-purple-500/30 p-8 text-center shadow-2xl" style="border: 1px solid rgba(139, 92, 246, 0.3); background: #121218;">
    <div class="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 rounded-full border border-purple-500/20 mb-4" style="background: rgba(139, 92, 246, 0.1); color: #c4b5fd; padding: 4px 12px; border-radius: 9999px; font-size: 11px;">
      CloudWire Edge App
    </div>
    <h1 class="text-3xl font-bold text-white mb-2" style="font-size: 24px; color: #fff; margin-bottom: 8px;">${name}</h1>
    <p class="text-zinc-400 text-sm mb-6" style="color: #a1a1aa; font-size: 14px; margin-bottom: 20px;">${description || 'Live fullstack edge project hosted on CloudWire.'}</p>
    <div class="bg-zinc-950/60 rounded-xl p-3 text-xs font-mono text-purple-300 border border-zinc-800 mb-6" style="background: #09090b; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 12px; color: #c4b5fd; margin-bottom: 20px;">
      ${subdomain || `${name}.cloudwire.cfd`}
    </div>
    <a href="https://cloudwire.cfd" target="_blank" class="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl shadow-lg transition" style="background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 600;">
      Hosted on CloudWire &rarr;
    </a>
  </div>
</body>
</html>`
}

export function defaultStyleCss(): string {
  return defaultSiteStyleCss()
}

export function defaultScriptJs(): string {
  return defaultSiteScriptJs()
}

export function defaultSiteStyleCss(): string {
  return `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
body {
  min-height: 100vh;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: radial-gradient(circle at 50% 20%, #1e1b4b 0%, #09090b 80%);
  color: #e4e4e7;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
.cloudwire-card {
  background: rgba(18, 18, 24, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 20px;
  padding: 40px 32px;
  max-width: 480px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 92, 246, 0.15);
}
.badge {
  display: inline-block;
  background: rgba(139, 92, 246, 0.15);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.35);
  border-radius: 9999px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 20px;
}
h1 {
  font-size: 32px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}
.subtitle {
  color: #a1a1aa;
  font-size: 16px;
  line-height: 1.5;
  margin-bottom: 28px;
}
.actions {
  display: flex;
  justify-content: center;
}
.cw-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
  color: #ffffff;
  text-decoration: none;
  font-weight: 600;
  font-size: 15px;
  padding: 12px 28px;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(124, 58, 237, 0.35);
  transition: all 0.2s ease;
}
.cw-btn span {
  text-decoration: underline;
  color: #ede9fe;
}
.cw-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(124, 58, 237, 0.5);
  background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
}
`
}

export function defaultSiteScriptJs(): string {
  return `document.addEventListener('DOMContentLoaded', function () {
  console.log('CloudWire website running on edge');
});
`
}

export function defaultSiteHtml(domain: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${domain}</title>
</head>
<body>
  <div class="cloudwire-card">
    <div class="badge">CloudWire Edge Network</div>
    <h1>${domain}</h1>
    <p class="subtitle">this website is using cloud wire.</p>
    <div class="actions">
      <a href="https://cloudwire.cfd" target="_blank" rel="noopener noreferrer" class="cw-btn">
        use cloudwire @ <span>here</span>
      </a>
    </div>
  </div>
</body>
</html>`
}

export function enhanceProjectHtml(html: string, baseHref?: string): string {
  if (!html) return html
  let result = html
  if (!/viewport/i.test(result)) {
    if (/<head[^>]*>/i.test(result)) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>${VIEWPORT}`)
    } else {
      result = `<!DOCTYPE html><html><head>${VIEWPORT}</head><body>${result}</body></html>`
    }
  }
  return result
}

export function buildLivePreview(
  htmlOrCode: string,
  css?: string,
  jsOrTs?: string,
  allFiles?: Record<string, string>
): string {
  let mainHtml = htmlOrCode || ''
  
  if (allFiles) {
    if (allFiles['index.html']) mainHtml = allFiles['index.html']
  }

  const hasTsx = jsOrTs && (/\bimport\s+React\b|\bjsx\b|<[A-Z][a-zA-Z0-9]*|<\/[a-zA-Z0-9]+>|interface\s+\w+|type\s+\w+\s*=|\bReactDOM\.render|\bcreateRoot\b/.test(jsOrTs) || (allFiles && Object.keys(allFiles).some(k => k.endsWith('.tsx') || k.endsWith('.ts') || k.endsWith('.jsx'))))

  if (!mainHtml || (!mainHtml.includes('<html') && !mainHtml.includes('<body'))) {
    mainHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${VIEWPORT}
  ${BASE_STYLES}
  ${hasTsx ? `${REACT_LIBS}${BABEL_STANDALONE}` : ''}
  <style>${css || ''}</style>
</head>
<body class="bg-zinc-950 text-white min-h-screen p-4">
  <div id="root">${mainHtml}</div>
  ${jsOrTs ? `<script ${hasTsx ? 'type="text/babel" data-presets="react,typescript"' : ''}>
    ${jsOrTs}
  </script>` : ''}
</body>
</html>`
  } else {
    if (hasTsx && !mainHtml.includes('@babel/standalone')) {
      mainHtml = mainHtml.replace(/<head[^>]*>/i, `$&${REACT_LIBS}${BABEL_STANDALONE}`)
    }
    if (css && !mainHtml.includes(css)) {
      if (mainHtml.includes('</head>')) {
        mainHtml = mainHtml.replace('</head>', `<style>${css}</style></head>`)
      } else {
        mainHtml = `<style>${css}</style>${mainHtml}`
      }
    }
    if (jsOrTs && !mainHtml.includes(jsOrTs)) {
      const scriptTag = `<script ${hasTsx ? 'type="text/babel" data-presets="react,typescript"' : ''}>${jsOrTs}</script>`
      if (mainHtml.includes('</body>')) {
        mainHtml = mainHtml.replace('</body>', `${scriptTag}</body>`)
      } else {
        mainHtml += scriptTag
      }
    }
  }

  return mainHtml
}

export function getProjectSubdomainUrl(name: string, username?: string): string {
  const path = username ? `/${encodeURIComponent(username)}` : ''
  const isProd = window.location.hostname !== 'localhost'
  
  if (isProd) {
    if (window.location.hostname === 'cloudwire.cfd' || window.location.hostname.endsWith('.cloudwire.cfd')) {
      return `https://${name}.cloudwire.cfd${path}`
    }
    return `${window.location.origin}/project/${name}${path}`
  }
  
  const port = (import.meta as any).env?.VITE_API_PORT || 3201
  return `http://${name}.localhost:${port}${path}`
}

export function getProjectLiveUrl(name: string): string {
  const isProd = window.location.hostname !== 'localhost'
  
  if (isProd) {
    if (window.location.hostname === 'cloudwire.cfd' || window.location.hostname.endsWith('.cloudwire.cfd')) {
      return `https://${name}.cloudwire.cfd`
    }
    return `${window.location.origin}/project/${name}`
  }
  
  return `http://localhost:3201/${name}`
}

export function previewFallbackHtml(name: string, description?: string): string {
  return enhanceProjectHtml(`<!DOCTYPE html><html><head><title>${name}</title></head><body style="background:#09090b;color:#a1a1aa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="text-align:center;padding:24px;"><h2 style="color:#fff;">${name}</h2><p>${description || 'Preview loading...'}</p></div></body></html>`)
}

