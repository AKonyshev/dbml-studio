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
    "^virtual:vscode$": "<rootDir>/extension/__mocks__/virtualVscode.ts",
    // db-to-dbml `main` points at src/index.js (only .ts exists); map to TS entry.
    "^db-to-dbml$": "<rootDir>/../db-to-dbml/src/index.ts",
    "^schema-diff$": "<rootDir>/../schema-diff/src/index.ts",
    ...pathsToModuleNameMapper(compilerOptions.paths, {
      prefix: "<rootDir>/",
    }),
  },
};
