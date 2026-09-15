import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#FF0000",
          cream: "#FFF7D1",
          ink: "#000000",
          black: "#000000",
          paper: "#FFFFFF",
        },
      },
      fontFamily: {
        display: ["var(--font-bangers)", "cursive"],
        comic: ["var(--font-comic)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        comic: "6px 6px 0 0 #000000",
        "comic-sm": "3px 3px 0 0 #000000",
        "comic-red": "6px 6px 0 0 #FF0000",
        "comic-red-sm": "3px 3px 0 0 #FF0000",
      },
    },
  },
  plugins: [],
};

export default config;
