export default [
  {
    // Global ignores (flat config replacement for .eslintignore)
    ignores: [
      "node_modules/**",
      "out/**",
      "dist/**",
      "resources/**",
      "whispo-rs/**",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    ignores: ["**/*.ts", "**/*.tsx", "**/*.d.ts"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
    },
    rules: {},
  },
]