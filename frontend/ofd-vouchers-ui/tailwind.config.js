// tailwind v4
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(0,0,0,.18)",
        glow: "0 0 0 1px rgba(255,255,255,.15), 0 12px 35px -10px rgba(0,0,0,.35)",
      },
    },
  },
  plugins: [],
};
