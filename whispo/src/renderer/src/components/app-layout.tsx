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
      icon: "i-mingcute-dashboard-2-fill",
      separator: false,
      end: true,
      category: "main",
    },
    {
      text: "History",
      href: "/",
      icon: "i-mingcute-history-anticlockwise-fill",
      separator: true,
      end: true,
      category: "main",
    },
    {
      text: "General",
      href: "/settings",
      icon: "i-mingcute-settings-3-fill",
      separator: false,
      end: true,
      category: "settings",
    },
    {
      text: "Models",
      href: "/settings/models",
      icon: "i-mingcute-cpu-fill",
      separator: false,
      end: true,
      category: "settings",
    },
    {
      text: "Data",
      href: "/settings/data",
      icon: "i-mingcute-database-2-fill",
      separator: false,
      end: true,
      category: "settings",
    },
    {
      text: "Enhancement",
      href: "/settings/enhancement",
      icon: "i-mingcute-sparkles-fill",
      separator: false,
      end: true,
      category: "settings",
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
      {/* Sidebar */}
      <div className="app-drag-region relative w-[260px] shrink-0 flex flex-col text-[13px] font-medium z-50">
        {/* Background - Liquid Glass Effect */}
        <div className="pointer-events-none absolute inset-0 border-r border-white/10 bg-gradient-to-b from-[#1E1E1E]/80 via-[#1E1E1E]/60 to-[#1E1E1E]/80 backdrop-blur-2xl saturate-150 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]" />

        {/* Sidebar Content */}
        <div className="relative flex flex-col h-full pt-12">
          {/* Navigation */}
          <div className="flex-1 px-3 overflow-y-auto">
            <nav className="flex flex-col gap-6">
              {/* Main Category */}
              <div className="space-y-0.5">
                <div className="px-2.5 mb-1 text-[11px] font-semibold text-white/30">
                  Favoritos
                </div>
                {navLinks.filter(l => l.category === "main").map((link) => (
                  <NavLink
                    key={link.href}
                    to={link.href}
                    end={link.end}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex h-[30px] items-center gap-3 rounded-[6px] px-2.5 transition-all duration-150",
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      )
                    }
                  >
                    <span className={cn(
                      link.icon,
                      "text-[15px] opacity-80"
                    )}></span>
                    <span className="tracking-tight">{link.text}</span>
                  </NavLink>
                ))}
              </div>

              {/* Settings Category */}
              <div className="space-y-0.5">
                <div className="px-2.5 mb-1 text-[11px] font-semibold text-white/30">
                  Configurações
                </div>
                {navLinks.filter(l => l.category === "settings").map((link) => (
                  <NavLink
                    key={link.href}
                    to={link.href}
                    end={link.end}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex h-[30px] items-center gap-3 rounded-[6px] px-2.5 transition-all duration-150",
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      )
                    }
                  >
                    <span className={cn(
                      link.icon,
                      "text-[15px] opacity-80"
                    )}></span>
                    <span className="tracking-tight">{link.text}</span>
                  </NavLink>
                ))}
              </div>
            </nav>
          </div>

          {/* Footer (User) */}
          <div className="px-3 py-4 mt-auto">
            <div className="flex items-center gap-3 px-2.5 py-2 rounded-[6px] hover:bg-white/5 transition-colors cursor-pointer group">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 border border-white/5">
                <span className="i-mingcute-user-3-fill text-sm"></span>
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-[12px] font-medium text-white/90 group-hover:text-white">Whispo User</span>
                <span className="truncate text-[10px] text-white/40">Pro Plan</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex grow flex-col overflow-hidden">
        <div className="flex grow flex-col overflow-auto px-3 py-2">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
