#!/bin/sh
# Bundles the entry point <name>.ts into the minified <name>.js and its source map: `bundle.sh index`.
# @opentelemetry/api stays an import, since the app's instrumentation has to share that one copy.
set -eu

name=$1

esbuild "$name.ts" --bundle --minify-syntax --format=esm --target=es2020 --sourcemap=external --sources-content=false --log-level=warning --external:@opentelemetry/api --outfile="$name.js"
sed -i.bak "s/__version__/$(node -p "require('./package.json').version")/g" "$name.js"
rm -f "$name.js.bak"
uglifyjs "$name.js" -m --source-map "content='$name.js.map'" -o "$name.js"
