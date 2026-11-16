// Runs the browser suite in the Playwright image that matches the playwright version in
// package.json, which ships the browsers. Needs Docker and Node on the host.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const IMAGE = "larvit-log-test-browser";
const { devDependencies } = JSON.parse(readFileSync("package.json", "utf8"));
const run = args => execFileSync("docker", args, { stdio: "inherit" });

run(["build", "-t", IMAGE, "--build-arg", `BASE_IMAGE=mcr.microsoft.com/playwright:v${devDependencies.playwright}-noble`, "."]);
run(["run", "--rm", "--init", "--ipc=host", "--memory", "4g", "--memory-swap", "4g", IMAGE, "npm", "run", "ci-browser"]);
