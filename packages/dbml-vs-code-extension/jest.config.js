const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig.json");

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/extension"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^vscode$": "<rootDir>/extension/__mocks__/vscode.ts",
    // db-to-dbml `main` points at src/index.js (only .ts exists); map to TS entry.
    "^db-to-dbml$": "<rootDir>/../db-to-dbml/src/index.ts",
    "^schema-diff$": "<rootDir>/../schema-diff/src/index.ts",
    // Same as above: `main` names src/index.js, but only the TS source exists.
    "^dbml-to-json-table-schema$":
      "<rootDir>/../dbml-to-json-table-schema/src/index.ts",
    ...pathsToModuleNameMapper(compilerOptions.paths, {
      prefix: "<rootDir>/",
    }),
  },
};
