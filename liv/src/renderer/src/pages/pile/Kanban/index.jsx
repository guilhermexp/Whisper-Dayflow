import styles from "./Kanban.module.scss"
import layoutStyles from "../PileLayout.module.scss"
import { CrossIcon, PlusIcon } from "renderer/icons"
import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { usePilesContext } from "renderer/context/PilesContext"
import Navigation from "../Navigation"

// Initial demo data - will be replaced with backend later
const initialColumns = [
  {
    id: "ideas",
    title: "Ideas",
    icon: "lightbulb",
    color: "#fbbf24",
    cards: [
      {
        id: "1",
        title: "Why Brand Storytelling is Essential in Today's Digital Age",
        bullets: [
          "It allows brands to differentiate themselves in a crowded digital marketplace and foster customer loyalty.",
        ],
        description:
          "In the digital age, consumers are bombarded with information, making it harder for brands to stand out.",
        tag: { label: "Storytelling", icon: "lightbulb" },
      },
      {
        id: "2",
        title: "Demystifying SEO: Tips for Ranking Higher in 2024",
        bullets: [
          "Effective SEO strategies can significantly improve a website's visibility and ranking on search engine results pages.",
        ],
        description:
          "Understanding user intent, optimizing for mobile, and focusing on local SEO are some of the key strategies for ranking higher.",
        tag: { label: "SEO", icon: "lightbulb" },
      },
      {
        id: "3",
        title: "The Future of Marketing: Top Trends to Watch in 2024",
        bullets: ["Continued rise of AI, VR, and personalized marketing."],
        description: null,
        tag: null,
      },
    ],
  },
  {
    id: "research",
    title: "Research",
    icon: "circle",
    color: "#a855f7",
    cards: [
      {
        id: "4",
        title:
          "Harnessing the Power of Data: How to Create Data-Driven Marketing Campaigns",
        bullets: [
          "Data-driven marketing campaigns are becoming essential for businesses seeking to understand and engage their target audience effectively.",
          "Harnessing the power of data allows marketers to create personalized, targeted campaigns that yield higher returns.",
        ],
        description:
          "Prevent CO2 from entering atmosphere CCS has the potential to significantly reduce the environmental impact of industries while allowing them to continue producing essential goods and services.",
        tag: { label: "Data", icon: "circle" },
        highlighted: true,
      },
      {
        id: "5",
        title:
          "From Browsers to Buyers: Optimizing Your Website for Conversion",
        bullets: [
          "Optimizing your website for conversion is crucial in turning casual browsers into committed buyers.",
          "Effective website optimization strategies can significantly increase conversion rates and boost your business's bottom line.",
        ],
        description:
          "Website optimization involves improving various elements of your website, such as its design, usability, and content, to make it more appealing and user-friendly.",
        tag: { label: "Conversion", icon: "circle" },
      },
    ],
  },
  {
    id: "outline",
    title: "Outline",
    icon: "target",
    color: "#f97316",
    cards: [],
  },
]

function KanbanCard({ card, columnColor }) {
  return (
    <div
      className={`${styles.card} ${card.highlighted ? styles.highlighted : ""}`}
    >
      <h3 className={styles.cardTitle}>{card.title}</h3>
      {card.bullets && card.bullets.length > 0 && (
        <ul className={styles.cardBullets}>
          {card.bullets.map((bullet, idx) => (
            <li key={idx}>{bullet}</li>
          ))}
        </ul>
      )}
      {card.description && (
        <p className={styles.cardDescription}>{card.description}</p>
      )}
      {card.tag && (
        <div className={styles.cardFooter}>
          <div className={styles.tag} style={{ "--tag-color": columnColor }}>
            <span
              className={styles.tagIcon}
              style={{ borderColor: columnColor }}
            />
            <span className={styles.tagLabel}>{card.tag.label}</span>
          </div>
          {card.highlighted && (
            <span className={styles.dragHandle}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2v20M2 12h20" />
              </svg>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function KanbanColumn({ column }) {
  const getColumnIcon = (icon, color) => {
    switch (icon) {
      case "lightbulb":
        return (
          <svg
            className={styles.columnIconSvg}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2"
          >
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.9V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.1A7 7 0 0 1 12 2z" />
          </svg>
        )
      case "circle":
        return (
          <span
            className={styles.columnIconCircle}
            style={{ borderColor: color }}
          />
        )
      case "target":
        return (
          <svg
            className={styles.columnIconSvg}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>
        <div className={styles.columnTitleArea}>
          {getColumnIcon(column.icon, column.color)}
          <h2 className={styles.columnTitle}>{column.title}</h2>
          <span className={styles.columnCount}>{column.cards.length}</span>
        </div>
        <div className={styles.columnActions}>
          <button className={styles.columnAction}>
            <PlusIcon style={{ width: 18, height: 18 }} />
          </button>
          <button className={styles.columnAction}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        </div>
      </div>
      <div className={styles.cardList}>
        {column.cards.map((card) => (
          <KanbanCard key={card.id} card={card} columnColor={column.color} />
        ))}
      </div>
    </div>
  )
}

function Kanban() {
  const { t } = useTranslation()
  const [columns, setColumns] = useState(initialColumns)
  const { currentTheme } = usePilesContext()
  const navigate = useNavigate()

  const themeStyles = useMemo(
    () => (currentTheme ? `${currentTheme}Theme` : ""),
    [currentTheme]
  )

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
        <div className={styles.header}>
          <div className={styles.wrapper}>
            <h1 className={styles.DialogTitle}>
              <span>Tarefas</span>
            </h1>
            <div className={styles.headerActions}>
              <button className={styles.headerBtn}>Share</button>
              <button className={styles.headerBtnIcon}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
                <span>Brand Voice</span>
              </button>
              <div className={styles.viewToggle}>
                <button className={styles.viewBtn}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
                <button className={`${styles.viewBtn} ${styles.active}`}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                </button>
                <button className={styles.viewBtn}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </button>
              </div>
              <button className={styles.headerBtnIcon}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
                </svg>
              </button>
              <div className={styles.headerDivider} />
              <button className={styles.headerBtnIcon}>
                <PlusIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <button className={styles.close} aria-label="Close" onClick={handleClose}>
              <CrossIcon style={{ height: 14, width: 14 }} />
            </button>
          </div>
        </div>

        <div className={styles.mainContent}>
          <div className={styles.board}>
            {columns.map((column) => (
              <KanbanColumn key={column.id} column={column} />
            ))}
          </div>
        </div>

        {/* Floating search button */}
        <button className={styles.floatingSearch}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Development Overlay */}
        <div className={styles.devOverlay}>
          <div className={styles.devPopup}>
            <svg
              className={styles.devIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <h2 className={styles.devTitle}>Em Desenvolvimento</h2>
            <p className={styles.devDescription}>
              Esta funcionalidade está sendo construída e estará disponível em breve.
            </p>
          </div>
        </div>
      </div>
      <Navigation />
    </div>
  )
}

export default Kanban
export const Component = Kanban
