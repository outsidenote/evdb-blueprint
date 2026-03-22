import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import evdbPlugin from "@eventualize/eslint-plugin";

export default tseslint.config(
  {
    ignores: [
      "node_modules/",
      "**/dist/",
      "**/*.d.ts",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@eventualize": evdbPlugin,
    },
    rules: {
      "@eventualize/enforce-stream-factory-module": "error",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
);
