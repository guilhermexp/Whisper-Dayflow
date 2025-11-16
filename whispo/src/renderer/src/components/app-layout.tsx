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
      separator: false,
      end: true,
    },
    {
      text: "History",
      href: "/",
      icon: "i-mingcute-history-anticlockwise-line",
      separator: true,
      end: true,
    },
    {
      text: "General",
      href: "/settings",
      icon: "i-mingcute-equalizer-2-line",
      separator: false,
      end: true,
    },
    {
      text: "Models",
      href: "/settings/models",
      icon: "i-mingcute-cpu-line",
      separator: false,
      end: true,
    },
    {
      text: "Data",
      href: "/settings/data",
      icon: "i-mingcute-database-2-line",
      separator: false,
      end: true,
    },
    {
      text: "Enhancement",
      href: "/settings/enhancement",
      icon: "i-mingcute-sparkles-line",
      separator: false,
      end: true,
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
          {navLinks.map((link, _index) => (
            <div key={link.text}>
              <NavLink
                to={link.href}
                end={link.end}
                role="button"
                draggable={false}
                className={({ isActive }) =>
                  cn(
                    "flex h-9 items-center gap-2.5 rounded-pill px-3 font-medium transition-all duration-200",
                    "hover:scale-[1.02] active:scale-[0.98]",
                    isActive
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )
                }
              >
                <span className={cn(link.icon, "text-base")}></span>
                <span>{link.text}</span>
              </NavLink>
              {link.separator && (
                <div className="my-3 h-px bg-white/10" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="relative flex grow flex-col overflow-hidden">
        <div className="flex grow flex-col overflow-auto px-6 py-4">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
