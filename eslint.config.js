export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "**/*.tsbuildinfo"]
  },
  {
    files: ["**/*.js", "**/*.ts"],
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-console": "off"
    }
  }
];
