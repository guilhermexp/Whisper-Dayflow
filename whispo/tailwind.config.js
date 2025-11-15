// @ts-check
import animate from "tailwindcss-animate"
import { iconsPlugin, getIconCollections } from "@egoist/tailwindcss-icons"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./src/renderer/**/*.tsx"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        pill: "9000px",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        glass: {
          bg: "rgba(0, 0, 0, 0.6)",
          border: "rgba(255, 255, 255, 0.17)",
          hover: "rgba(255, 255, 255, 0.18)",
          active: "rgba(255, 255, 255, 0.25)",
        },
      },
      backdropBlur: {
        glass: "10px",
      },
      animation: {
        'slide-up': 'slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards',
        'slide-down': 'slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'pulse-soft': 'pulseSoft 1.4s infinite ease-in-out both',
      },
      keyframes: {
        slideUp: {
          '0%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
            filter: 'blur(0px)',
          },
          '30%': {
            opacity: '0.7',
            transform: 'translateY(-20%) scale(0.98)',
            filter: 'blur(0.5px)',
          },
          '70%': {
            opacity: '0.3',
            transform: 'translateY(-80%) scale(0.92)',
            filter: 'blur(1.5px)',
          },
          '100%': {
            opacity: '0',
            transform: 'translateY(-150%) scale(0.85)',
            filter: 'blur(2px)',
          },
        },
        slideDown: {
          '0%': {
            opacity: '0',
            transform: 'translateY(-150%) scale(0.85)',
            filter: 'blur(2px)',
          },
          '30%': {
            opacity: '0.5',
            transform: 'translateY(-50%) scale(0.92)',
            filter: 'blur(1px)',
          },
          '65%': {
            opacity: '0.9',
            transform: 'translateY(-5%) scale(0.99)',
            filter: 'blur(0.2px)',
          },
          '85%': {
            opacity: '0.98',
            transform: 'translateY(2%) scale(1.005)',
            filter: 'blur(0px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
            filter: 'blur(0px)',
          },
        },
        pulseSoft: {
          '0%, 80%, 100%': { opacity: '0.2' },
          '40%': { opacity: '1.0' },
        },
      },
    },
  },
  plugins: [
    animate,
    iconsPlugin({
      collections: getIconCollections(["mingcute"]),
    }),
  ],
}
