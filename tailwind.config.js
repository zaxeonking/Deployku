/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        base: "#0A0E16",
        surface: "#111624",
        "surface-2": "#171D2E",
        border: "#232B3D",
        blue: {
          500: "#3B82F6",
          400: "#5B9DFF",
          600: "#2563EB",
        },
        muted: "#8B93A7",
        success: "#22C55E",
        error: "#EF4444",
        warning: "#F59E0B",
      },
      fontFamily: {
        sans: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(59,130,246,0.15), 0 8px 40px -8px rgba(59,130,246,0.25)",
      },
    },
  },
  plugins: [],
};
