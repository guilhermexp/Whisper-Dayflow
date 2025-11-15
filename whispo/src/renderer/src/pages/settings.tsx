import { cn } from "@renderer/lib/utils"
import { NavLink, Outlet, useLocation } from "react-router-dom"

export function Component() {
  const navLinks = [
    {
      text: "General",
      href: "/settings",
    },
    {
      text: "Models",
      href: "/settings/models",
    },
    {
      text: "Data",
      href: "/settings/data",
    },
    {
      text: "About",
      href: "/settings/about",
    },
  ]

  const location = useLocation()

  const activeNavLink = navLinks.find((item) => item.href === location.pathname)

  return (
    <div className="flex h-full relative bg-black">
      {/* Sidebar with glass effect */}
      <div className="h-full w-40 shrink-0 p-3 text-sm relative">
        <div className="absolute inset-0 bg-white/5 backdrop-blur-sm border-r border-white/10" />
        <div className="relative grid gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.href
            return (
              <NavLink
                key={link.href}
                to={link.href}
                role="button"
                draggable={false}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-pill px-3 font-medium transition-all duration-150 smooth-transition",
                  isActive
                    ? "bg-white/[0.14] text-white shadow-sm"
                    : "text-white/60 hover:bg-white/[0.08] hover:text-white/90",
                )}
              >
                {link.text}
              </NavLink>
            )
          })}
        </div>
      </div>

      {/* Main content area */}
      <div className="h-full grow overflow-auto px-6 py-4">
        <header className="mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">{activeNavLink?.text}</h2>
        </header>

        <Outlet />
      </div>
    </div>
  )
}
