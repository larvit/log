// Builds the package, then compiles the tests into .tmp/test beside the built index.js and otel.js
// that they import. Run it as `npm run build-tests`, which puts tsc on the PATH.
import { copyFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const run = (tool, args) => execFileSync(tool, args, { stdio: "inherit" });

run("node", ["release-tooling/build.mjs"]);
rmSync(".tmp/test", { force: true, recursive: true });
run("tsc", ["-p", "tsconfig.test.json"]);
for (const file of ["index.js", "otel.js"]) copyFileSync(file, `.tmp/test/${file}`);
