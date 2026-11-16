// Builds the package: the declaration files under types/, and index.js and otel.js, each bundled
// with a source map. Run it as `npm run build`, which puts tsc on the PATH.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (tool, args) => execFileSync(tool, args, { stdio: "inherit" });

for (const path of ["index.js", "index.js.map", "otel.js", "otel.js.map", "types"]) rmSync(path, { force: true, recursive: true });
run("tsc", ["-p", "tsconfig.build.json"]);
run("node", ["release-tooling/bundle.mjs", "index"]);
run("node", ["release-tooling/bundle.mjs", "otel"]);
