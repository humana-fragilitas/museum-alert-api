import globals from "globals";
import { defineConfig } from "eslint/config";


export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.browser },
    rules: {
      "max-len": ["error", { "code": 80 }],
      "prefer-template": "error",
      "no-console": "off",
      "no-unused-vars": "error"
    }}
]);
