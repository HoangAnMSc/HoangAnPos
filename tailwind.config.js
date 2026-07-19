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
        ink: "#102018",
        cream: "#f6f9f4",
        clay: "#6f8155",
        moss: {
          50: "#f3f7ef",
          100: "#e4ecd9",
          200: "#cbd9b9",
          300: "#a9bf8e",
          400: "#889f68",
          500: "#6f8155",
          600: "#586845",
          700: "#435036",
          800: "#343f2c",
          900: "#293324",
          DEFAULT: "#6f8155",
        },
        coal: "#102018",
      },
      boxShadow: {
        soft: "0 20px 60px rgba(16, 32, 24, 0.10)",
        lift: "0 12px 30px rgba(16, 32, 24, 0.14)",
      },
    },
  },
  plugins: [],
};
