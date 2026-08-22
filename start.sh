#!/bin/bash
set -e

echo "=== CloudWire Server Start ==="
echo "Working directory: $(pwd)"

echo ""
echo "=== Checking Dist Folder ==="
if [ -d "dist" ]; then
  echo "✓ Dist folder exists"
  echo "File count: $(find dist -type f | wc -l) files"
else
  echo "✗ WARNING: Dist folder NOT found!"
  echo "Frontend may not be accessible"
fi

echo ""
echo "=== Starting CloudWire Server ==="
cd server
node src/index.js
