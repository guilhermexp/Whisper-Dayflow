import React, { useCallback, useEffect, useRef, memo } from "react"
import { Virtuoso } from "react-virtuoso"
import OverlayScrollbar from "../../../components/ui/overlay-scrollbar"
import styles from "./Scrollbar/Scrollbar.module.scss"
import Intro from "./Intro"
import Message from "./Message"

const VirtualList = memo(({ data, isStreaming = false }) => {
  const virtualListRef = useRef()

  // Keep a key that changes when the last message content changes (including streaming tokens)
  const lastMessageKey = data.length
    ? `${data.length}-${data[data.length - 1]?.content ?? ""}`
    : ""

  // Scroll only when message count changes
  useEffect(() => {
    if (data.length === 0) return

    virtualListRef?.current?.scrollToIndex({
      index: data.length - 1,
      align: "end",
      behavior: "auto",
    })
  }, [data.length])

  // Also scroll when the latest message content updates (streaming), to keep view pinned
  useEffect(() => {
    if (!data.length) return

    virtualListRef?.current?.scrollToIndex({
      index: data.length - 1,
      align: "end",
      behavior: "smooth",
    })
  }, [lastMessageKey])

  const scrollToBottom = useCallback((align = "end") => {
    virtualListRef?.current?.scrollToIndex({
      index: 999,
      align,
      behavior: "auto",
    })
  }, [])

  const renderItem = useCallback(
    (index, message) => (
      <Message
        index={index}
        message={message}
        scrollToBottom={scrollToBottom}
      />
    ),
    [scrollToBottom],
  )

  const getKey = useCallback((index) => `${index}-item`, [])

  return (
    <Virtuoso
      ref={virtualListRef}
      data={data}
      itemContent={renderItem}
      computeItemKey={getKey}
      overscan={500}
      initialTopMostItemIndex={data.length - 1}
      // Keep list pinned to the bottom as new content arrives
      followOutput={"smooth"}
      style={{ height: "100%" }}
      components={{
        Header: Intro,
        Footer: () => (
          <div
            style={{
              paddingTop: "140px",
            }}
          ></div>
        ),
        Scroller: React.forwardRef((props, ref) => (
          <OverlayScrollbar ref={ref} {...props} className={styles.scrollbar} />
        )),
      }}
    />
  )
})

export default VirtualList
