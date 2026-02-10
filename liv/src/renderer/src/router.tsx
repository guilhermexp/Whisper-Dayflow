import { createBrowserRouter } from "react-router-dom"

// Null fallback to prevent flash during lazy loading
const HydrateFallback = () => null

export const router: ReturnType<typeof createBrowserRouter> =
  createBrowserRouter([
    // Pile - Journaling App (Main Home)
    {
      path: "/",
      lazy: () => import("./components/pile-layout"),
      HydrateFallback,
      children: [
        {
          index: true,
          lazy: () => import("./pages/pile-redirect"),
          HydrateFallback,
        },
        {
          path: "pile/:pileName",
          lazy: () => import("./pages/pile"),
          HydrateFallback,
        },
        {
          path: "create-pile",
          lazy: () => import("./pages/create-pile"),
          HydrateFallback,
        },
        {
          path: "onboarding",
          lazy: () => import("./pages/onboarding"),
          HydrateFallback,
        },
        {
          path: "timeline",
          lazy: () => import("./pages/pile/Timeline"),
          HydrateFallback,
        },
        {
          path: "auto-journal",
          lazy: () => import("./pages/pile/AutoJournal"),
          HydrateFallback,
        },
        {
          path: "vision",
          lazy: () => import("./pages/pile/AutoJournal"),
          HydrateFallback,
        },
        {
          path: "dashboard",
          lazy: () => import("./pages/pile/Dashboard"),
          HydrateFallback,
        },
        {
          path: "settings",
          lazy: () => import("./pages/pile/Settings"),
          HydrateFallback,
        },
        {
          path: "chat",
          lazy: () => import("./pages/pile/Chat"),
          HydrateFallback,
        },
        {
          path: "search",
          lazy: () => import("./pages/pile/Search"),
          HydrateFallback,
        },
        {
          path: "kanban",
          lazy: () => import("./pages/pile/Kanban"),
          HydrateFallback,
        },
        {
          path: "profile",
          lazy: () => import("./pages/pile/Profile"),
          HydrateFallback,
        },
      ],
    },

    // Special Windows
    {
      path: "/setup",
      lazy: () => import("./pages/setup"),
      HydrateFallback,
    },
    {
      path: "/panel",
      lazy: () => import("./pages/panel"),
      HydrateFallback,
    },
    {
      path: "/timer-float",
      lazy: () => import("./pages/timer-float"),
      HydrateFallback,
    },
  ])
