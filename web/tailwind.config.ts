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
      },
      // Large, finger-friendly defaults for rural/elderly users (docs/16).
      minHeight: { touch: "56px" },
      fontSize: { tap: ["18px", "1.4"] },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
