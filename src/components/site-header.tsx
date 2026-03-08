import {
  CHAMPIONS_ROUTE,
  HOME_ROUTE,
  LEADERBOARDS_ROUTE,
  isChampionRoute,
  routeFromHash,
  routeToHash,
} from "@/lib/hash-routing"
import { cn } from "@/lib/utils"

export function SiteHeader() {
  const route = routeFromHash(window.location.hash)

  return (
    <header className="rift-topbar-shell">
      <div className="rift-topbar">
        <a href={routeToHash(HOME_ROUTE)} className="rift-wordmark rift-wordmark--sm">
          <span className="rift-wordmark-ranked">ranked</span>
          <span className="rift-wordmark-wr">wr</span>
        </a>

        <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-6">
          <a
            href={routeToHash(CHAMPIONS_ROUTE)}
            className={cn(
              "rift-topbar-link",
              (route === CHAMPIONS_ROUTE || isChampionRoute(route)) &&
                "rift-topbar-link--action"
            )}
            aria-current={route === CHAMPIONS_ROUTE || isChampionRoute(route) ? "page" : undefined}
          >
            Champions
          </a>
          <a
            href={routeToHash(LEADERBOARDS_ROUTE)}
            className={cn(
              "rift-topbar-link",
              route === LEADERBOARDS_ROUTE && "rift-topbar-link--action"
            )}
            aria-current={route === LEADERBOARDS_ROUTE ? "page" : undefined}
          >
            Leaderboard
          </a>
        </nav>
      </div>
    </header>
  )
}
