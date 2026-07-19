#!/bin/bash
set -euo pipefail

echo "Building all packages..."
npm run build

echo "Running tests..."
npm test

echo "Publishing packages in order..."

# Types package
echo "Publishing @svelte-devtools/types..."
cd packages/types && npm publish --access public && cd ../..

# Runtime package  
echo "Publishing @svelte-devtools/runtime..."
cd packages/runtime && npm publish --access public && cd ../..

# Vite plugin package
echo "Publishing @svelte-devtools/vite-plugin..."
cd packages/vite-plugin && npm publish --access public && cd ../..

# Client package
echo "Publishing @svelte-devtools/client..."
cd packages/client && npm publish --access public && cd ../..

echo "✅ All packages published successfully!"
