import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

export function RankMovementIndicator({
  delta,
  className,
}: {
  delta: number | null
  className?: string
}) {
  if (delta === null || delta === 0) {
    return null
  }

  const direction = delta > 0 ? "up" : "down"
  const Icon = direction === "up" ? ChevronUp : ChevronDown

  return (
    <span
      className={cn("rift-rank-movement", className)}
      data-direction={direction}
      aria-label={
        direction === "up"
          ? `Up ${delta} rank${delta === 1 ? "" : "s"}`
          : `Down ${Math.abs(delta)} rank${Math.abs(delta) === 1 ? "" : "s"}`
      }
    >
      <Icon aria-hidden="true" />
      <span>{delta > 0 ? `+${delta}` : `${delta}`}</span>
    </span>
  )
}
