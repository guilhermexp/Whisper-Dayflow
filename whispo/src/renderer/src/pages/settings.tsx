import { Outlet } from "react-router-dom"

export function Component() {
  return (
    <div className="h-full overflow-auto px-6 py-4 text-white">
      <Outlet />
    </div>
  )
}
