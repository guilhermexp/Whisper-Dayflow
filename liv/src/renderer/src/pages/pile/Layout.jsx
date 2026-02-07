import { useParams } from "react-router-dom"
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
  const { index, refreshIndex } = useIndexContext()
  const { visibleIndex, closestDate } = useTimelineContext()
  const { currentTheme } = usePilesContext()

  const [now, setNow] = useState(DateTime.now().toFormat("cccc, LLL dd, yyyy"))

  useEffect(() => {
    try {
      if (visibleIndex < 5) {
        setNow(DateTime.now().toFormat("cccc, LLL dd, yyyy"))
      } else {
        setNow(DateTime.fromISO(closestDate).toFormat("cccc, LLL dd, yyyy"))
      }
    } catch (error) {
      console.log("Failed to render header date")
    }
  }, [visibleIndex, closestDate])

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
                <span>{index.size}</span> entries
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
