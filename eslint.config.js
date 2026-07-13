export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.ts",
      "**/*.tsbuildinfo",
      "benchmarks/direct-v0/runs/**",
      "benchmarks/direct-v0/workspaces/**"
    ]
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-console": "off"
    }
  }
];
