export default [
  {
    files: ["**/*.{js,cjs,mjs}"],
    ignores: [
      "node_modules/**",
      "out/**",
      "dist/**",
      "resources/**",
      "whispo-rs/**",
      "**/*.ts",
      "**/*.tsx",
      "**/*.d.ts",
    ],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
    },
    rules: {},
  },
]