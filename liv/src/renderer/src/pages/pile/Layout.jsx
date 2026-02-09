import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import styles from "./PileLayout.module.scss"
import Sidebar from "./Sidebar/Timeline/index"
import { useIndexContext } from "renderer/context/IndexContext"
import { useEffect, useState, useMemo } from "react"
import { DateTime } from "luxon"
import { usePilesContext } from "renderer/context/PilesContext"
import Toasts from "./Toasts"
import { useTimelineContext } from "renderer/context/TimelineContext"
import { motion } from "framer-motion"
import InstallUpdate from "./InstallUpdate"
import Navigation from "./Navigation"
import TimerChip from "renderer/components/TimerChip"

export default function PileLayout({ children }) {
  const { pileName } = useParams()
  const { t, i18n } = useTranslation()
  const { index, refreshIndex } = useIndexContext()
  const { visibleIndex, closestDate } = useTimelineContext()
  const { currentTheme } = usePilesContext()

  const locale = i18n.language === "pt-BR" ? "pt-BR" : "en-US"

  const formatDate = (dt) =>
    dt.setLocale(locale).toFormat("cccc, LLL dd, yyyy")

  const [now, setNow] = useState(formatDate(DateTime.now()))

  useEffect(() => {
    try {
      if (visibleIndex < 5) {
        setNow(formatDate(DateTime.now()))
      } else {
        setNow(formatDate(DateTime.fromISO(closestDate)))
      }
    } catch (error) {
      console.log("Failed to render header date")
    }
  }, [visibleIndex, closestDate, locale])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const themeStyles = useMemo(() => {
    return currentTheme ? currentTheme + "Theme" : ""
  }, [currentTheme])

  const osStyles = useMemo(
    () => (window.electron.isMac ? styles.mac : styles.win),
    [],
  )

  return (
    <div className={`${styles.frame} ${themeStyles} ${osStyles}`}>
      <div className={styles.bg}></div>
      <Toasts />
      <div className={styles.main}>
        <div className={styles.sidebar}>
          <div className={styles.top}>
            <div className={styles.part}>
              <div className={styles.count}>
                <span>{index.size}</span> {t("pile.entries")}
              </div>
            </div>
          </div>
          <Sidebar />
        </div>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              {pileName} <span style={{ padding: "6px" }}>·</span>
              <motion.span
                key={now}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                {now}
              </motion.span>
            </div>
            <div className={styles.headerRight}>
              <TimerChip />
              <InstallUpdate />
            </div>
          </div>
          {children}
        </div>

        <Navigation />
      </div>
      <div id="reflections"></div>
    </div>
  )
}
