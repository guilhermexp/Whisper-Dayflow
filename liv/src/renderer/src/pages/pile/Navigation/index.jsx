import { Link, useLocation } from "react-router-dom"
import { useMemo } from "react"
import {
  HomeIcon,
  ChatIcon,
  SearchIcon,
  EyeIcon,
  CardIcon,
  DiscIcon,
  SettingsIcon,
  KanbanIcon,
  PersonIcon,
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
        <div className={layoutStyles.navGroup}>
          <Link
            to={homePath}
            className={`${layoutStyles.iconHolder} ${isActive(homePath) ? layoutStyles.active : ""}`}
            aria-label="Home"
          >
            <HomeIcon />
          </Link>
        </div>

        <div className={layoutStyles.divider} />

        <div className={layoutStyles.navGroup}>
          <Link
            to="/chat"
            className={`${layoutStyles.iconHolder} ${isActive("/chat") ? layoutStyles.active : ""}`}
            aria-label="Chat"
          >
            <ChatIcon />
          </Link>
          <Link
            to="/search"
            className={`${layoutStyles.iconHolder} ${isActive("/search") ? layoutStyles.active : ""}`}
            aria-label="Busca"
          >
            <SearchIcon />
          </Link>
          <Link
            to="/auto-journal"
            className={`${layoutStyles.iconHolder} ${isActive("/auto-journal") ? layoutStyles.active : ""}`}
            aria-label="Auto Journal"
          >
            <EyeIcon />
          </Link>
          <Link
            to="/kanban"
            className={`${layoutStyles.iconHolder} ${isActive("/kanban") ? layoutStyles.active : ""}`}
            aria-label="Kanban"
          >
            <KanbanIcon />
          </Link>
          <Link
            to="/dashboard"
            className={`${layoutStyles.iconHolder} ${isActive("/dashboard") ? layoutStyles.active : ""}`}
            aria-label="Dashboard"
          >
            <CardIcon />
          </Link>
          <Link
            to="/video-recordings"
            className={`${layoutStyles.iconHolder} ${isActive("/video-recordings") ? layoutStyles.active : ""}`}
            aria-label="Gravações de vídeo"
          >
            <DiscIcon />
          </Link>
        </div>

        <div className={layoutStyles.divider} />

        <div className={layoutStyles.navGroup}>
          <Link
            to="/profile"
            className={`${layoutStyles.iconHolder} ${isActive("/profile") ? layoutStyles.active : ""}`}
            aria-label="Perfil"
          >
            <PersonIcon />
          </Link>
          <Link
            to="/settings"
            className={`${layoutStyles.iconHolder} ${isActive("/settings") ? layoutStyles.active : ""}`}
            aria-label="Configurações"
          >
            <SettingsIcon />
          </Link>
        </div>
      </div>
    </div>
  )
}
