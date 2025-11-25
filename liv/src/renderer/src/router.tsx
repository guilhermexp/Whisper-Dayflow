import { createBrowserRouter } from "react-router-dom"

export const router: ReturnType<typeof createBrowserRouter> =
  createBrowserRouter([
    // Pile - Journaling App (Main Home)
    {
      path: "/",
      lazy: () => import("./components/pile-layout"),
      children: [
        {
          path: "",
          lazy: () => import("./pages/pile-redirect"),
        },
        {
          path: "pile/:pileName",
          lazy: () => import("./pages/pile"),
        },
        {
          path: "create-pile",
          lazy: () => import("./pages/create-pile"),
        },
        {
          path: "liv-config",
          Component: () => {
            const LivSettings =
              require("./pages/pile/LivSettings").default
            return <LivSettings />
          },
        },
        {
          path: "timeline",
          lazy: () => import("./pages/pile/Timeline"),
        },
        {
          path: "auto-journal",
          lazy: () => import("./pages/pile/AutoJournal"),
        },
      ],
    },

    // Special Windows
    {
      path: "/setup",
      lazy: () => import("./pages/setup"),
    },
    {
      path: "/panel",
      lazy: () => import("./pages/panel"),
    },
  ])
