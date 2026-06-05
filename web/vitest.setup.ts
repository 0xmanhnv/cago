// Polyfill IndexedDB for the offline-store tests (jsdom has no IndexedDB).
import "fake-indexeddb/auto";
// jest-dom matchers (toBeInTheDocument, toHaveTextContent, …) for the component tests.
import "@testing-library/jest-dom/vitest";
