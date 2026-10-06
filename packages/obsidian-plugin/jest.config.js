const { gzipSync } = require("node:zlib");

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  // The frame view builds real elements and listens for real messages; the pure
  // modules do not care either way, so the whole package runs in a DOM. The one
  // test that spawns a script asks for Node itself, in its own docblock.
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  // What scripts/build-plugin.mjs puts into main.js with esbuild's `define`
  // (src/globals.d.ts): a frame of a build of its own, packed the same way.
  globals: {
    DBML_FRAME_BUILD: "test-build\n",
    DBML_FRAME_GZIP: gzipSync(
      "<!doctype html><title>test frame</title>",
    ).toString("base64"),
  },
};
