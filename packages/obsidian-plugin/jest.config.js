/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  // The frame view builds real elements and listens for real messages; the pure
  // modules do not care either way, so the whole package runs in a DOM. The one
  // test that spawns a script asks for Node itself, in its own docblock.
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
};
