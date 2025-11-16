import { Outlet } from "react-router-dom"

export function Component() {
  return (
    <div className="flex h-full flex-col gap-6 text-white">
      <Outlet />
    </div>
  )
}
