import { Link, useLocation } from "react-router-dom"
import { useMemo } from "react"
import {
  HomeIcon,
  ChatIcon,
  SearchIcon,
  NotebookIcon,
  CardIcon,
  SettingsIcon,
  KanbanIcon,
} from "renderer/icons"
import { usePilesContext } from "renderer/context/PilesContext"
import layoutStyles from "../PileLayout.module.scss"

export default function Navigation() {
  const location = useLocation()
  const { currentPile, piles } = usePilesContext()

  const homePath = useMemo(() => {
    if (currentPile?.name) return `/pile/${currentPile.name}`
    if (piles && piles.length > 0) return `/pile/${piles[0].name}`
    return "/create-pile"
  }, [currentPile?.name, piles])

  const isActive = (path) => location.pathname === path

  return (
    <div className={layoutStyles.bottomNav}>
      <div className={layoutStyles.navPill}>
        <Link
          to={homePath}
          className={`${layoutStyles.iconHolder} ${isActive(homePath) ? layoutStyles.active : ""}`}
        >
          <HomeIcon />
        </Link>
        <div className={layoutStyles.divider} />
        <Link
          to="/chat"
          className={`${layoutStyles.iconHolder} ${isActive("/chat") ? layoutStyles.active : ""}`}
        >
          <ChatIcon />
        </Link>
        <Link
          to="/search"
          className={`${layoutStyles.iconHolder} ${isActive("/search") ? layoutStyles.active : ""}`}
        >
          <SearchIcon />
        </Link>
        <div className={layoutStyles.divider} />
        <Link
          to="/auto-journal"
          className={`${layoutStyles.iconHolder} ${isActive("/auto-journal") ? layoutStyles.active : ""}`}
        >
          <NotebookIcon />
        </Link>
        <Link
          to="/kanban"
          className={`${layoutStyles.iconHolder} ${isActive("/kanban") ? layoutStyles.active : ""}`}
        >
          <KanbanIcon />
        </Link>
        <Link
          to="/dashboard"
          className={`${layoutStyles.iconHolder} ${isActive("/dashboard") ? layoutStyles.active : ""}`}
        >
          <CardIcon />
        </Link>
        <div className={layoutStyles.divider} />
        <Link
          to="/settings"
          className={`${layoutStyles.iconHolder} ${isActive("/settings") ? layoutStyles.active : ""}`}
        >
          <SettingsIcon />
        </Link>
      </div>
    </div>
  )
}
