# Runs the test suite with dependencies installed *inside* the container, so a local run is
# byte-for-byte the same as CI. BASE_IMAGE switches between the Node matrix (node:<version>) and
# the official Playwright image (browsers preinstalled) used for the browser tests.
ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}

# Browsers ship inside the Playwright base image; never let the npm install download them.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Install deps first so this layer is cached unless the manifests change.
COPY .npmrc package.json package-lock.json ./
RUN npm ci

COPY . .

# The actual command (npm run ci / ci-browser) is passed by `docker run`.
