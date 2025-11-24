import styles from "./Message.module.scss"
import { useState, useEffect, useCallback, memo } from "react"
import { AIIcon, PersonIcon } from "renderer/icons"
import Markdown from "react-markdown"

const Message = ({ index, message, scrollToBottom }) => {
  const isUser = message.role === "user"
  const [streamedResponse, setStreamedResponse] = useState("")

  return (
    <div style={{ minHeight: 72 }}>
      {isUser ? (
        <div className={`${styles.message} ${styles.user}`}>
          <div className={styles.wrap}>
            <div className={styles.ball}>
              <PersonIcon className={styles.avatar} />
            </div>
            <div className={styles.text}>{message.content}</div>
          </div>
        </div>
      ) : (
        <div className={`${styles.message} ${styles.ai}`}>
          <div className={styles.wrap}>
            <div className={styles.ball}>
              <AIIcon className={styles.avatar} />
            </div>
            <div className={styles.text}>
              {message.content === "@@PENDING@@" || message.content === ""
                ? "..."
                : message.content}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Message
