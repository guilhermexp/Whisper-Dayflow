import { Outlet } from "react-router-dom"

export function Component() {
  return (
    <div className="flex h-full flex-col gap-6 text-white bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent">
      <Outlet />
    </div>
  )
}
