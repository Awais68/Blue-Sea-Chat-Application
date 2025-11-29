/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          silver: "#C0C0C0",
          blue: "#4A90E2",
          purple: "#9B59B6",
        },
        dark: {
          bg: "#1a1a2e",
          card: "#16213e",
          hover: "#0f3460",
        },
      },
    },
  },
  plugins: [],
};
