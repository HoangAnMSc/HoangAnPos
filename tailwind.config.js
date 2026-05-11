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
        cream: "#f8f0df",
        clay: "#c86f42",
        moss: "#697a4d",
        coal: "#25201c",
      },
      boxShadow: {
        soft: "0 20px 60px rgba(37, 32, 28, 0.12)",
        lift: "0 12px 30px rgba(37, 32, 28, 0.16)",
      },
    },
  },
  plugins: [],
};
