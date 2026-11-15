// Bundles the entry point <name>.ts into the minified <name>.js and its source map:
// `node release-tooling/bundle.mjs index`, from an npm script, whose PATH holds esbuild and
// uglifyjs. A Node script, since the build runs in the Node image,
// which holds no Python. @opentelemetry/api stays an import, since the app's instrumentation has
// to share that one copy.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [name] = process.argv.slice(2);
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const run = (tool, args) => execFileSync(tool, args, { stdio: "inherit" });

run("esbuild", [`${name}.ts`, "--bundle", "--minify-syntax", "--format=esm", "--target=es2020", "--sourcemap=external", "--sources-content=false", "--log-level=warning", "--external:@opentelemetry/api", `--outfile=${name}.js`]);
writeFileSync(`${name}.js`, readFileSync(`${name}.js`, "utf8").replaceAll("__version__", version));
run("uglifyjs", [`${name}.js`, "-m", "--source-map", `content='${name}.js.map'`, "-o", `${name}.js`]);
