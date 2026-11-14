#!/bin/sh
# Runs the Node suite in a container built from the Dockerfile. With TESTED_BUILD_DIR set, it then
# copies the package files that run tested (index.js, its source map and the types) into that
# folder, so a release publishes the build the suite ran against, never a second build.
set -eu

# NODE_IMAGE, when set, is the base image; the Dockerfile pins the default.
docker build -t larvit-log-test-node ${NODE_IMAGE:+--build-arg BASE_IMAGE="$NODE_IMAGE"} .

container="larvit-log-test-node-$$"
trap 'docker rm -f "$container" >/dev/null' EXIT

status=0
docker run --name "$container" --memory 4g --memory-swap 4g larvit-log-test-node npm run ci || status=$?
[ "$status" -eq 0 ] || exit "$status"

if [ -n "${TESTED_BUILD_DIR:-}" ]; then
	mkdir -p "$TESTED_BUILD_DIR"
	for file in index.js index.js.map types; do
		docker cp "$container:/app/$file" "$TESTED_BUILD_DIR/"
	done
fi
