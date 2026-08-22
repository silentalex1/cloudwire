#!/bin/bash
set -e

echo "=== CloudWire Build Process ==="
echo "Working directory: $(pwd)"

echo ""
echo "=== Installing Frontend Dependencies ==="
npm install

echo ""
echo "=== Building Frontend ==="
npm run build

echo ""
echo "=== Checking Dist Folder ==="
if [ -d "dist" ]; then
  echo "✓ Dist folder exists"
  echo "Dist folder contents:"
  ls -la dist/
  echo ""
  echo "File count in dist:"
  find dist -type f | wc -l
else
  echo "✗ ERROR: Dist folder NOT found!"
  exit 1
fi

echo ""
echo "=== Installing Server Dependencies ==="
cd server
npm install

echo ""
echo "=== Build Complete! ==="
echo "Frontend build: ✓"
echo "Server dependencies: ✓"
