import styles from "./Message.module.scss"
import { memo, useState } from "react"
import { AIIcon, PersonIcon } from "renderer/icons"
import { PENDING_MESSAGE_MARKER } from "@shared/constants"
import TipTapRenderer from "./TipTapRenderer"

const Message = memo(({ index, message, scrollToBottom }) => {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"
  const isPending = message.content === PENDING_MESSAGE_MARKER || message.content === ""
  const canCopy = !isUser && !isPending && Boolean(message.content?.trim())

  const onCopyMessage = async () => {
    if (!canCopy) return
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error("[Chat] Failed to copy message:", error)
    }
  }

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
              {canCopy && (
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={onCopyMessage}
                  title="Copiar resposta"
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>
              )}
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
