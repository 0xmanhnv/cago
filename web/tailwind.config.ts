import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#16a34a",
          dark: "#14532d",
          light: "#dcfce7",
        },
        // "Fresh agriculture" accents — harvest gold + warm cream, for a friendly, sunny feel.
        harvest: { DEFAULT: "#f59e0b", dark: "#b45309", light: "#fef3c7" },
        cream: "#fffdf5",
      },
      fontFamily: {
        sans: ["var(--font-be-vietnam)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 4px 16px rgba(20, 83, 45, 0.08)",
        card: "0 6px 20px rgba(20, 83, 45, 0.10)",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Bottom payment sheet sliding up into place (instead of appearing instantly).
        "sheet-up": {
          from: { opacity: "0", transform: "translateY(40px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "sheet-down": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(40px)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
      },
      animation: {
        "rise-in": "rise-in 0.45s ease both",
        "sheet-up": "sheet-up 0.26s cubic-bezier(0.16,1,0.3,1) both",
        "sheet-down": "sheet-down 0.2s ease-in both",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-out": "fade-out 0.2s ease-in both",
      },
      // Large, finger-friendly defaults for rural/elderly users (docs/16).
      minHeight: { touch: "56px" },
      fontSize: { tap: ["18px", "1.4"] },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
