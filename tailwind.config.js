/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./app/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#10B981",
        "background-light": "#f6f8f5",
        "background-dark": "#0E0F0E",
        "surface-dark": "#1a2e1a",
        "card-dark": "#1A3817",
        "box-dark": "#244b20",
        "text-dark": "#11230f",
      },
      fontFamily: {
        sans: ["Barlow_400Regular"],
        display: ["BarlowCondensed_700Bold"],
        heading: ["Barlow_700Bold"],
        medium: ["Barlow_500Medium"],
        semibold: ["Barlow_600SemiBold"],
      },
    },
  },
  plugins: [],
}
