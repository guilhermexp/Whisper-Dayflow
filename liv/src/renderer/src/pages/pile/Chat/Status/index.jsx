import styles from "./Status.module.scss"
import { InfoIcon, ChatIcon } from "renderer/icons"
import { useEffect, useState } from "react"
import useIPCListener from "renderer/hooks/useIPCListener"
import Waiting from "../../Toasts/Toast/Loaders/Waiting"

export default function Status() {
  const statusFromMain = useIPCListener("vector-index", "")
  const [status, setStatus] = useState("")
  const [message, setMessage] = useState({
    type: "loading",
    message: "Loading index...",
  })

  useEffect(() => {
    if (statusFromMain) {
      setStatus(statusFromMain.type)
      setMessage(statusFromMain)

      const timer = setTimeout(() => {
        setStatus("")
      }, 3000)

      return () => {
        clearTimeout(timer)
      }
    }
  }, [statusFromMain])

  const renderIcon = (status) => {
    switch (status) {
      case "loading":
        return <Waiting className={styles.waiting} />
      case "querying":
        return <Waiting className={styles.waiting} />
      case "indexing":
        return <Waiting className={styles.waiting} />
      case "done":
        return <InfoIcon className={styles.reflectIcon} />
      default:
        return <ChatIcon className={styles.reflectIcon} />
    }
  }

  return (
    <div className={styles.container}>
      {renderIcon(status)}
      <div className={styles.text}>
        {status ? message.message : "Chat with this journal"}
      </div>
    </div>
  )
}
