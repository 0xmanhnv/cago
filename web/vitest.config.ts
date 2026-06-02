import { defineConfig } from "vitest/config";

// Unit tests for pure logic (money helpers, capability checks). Node environment — no DOM/Next
// runtime needed. Component/offline-IndexedDB tests would need jsdom + fake-indexeddb (future).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
