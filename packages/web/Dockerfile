# Built from the repository root, not from this directory:
#   docker build -f packages/web/Dockerfile -t dbml-schema-visualizer-web .
# The site is one package of a yarn workspace and depends on four of its
# siblings by source, so the build needs the whole monorepo in context.

FROM node:22-alpine AS build
WORKDIR /repo

# Manifests first, and only manifests: this layer is what `yarn install` reads,
# so it is rebuilt only when a dependency changes rather than on every edit to a
# source file.
#
# Each workspace is listed by hand because `COPY packages/*/package.json` would
# flatten them all into one directory and lose which package each belonged to.
#
# ADDING A PACKAGE TO THE MONOREPO MEANS ADDING IT HERE. Yarn resolves
# `workspaces: ["packages/*"]` against what is on disk, so a package present in
# the repository and missing from this list makes the install fail with an
# unresolvable workspace dependency — loudly, which is the intent. A package
# missing from BOTH is worse and is what this comment exists to prevent.
COPY package.json yarn.lock ./
COPY packages/db-to-dbml/package.json packages/db-to-dbml/
COPY packages/dbml-to-json-table-schema/package.json packages/dbml-to-json-table-schema/
COPY packages/dbml-vs-code-extension/package.json packages/dbml-vs-code-extension/
COPY packages/extension-shared/package.json packages/extension-shared/
COPY packages/json-table-schema-visualizer/package.json packages/json-table-schema-visualizer/
COPY packages/mkdocs-dbml/package.json packages/mkdocs-dbml/
COPY packages/schema-diff/package.json packages/schema-diff/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/

# `--frozen-lockfile` so the image cannot quietly build against versions the
# lockfile does not name. The package registry is the only network this stage
# needs; nothing is fetched at run time, which is the whole point of the site.
RUN yarn install --frozen-lockfile

COPY . .

# The bundle is about 14 MB, most of it the editor, and rolling it up needs more
# heap than Node allows itself by default inside a container — the build dies
# with "Reached heap limit" and a SIGABRT that says nothing about memory unless
# you read the whole log. Raised here rather than in the package's own build
# script, because on a developer's machine the default is already ample and this
# is a property of the container, not of the project.
#
# The container itself must be able to give it: a Docker daemon capped below
# ~2 GB will kill the build instead, which reads as an unexplained exit 137.
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN yarn workspace web build

# The same build also leaves what a documentation site takes from here (see the
# README): `validate.mjs`, a Node program of several megabytes that the MkDocs
# plugin runs at build time; `frame-host.js` and `.css`, which that plugin
# vendors into the sites it builds; and `.vite/manifest.json`, the graph it
# packages the frame by — which names source paths under `node_modules`. None
# of them is anything a reader of this site requests, and the manifest is
# nothing to publish, so the image does not carry them. Deleted here rather than
# built elsewhere: the frame's own chunks stay in `dist`, where the plugin's
# packaging finds them.
RUN cd packages/web/dist \
 && rm -r validate.mjs frame-host.js frame-host.css .vite

# The catalogue's folder, as a stage rather than a plain COPY so that BuildKit
# can replace it wholesale:
#
#   docker build --build-context schemas=/anywhere/on/disk ...
#
# A plain COPY cannot reach outside the build context, and the build context
# here is the repository — so without this an operator could only bake in
# schemas that live in this repository, which is not where anyone's schemas
# live.
#
# The default is `packages/web/schemas/`, which holds nothing but a `.gitkeep`.
# An image built without the flag therefore carries an empty catalogue and is
# the site exactly as it was before any of this existed.
FROM scratch AS schemas
COPY packages/web/schemas/ /

FROM nginx:alpine AS serve

COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/web/dist /usr/share/nginx/html

# Outside the document root on purpose: a volume can be mounted over this path
# without touching the bundle, and it can be mounted read-only — which is why
# the manifest the scanner writes goes somewhere else entirely.
COPY --from=schemas / /srv/schemas

# The official image runs everything executable in this directory before
# starting the server, so the manifest is rebuilt on every start and a swapped
# volume needs no rebuild of the image.
COPY packages/web/docker/schema-manifest.sh /docker-entrypoint.d/40-schema-manifest.sh
RUN chmod +x /docker-entrypoint.d/40-schema-manifest.sh \
 && mkdir -p /var/lib/dbml-schema-visualizer

# Above 1024 so the server needs no privileged port and the image can run as a
# non-root user where the operator's platform asks for one.
EXPOSE 8080
