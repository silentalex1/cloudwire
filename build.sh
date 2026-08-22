#!/bin/bash
set -e

echo "Building CloudWire frontend..."
npm install
npm run build

echo "Installing server dependencies..."
cd server
npm install

echo "Build complete!"
echo "Dist folder contents:"
ls -la ../dist/
