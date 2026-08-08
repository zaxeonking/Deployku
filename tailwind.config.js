/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14171F",
        "ink-soft": "#1B1F29",
        paper: "#F2E8D0",
        "paper-line": "#C9B991",
        "ink-text": "#20242C",
        stamp: {
          red: "#B33B2E",
          green: "#3F6B4A",
          amber: "#B9812B",
        },
        cream: "#EDE6D6",
        muted: "#8A93A6",
      },
      fontFamily: {
        display: ["'Archivo Black'", "sans-serif"],
        body: ["'Space Grotesk'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
