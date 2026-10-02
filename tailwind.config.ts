import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        volcanic: "#050505",
        obsidian: "#0B0B0B",
        gold: {
          DEFAULT: "#D4AF37",
          light: "#E7D9A1",
          muted: "#D9D0BA",
          dark: "#AA8C2C",
        },
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        naskh: ["var(--font-amiri)", "var(--font-cairo)", "serif"],
      },
      transitionTimingFunction: {
        silk: "cubic-bezier(0.22, 1, 0.36, 1)",
        gate: "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      transitionDuration: {
        400: "400ms",
        600: "600ms",
      },
      keyframes: {
        "fade-rise": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "gold-sweep": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(220%)" },
        },
        "orbit": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-rise": "fade-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "gold-sweep": "gold-sweep 2.4s ease-in-out infinite",
        orbit: "orbit 26s linear infinite",
      },
      screens: {
        xs: "420px",
      },
    },
  },
  plugins: [],
};

export default config;