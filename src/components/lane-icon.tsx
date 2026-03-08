import roleIconsUrl from "@/assets/place-icons.png"
import { cn } from "@/lib/utils"
import type { LaneId } from "@/lib/tencent-lolm"

const LANE_ICON_SCALE = {
  compact: 0.72,
  default: 0.8,
} as const

const LANE_ICON_SPRITE_WIDTH = 205
const LANE_ICON_SPRITE_HEIGHT = 28

const LANE_ICON_SPRITES: Record<
  LaneId,
  {
    width: number
    xOffset: number
  }
> = {
  "1": {
    width: 27,
    xOffset: -88,
  },
  "2": {
    width: 26,
    xOffset: 0,
  },
  "3": {
    width: 26,
    xOffset: -133,
  },
  "4": {
    width: 29,
    xOffset: -176,
  },
  "5": {
    width: 29,
    xOffset: -43,
  },
}

export function LaneIcon({
  className,
  label,
  lane,
  size = "default",
}: {
  className?: string
  label: string
  lane: LaneId
  size?: keyof typeof LANE_ICON_SCALE
}) {
  const sprite = LANE_ICON_SPRITES[lane]
  const scale = LANE_ICON_SCALE[size]

  return (
    <span className={cn("inline-flex items-center justify-center", className)} title={label}>
      <span
        aria-hidden="true"
        className="rift-lane-icon"
        style={{
          backgroundImage: `url(${roleIconsUrl})`,
          backgroundPosition: `${sprite.xOffset * scale}px 0`,
          backgroundSize: `${LANE_ICON_SPRITE_WIDTH * scale}px ${
            LANE_ICON_SPRITE_HEIGHT * scale
          }px`,
          height: `${LANE_ICON_SPRITE_HEIGHT * scale}px`,
          width: `${sprite.width * scale}px`,
        }}
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
