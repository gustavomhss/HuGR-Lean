export default [{ ignores: ["ignored.js"] }, {
  files: ["**/*.js"],
  languageOptions: { globals: { console: "readonly" } },
  rules: {
    "no-unused-vars": "warn",
    "prefer-const": "warn",
    "no-console": "warn",
    "no-restricted-syntax": ["warn", {
      selector: "CallExpression[callee.name='trace']",
      message: "Avoid trace() here.\nKeep café context intact — second line.",
    }],
    "no-undef": "error",
  },
}];
