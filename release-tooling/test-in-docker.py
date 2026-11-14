#!/usr/bin/env python3
"""NODE_IMAGE picks the base image, as `docker build --build-arg BASE_IMAGE` does.

After a green run, TESTED_BUILD_DIR names a folder that receives index.js, index.js.map and types,
all built in the container whose copy of index.js the suite ran. push.yaml uploads that folder and
publish.yaml publishes it.
"""
import os
import shutil
import signal
import subprocess
import sys

IMAGE = "larvit-log-test-node"
PACKAGE_FILES = ["index.js", "index.js.map", "types"]


def main() -> int:
	build = ["docker", "build", "-t", IMAGE]
	if os.environ.get("NODE_IMAGE"):
		build += ["--build-arg", "BASE_IMAGE=" + os.environ["NODE_IMAGE"]]
	built = subprocess.run(build + ["."])
	if built.returncode != 0:
		return built.returncode

	container = f"{IMAGE}-{os.getpid()}"
	# Turn a kill into an exit, so the `finally` below removes the container on every way out.
	for sig in (signal.SIGTERM, signal.SIGHUP):
		signal.signal(sig, lambda signum, _frame: sys.exit(128 + signum))
	try:
		suite = subprocess.run(
			["docker", "run", "--name", container, "--memory", "4g", "--memory-swap", "4g", IMAGE, "npm", "run", "ci"]
		)
		out = os.environ.get("TESTED_BUILD_DIR")
		if suite.returncode != 0 or not out:
			return suite.returncode
		os.makedirs(out, exist_ok=True)
		# `docker cp` merges into a folder that exists, so clear the types an earlier run left.
		shutil.rmtree(os.path.join(out, "types"), ignore_errors=True)
		for name in PACKAGE_FILES:
			copied = subprocess.run(["docker", "cp", f"{container}:/app/{name}", out + "/"])
			if copied.returncode != 0:
				return copied.returncode
		return 0
	except KeyboardInterrupt:
		return 130
	finally:
		subprocess.run(["docker", "rm", "-f", container], stdout=subprocess.DEVNULL)


if __name__ == "__main__":
	sys.exit(main())
