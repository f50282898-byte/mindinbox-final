import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#0B0B0B",
        gold: { DEFAULT: "#D4AF37", light: "#E7D9A1", muted: "#D9D0BA", dark: "#AA8C2C" },
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "sans-serif"],
        serif: ["var(--font-playfair)", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
