const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none" }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["renderer/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, module: "readonly" },
    },
  },
  {
    // Callbacks passed to page.evaluate run in the browser.
    files: ["e2e/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["preload.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
