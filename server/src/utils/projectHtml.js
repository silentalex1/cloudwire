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
`;
}

function defaultScriptJs() {
  return `document.addEventListener('DOMContentLoaded', function () {
  console.log('CloudWire website loaded successfully');
});
`;
}

function defaultProjectHtml(name, description, subdomain) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="cloudwire-card">
    <div class="badge">CloudWire Project</div>
    <h1>${name}</h1>
    <p class="subtitle">${description || 'this website is using cloud wire.'}</p>
    <div class="actions">
      <a href="https://cloudwire.cfd" target="_blank" rel="noopener noreferrer" class="cw-btn">
        use cloudwire @ <span>here</span>
      </a>
    </div>
  </div>
  <script src="script.js"></script>
</body>
</html>`;
}

function defaultSiteHtml(domain) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${domain}</title>
  <link rel="stylesheet" href="style.css">
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
  <script src="script.js"></script>
</body>
</html>`;
}

function seedProjectFiles(target, id, name, description, subdomain) {
  target[`${id}:index.html`] = defaultProjectHtml(name, description, subdomain);
  target[`${id}:style.css`] = defaultStyleCss();
  target[`${id}:script.js`] = defaultScriptJs();
}

module.exports = { enhanceProjectHtml, defaultProjectHtml, defaultSiteHtml, defaultStyleCss, defaultScriptJs, seedProjectFiles, VIEWPORT };
