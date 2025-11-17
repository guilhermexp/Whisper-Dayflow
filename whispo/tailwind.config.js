// @ts-check
import animate from "tailwindcss-animate"
import { iconsPlugin, getIconCollections } from "@egoist/tailwindcss-icons"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./src/renderer/**/*.tsx"],
  theme: {
    extend: {
      fontSize: {
        'display': ['48px', { lineHeight: '1.2', fontWeight: '700' }],
        'h1': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'h2': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'h3': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'h4': ['18px', { lineHeight: '1.4', fontWeight: '500' }],
        'body': ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'base': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '8px',
        'lg': '12px',
        'xl': '16px',
        'pill': '9000px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1)',
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
