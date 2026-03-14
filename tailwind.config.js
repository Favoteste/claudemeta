/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        meta: {
          blue: '#1877F2',
          dark: '#0A0A0A',
          card: '#1A1A2E',
          border: '#2A2A4A',
        }
      }
    },
  },
  plugins: [],
};
