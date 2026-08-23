const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
const PREVIEW_THEME = '<style data-cw-preview>html,body{background:#09090b;color:#ffffff;}body,p,h1,h2,h3,h4,h5,h6,a,li,span,div,label{color:#ffffff;}a{color:#c4b5fd;}</style>';

function enhanceProjectHtml(html) {
  if (!html || typeof html !== 'string') return html;
  let result = html;
  if (!/viewport/i.test(result)) {
    if (/<head[^>]*>/i.test(result)) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>${VIEWPORT}`);
    } else if (/<html[^>]*>/i.test(result)) {
      result = result.replace(/<html([^>]*)>/i, `<html$1><head>${VIEWPORT}</head>`);
    } else {
      result = `<!DOCTYPE html><html><head>${VIEWPORT}</head><body>${result}</body></html>`;
    }
  }
  if (!/data-cw-preview/.test(result)) {
    if (/<head[^>]*>/i.test(result)) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>${PREVIEW_THEME}`);
    } else if (/<html[^>]*>/i.test(result)) {
      result = result.replace(/<html([^>]*)>/i, `<html$1><head>${PREVIEW_THEME}</head>`);
    }
  }
  return result;
}

function defaultStyleCss() {
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
  position: relative;
}
.cloudwire-card {
  background: rgba(18, 18, 24, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 24px;
  padding: 48px 40px;
  max-width: 500px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 20px rgba(139, 92, 246, 0.12);
  position: relative;
  overflow: hidden;
}
.icon-wrapper {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(109, 40, 217, 0.1) 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 20px rgba(139, 92, 246, 0.15);
}
.icon-wrapper svg {
  width: 32px;
  height: 32px;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.25);
  border-radius: 9999px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 20px;
  animation: pulse-glow 2s ease-in-out infinite;
}
.status-dot {
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 rgba(34, 197, 94, 0); }
  50% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.3); }
}
h1 {
  font-size: 36px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}
.subtitle {
  color: #a1a1aa;
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 32px;
}
.actions {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}
.cw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
  color: #ffffff;
  text-decoration: none;
  font-weight: 600;
  font-size: 15px;
  padding: 14px 32px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
  transition: all 0.2s ease;
  border: 1px solid rgba(167, 139, 250, 0.2);
}
.cw-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(124, 58, 237, 0.45);
  background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
}
.cw-btn:active {
  transform: translateY(0);
}
.footer-link {
  color: #71717a;
  font-size: 13px;
  text-decoration: none;
  transition: color 0.2s ease;
}
.footer-link:hover {
  color: #a1a1aa;
  text-decoration: underline;
}
@media (max-width: 500px) {
  .cloudwire-card {
    padding: 36px 28px;
  }
  h1 {
    font-size: 28px;
  }
}
`;
}

function defaultScriptJs() {
  return `document.addEventListener('DOMContentLoaded', function () {
  console.log('CloudWire website loaded successfully');
});
`;
}

function defaultProjectHtml(name, description, subdomain) {
  const css = defaultStyleCss();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="cloudwire-card">
    <div class="icon-wrapper">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="status-badge">
      <span class="status-dot"></span>
      STATUS: ACTIVE
    </div>
    <h1>${name}</h1>
    <p class="subtitle">${description || 'This website is protected by CloudWire Edge Network.'}</p>
    <div class="actions">
      <a href="https://cloudwire.onrender.com/dashboard" target="_blank" rel="noopener noreferrer" class="cw-btn">
        Go to Dashboard
      </a>
    </div>
    <a href="https://cloudwire.onrender.com/login" class="footer-link">Are you the site owner? Log in to your CloudWire account</a>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      console.log('CloudWire website loaded successfully');
    });
  </script>
</body>
</html>`;
}

function defaultSiteHtml(domain) {
  const css = defaultStyleCss();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${domain}</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="cloudwire-card">
    <div class="icon-wrapper">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#8b5cf6" stroke-width="2"/>
        <path d="M2 12H22" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 2C14.5 4.5 16 8 16 12C16 16 14.5 19.5 12 22C9.5 19.5 8 16 8 12C8 8 9.5 4.5 12 2Z" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="status-badge">
      <span class="status-dot"></span>
      STATUS: ACTIVE
    </div>
    <h1>${domain}</h1>
    <p class="subtitle">This domain is protected by CloudWire Edge Network with advanced DDoS protection and Web Application Firewall.</p>
    <div class="actions">
      <a href="https://cloudwire.onrender.com/dashboard" target="_blank" rel="noopener noreferrer" class="cw-btn">
        Manage Site
      </a>
    </div>
    <a href="https://cloudwire.onrender.com/login" class="footer-link">Are you the site owner? Log in to your CloudWire account</a>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      console.log('CloudWire website loaded successfully');
    });
  </script>
</body>
</html>`;
}

function seedProjectFiles(target, id, name, description, subdomain) {
  target[`${id}:index.html`] = defaultProjectHtml(name, description, subdomain);
  target[`${id}:style.css`] = defaultStyleCss();
  target[`${id}:script.js`] = defaultScriptJs();
}

function buildCompleteHtml(html, css, js) {
  // If HTML already has a complete document structure, inject CSS and JS
  if (html && (html.includes('<html') || html.includes('<HTML'))) {
    let result = html;
    
    // Inject CSS
    if (css && !html.includes(css)) {
      if (result.includes('</head>')) {
        result = result.replace('</head>', `<style>${css}</style></head>`);
      } else if (result.includes('<head>')) {
        result = result.replace('<head>', `<head><style>${css}</style>`);
      } else {
        result = result.replace(/<html([^>]*)>/i, `<html$1><head><style>${css}</style></head>`);
      }
    }
    
    // Inject JS
    if (js && !html.includes(js)) {
      if (result.includes('</body>')) {
        result = result.replace('</body>', `<script>${js}</script></body>`);
      } else {
        result += `<script>${js}</script>`;
      }
    }
    
    return result;
  }
  
  // Build a complete HTML document from scratch
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudWire Project</title>
  <style>${css || ''}</style>
</head>
<body>
  ${html || ''}
  <script>${js || ''}</script>
</body>
</html>`;
}

module.exports = { enhanceProjectHtml, defaultProjectHtml, defaultSiteHtml, defaultStyleCss, defaultScriptJs, seedProjectFiles, buildCompleteHtml, VIEWPORT };
