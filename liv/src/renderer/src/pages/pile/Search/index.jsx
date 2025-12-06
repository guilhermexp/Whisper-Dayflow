import styles from "./Search.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import {
  CrossIcon,
} from "renderer/icons"
import { useEffect, useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { usePilesContext } from "renderer/context/PilesContext"
import { useIndexContext } from "renderer/context/IndexContext"
import Post from "../Posts/Post"
import InputBar from "./InputBar"
import { AnimatePresence, motion } from "framer-motion"
import OptionsBar from "./OptionsBar"
import Navigation from "../Navigation"
const filterResults = (results, options) => {
  const filtered = results.filter((result) => {
    // Filter by highlight
    const highlightCondition = options.onlyHighlighted
      ? result.highlight != null
      : true

    // Filter by attachments
    const mediaCondition = options.hasAttachments
      ? result.attachments.length > 0
      : true

    return highlightCondition && mediaCondition
  })

  // Sort the filtered results based on the sortOrder option
  if (options.sortOrder === "oldest") {
    filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  } else if (options.sortOrder === "mostRecent") {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  return filtered
}

function Search() {
  const { t } = useTranslation()
  const { currentTheme } = usePilesContext()
  const navigate = useNavigate()

  const themeStyles = useMemo(
    () => (currentTheme ? `${currentTheme}Theme` : ""),
    [currentTheme],
  )
  const {
    search,
    vectorSearch,
  } = useIndexContext()
  const [ready, setReady] = useState(false)
  const [text, setText] = useState("")
  const [querying, setQuerying] = useState(false)
  const [response, setResponse] = useState([])
  const [options, setOptions] = useState({
    dateRange: "",
    onlyHighlighted: false,
    notReplies: false,
    hasAttachments: false,
    sortOrder: "relevance",
    semanticSearch: false,
  })

  const onChangeText = (e) => {
    setText(e.target.value)
  }

  const onSubmit = useCallback(() => {
    if (text === "") return
    setQuerying(true)

    if (options.semanticSearch) {
      vectorSearch(text).then((res) => {
        setResponse(res)
        setQuerying(false)
      })

      return
    }

    search(text).then((res) => {
      setResponse(res)
      setQuerying(false)
    })
  }, [options, text])

  useEffect(() => {
    onSubmit()
  }, [options.semanticSearch])

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
      onSubmit()
      event.preventDefault()
      return false
    }
  }

  const containerVariants = {
    show: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0 },
  }

  const filtered = useMemo(() => {
    const filtered = filterResults(response, options)
    return filtered
  }, [response, options])

  const renderResponse = () => {
    return filtered.map((source, index) => {
      const uniqueKey = source.ref
      if (!uniqueKey) return null
      return (
        <motion.div
          variants={itemVariants}
          key={uniqueKey}
          className={styles.post}
        >
          <Post
            key={`post-${uniqueKey}`}
            postPath={uniqueKey}
            searchTerm={text}
          />
        </motion.div>
      )
    })
  }

  const handleClose = () => {
    navigate(-1)
  }

  // Detect platform
  const isMac = window.electron?.isMac
  const osLayoutStyles = isMac ? layoutStyles.macOS : layoutStyles.windows

  return (
    <div className={`${layoutStyles.frame} ${themeStyles} ${osLayoutStyles}`}>
      <div className={layoutStyles.bg}></div>
      <div className={styles.pageContainer}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerWrapper}>
            <h1 className={styles.pageTitle}>
              {t("search.title")}
            </h1>
            <button className={styles.close} aria-label="Close" onClick={handleClose}>
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className={styles.mainContent}>
          <div className={styles.DialogTitle}>
            <InputBar
              setReady={setReady}
              value={text}
              onChange={onChangeText}
              onSubmit={onSubmit}
              querying={querying}
            />
            <OptionsBar
              options={options}
              setOptions={setOptions}
              onSubmit={onSubmit}
            />
          </div>
          {filtered && (
            <div className={styles.meta}>
              {filtered?.length}{" "}
              {filtered?.length !== 1
                ? t("search.threads")
                : t("search.thread")}
              <div className={styles.sep}></div>
              {filtered.reduce(
                (a, i) => a + 1 + i?.replies?.length,
                0,
              )}{" "}
              {t("search.entries")}
              <div className={styles.sep}></div>
              {filtered.filter((post) => post.highlight).length}{" "}
              {t("search.highlighted")}
              <div className={styles.sep}></div>
              {filtered.reduce(
                (a, i) => a + i?.attachments?.length,
                0,
              )}{" "}
              {t("search.attachments")}
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.ul
              initial="hidden"
              animate="show"
              variants={containerVariants}
              className={styles.scroller}
            >
              {renderResponse()}
            </motion.ul>
          </AnimatePresence>
        </div>
      </div>
      <Navigation />
    </div>
  )
}

export default Search
export const Component = Search
