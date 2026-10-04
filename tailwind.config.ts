import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        /*
         * Bound to the theme-aware RGB triplets in globals.css, not to raw hex.
         *
         * Two reasons:
         *  1. `var(--token)` holding a full colour cannot take Tailwind's
         *     `/opacity` modifier. Triplets can: `bg-gold/20` resolves to
         *     `rgb(var(--gold) / 0.2)`. Roughly 55 call sites rely on that.
         *  2. The light theme re-points the triplets, so every existing
         *     `text-gold-muted`, `border-gold/20`, `bg-gold/5` … becomes
         *     readable on parchment with no per-component rewrite.
         *
         * `brand.*` is the literal palette, for rules and decoration where the
         * intent is "the gold" rather than "readable text".
         */
        volcanic: "rgb(var(--volcanic) / <alpha-value>)",
        obsidian: "rgb(var(--obsidian) / <alpha-value>)",
        gold: {
          DEFAULT: "rgb(var(--gold) / <alpha-value>)",
          light: "rgb(var(--gold-light) / <alpha-value>)",
          muted: "rgb(var(--gold-muted) / <alpha-value>)",
          dark: "rgb(var(--gold-dark) / <alpha-value>)",
        },
        brand: {
          gold: "#d4af37",
          light: "#e7d9a1",
          muted: "#d9d0ba",
          dark: "#aa8c2c",
          volcanic: "#050505",
        },
        ink: {
          1: "var(--text-1)",
          2: "var(--text-2)",
          3: "var(--text-3)",
          onaccent: "var(--text-on-accent-solid)",
        },
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          solid: "var(--surface-solid)",
        },
      },
      fontFamily: {
        sans: ["Cairo", "system-ui", "sans-serif"],
        serif: ["Playfair Display", "Georgia", "serif"],
        naskh: ["Amiri", "Cairo", "serif"],
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