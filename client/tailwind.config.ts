import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        warwick: {
          50: "#faf5fc",
          100: "#f3e8f8",
          200: "#e6d0f0",
          300: "#d2ace4",
          400: "#b57bd0",
          500: "#9452b5",
          600: "#783a96",
          700: "#5b3069",
          800: "#492654",
          900: "#3b1f44",
          950: "#240f2c",
        },
        canvas: "#f7f8fa",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.05), 0 1px 3px 0 rgba(15, 23, 42, 0.03)",
        "card-hover": "0 8px 24px -6px rgba(91, 48, 105, 0.12), 0 2px 6px -2px rgba(15, 23, 42, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
