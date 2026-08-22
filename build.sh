#!/bin/bash
set -e  # Exit on any error

echo "=== CloudWire Build Process ==="
echo "Working directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

echo ""
echo "=== Installing Frontend Dependencies ==="
npm ci || npm install

echo ""
echo "=== Building Frontend ==="
npm run build

echo ""
echo "=== Verifying Build Output ==="
if [ ! -d "dist" ]; then
  echo "❌ ERROR: dist folder was not created!"
  echo "Build may have failed silently. Checking for build errors..."
  npm run build 2>&1 | tee build-error.log
  exit 1
fi

echo "✓ Dist folder exists"
echo ""
echo "Dist folder structure:"
ls -lah dist/

echo ""
echo "Checking for index.html:"
if [ -f "dist/index.html" ]; then
  echo "✓ index.html found"
  echo "Size: $(wc -c < dist/index.html) bytes"
else
  echo "❌ ERROR: index.html not found in dist!"
  exit 1
fi

echo ""
echo "Checking for assets:"
if [ -d "dist/assets" ]; then
  echo "✓ assets folder found"
  echo "Asset files:"
  ls -lah dist/assets/ | head -10
else
  echo "⚠ Warning: No assets folder (may be OK if inlined)"
fi

echo ""
echo "Total files in dist:"
find dist -type f | wc -l

echo ""
echo "=== Installing Server Dependencies ==="
cd server
npm ci || npm install

echo ""
echo "=== Build Complete! ==="
echo "✓ Frontend build: SUCCESS"
echo "✓ Server dependencies: SUCCESS"
echo "✓ Ready to start server"
