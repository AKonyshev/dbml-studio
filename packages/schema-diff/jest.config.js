const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig.json");

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["./"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    // db-to-dbml is a workspace package whose `main` points at src/index.js
    // (a file that only exists as .ts); ts-jest can't resolve the bare import,
    // so map it to the TypeScript entry directly.
    "^db-to-dbml$": "<rootDir>/../db-to-dbml/src/index.ts",
    ...pathsToModuleNameMapper(compilerOptions.paths, {
      prefix: "<rootDir>/",
    }),
  },
};
