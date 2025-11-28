import styles from "./Message.module.scss"
import { memo } from "react"
import { AIIcon, PersonIcon } from "renderer/icons"
import { PENDING_MESSAGE_MARKER } from "@shared/constants"
import TipTapRenderer from "./TipTapRenderer"

const Message = memo(({ index, message, scrollToBottom }) => {
  const isUser = message.role === "user"
  const isPending = message.content === PENDING_MESSAGE_MARKER || message.content === ""

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
              {isPending ? (
                <span className={styles.pending}>...</span>
              ) : (
                <TipTapRenderer content={message.content} className={styles.tiptapContent} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default Message
