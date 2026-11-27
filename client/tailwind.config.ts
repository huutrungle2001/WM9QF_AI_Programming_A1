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
        ink: "#17191c",
        paper: "#ffffff",
        mist: "#f2f2f3",
        fog: "#fafafb",
        hairline: "#ececec",
        "slate-muted": "#777b86",
        ash: "#979799",
        smoke: "#a3a6af",
        blush: "#fbe1d1",
        sienna: "#5d2a1a",
        canvas: "#ffffff",
      },
      fontFamily: {
        sans: [
          "var(--font-jakarta)",
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains-mono)",
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
        "steep-subtle":
          "0 0 0 1px rgba(0, 0, 0, 0.05), 0 4px 24px 0 rgba(0, 0, 0, 0.06)",
        "steep-float":
          "0 0 0 1px rgba(4, 23, 43, 0.05), 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
        "attio-card":
          "0 0 0 1px #ececec, 0 1px 2px 0 rgba(23, 25, 28, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
