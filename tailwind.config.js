/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "system-ui"],
        body: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui"],
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
        soft: "0 20px 60px rgba(37, 32, 28, 0.10)",
        lift: "0 12px 30px rgba(37, 32, 28, 0.14)",
      },
    },
  },
  plugins: [],
};
