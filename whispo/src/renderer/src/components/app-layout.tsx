import { rendererHandlers } from "@renderer/lib/tipc-client"
import { cn } from "@renderer/lib/utils"
import { useEffect } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"

export const Component = () => {
  const navigate = useNavigate()
  const navLinks = [
    {
      text: "Dashboard",
      href: "/dashboard",
      icon: "i-mingcute-dashboard-2-line",
    },
    {
      text: "History",
      href: "/",
      icon: "i-mingcute-history-anticlockwise-line",
    },
    {
      text: "General",
      href: "/settings",
      icon: "i-mingcute-equalizer-2-line",
    },
    {
      text: "Models",
      href: "/settings/models",
      icon: "i-mingcute-cpu-line",
    },
    {
      text: "Data",
      href: "/settings/data",
      icon: "i-mingcute-database-2-line",
    },
  ]

  useEffect(() => {
    return rendererHandlers.navigate.listen((url) => {
      console.log("navigate", url)
      navigate(url)
    })
  }, [])

  return (
    <div className="flex h-dvh bg-black text-white">
      <div className="app-drag-region relative w-48 shrink-0 p-3 text-sm">
        <div className="pointer-events-none absolute inset-0 border-r border-white/10 bg-white/5 backdrop-blur-sm" />
        <div className="relative mt-6 grid gap-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.text}
              to={link.href}
              role="button"
              draggable={false}
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center gap-2 rounded-pill px-3 font-medium transition-all duration-150",
                  isActive
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                )
              }
            >
              <span className={link.icon}></span>
              <span>{link.text}</span>
            </NavLink>
          ))}
        </div>
      </div>
      <div className="relative flex grow flex-col overflow-hidden">
        <div className="app-drag-region h-8 border-b border-white/10" aria-hidden></div>
        <div className="flex grow flex-col overflow-auto px-6 py-4">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
