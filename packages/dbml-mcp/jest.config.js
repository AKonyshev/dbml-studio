/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    // Both are workspace packages whose `main` names a .js file that only
    // exists as .ts; point jest at the TypeScript entries.
    "^db-to-dbml$": "<rootDir>/../db-to-dbml/src/index.ts",
    "^schema-diff$": "<rootDir>/../schema-diff/src/index.ts",
  },
};
