import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests for pure logic (money helpers, caps) + the offline IndexedDB layer (queue/sync) +
// component tests (.test.tsx) for the money-path screens via React Testing Library.
// jsdom gives `window`; fake-indexeddb (loaded in the setup file) polyfills IndexedDB so the
// offline store runs headless. `@` resolves to src/ like the Next app.
// The React plugin is REQUIRED for the .test.tsx component tests: without it Vitest externalises
// `react` as a bare CJS require, and React 19's conditional `index.js` hides `act` from the ESM
// namespace → React Testing Library falls back to the production `react-dom/test-utils` and dies with
// "React.act is not a function". The plugin makes Vite resolve one properly-interopped React.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
