#!/bin/bash
set -e

echo "Starting CloudWire server..."
cd server
node src/index.js
