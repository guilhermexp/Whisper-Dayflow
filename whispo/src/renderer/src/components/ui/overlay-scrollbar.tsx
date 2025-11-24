import React from "react"

type Props = React.HTMLAttributes<HTMLDivElement>

const OverlayScrollbar = React.forwardRef<HTMLDivElement, Props>(
  ({ style, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        {...props}
        className={className}
        style={{ ...style, overflow: "overlay", overflowX: "hidden" }}
      />
    )
  },
)

export default OverlayScrollbar