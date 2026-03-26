import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                primary: {
  DEFAULT: '#7d041a',
  50: '#fdf2f4',
  100: '#fce7ea',
  200: '#f9d0d8',
  300: '#f3a8b7',
  400: '#ea748d',
  500: '#dc4a6f',
  600: '#c92a52',
  700: '#a8183b',
  800: '#7d041a',
  900: '#5f0416',
}
            },
            fontFamily: {
                sans: ["var(--font-public-sans)", "sans-serif"],
                body: ["var(--font-source-sans)", "sans-serif"],
            },
        },
    },
    plugins: [],
};
export default config;
