/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Be Vietnam Pro", "ui-sans-serif", "system-ui"],
        body: ["Be Vietnam Pro", "ui-sans-serif", "system-ui"],
      },
      colors: {
        ink: "#15110f",
        cream: "#ffffff",
        clay: "#c86f42",
        moss: {
          50: "#f4f7ef",
          100: "#e8eedc",
          200: "#d3dfbf",
          300: "#b8c995",
          400: "#96aa70",
          500: "#697a4d",
          600: "#596842",
          700: "#485436",
          800: "#39432e",
          900: "#2f3828",
          DEFAULT: "#697a4d",
        },
        coal: "#25201c",
      },
      boxShadow: {
        soft: "0 12px 32px rgba(37, 32, 28, 0.08)",
        lift: "0 14px 30px rgba(37, 32, 28, 0.14)",
      },
    },
  },
  plugins: [],
};
