module.exports = {
  // Stops the config search here. Without it ESLint keeps walking up past the
  // repository root, and a git worktree created inside the repo — which is
  // where `.claude/worktrees/` puts them — finds this same file twice, once as
  // its own root and once as an ancestor. Both copies declare the `react`
  // plugin and both have a `node_modules` to resolve it from, so ESLint refuses
  // to pick between them and fails on every file, including untouched ones.
  // That took out the `eslint --fix` step of the pre-commit hook entirely.
  root: true,
  env: {
    browser: true,
    es2021: true,
  },
  extends: ["standard-with-typescript", "plugin:react/recommended", "prettier"],
  overrides: [
    {
      files: ["*.tsx"],
      rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
      },
    },
    {
      // Repo tooling: the repository's own scripts and each package's own
      // build/test scripts, `.mjs` included — plain Node tooling, not typed
      // application source, so the type-aware rules have nothing real to
      // work with.
      files: ["scripts/**/*.js", "packages/*/scripts/**/*.{js,mjs}"],
      env: { node: true },
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
      },
    },
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["react"],
  rules: {
    "react/react-in-jsx-scope": "off",
    "import/order": [
      "error",
      {
        groups: [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index",
          "object",
          "type",
        ],
        "newlines-between": "always",
      },
    ],
  },
};
