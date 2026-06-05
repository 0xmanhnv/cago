import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure logic (money helpers, caps) + the offline IndexedDB layer (queue/sync).
// jsdom gives `window`; fake-indexeddb (loaded in the setup file) polyfills IndexedDB so the
// offline store runs headless. `@` resolves to src/ like the Next app.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
