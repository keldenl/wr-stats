import {
  CHAMPIONS_ROUTE,
  HOME_ROUTE,
  LEADERBOARDS_ROUTE,
  isChampionRoute,
  routeFromPathname,
} from "@/lib/routing"
import { cn } from "@/lib/utils"

export function SiteHeader({
  hideBrand = false,
  transparent = false,
}: {
  hideBrand?: boolean
  transparent?: boolean
}) {
  const route = routeFromPathname(window.location.pathname)

  return (
    <header
      className={cn(
        "rift-topbar-shell",
        transparent && "rift-topbar-shell--transparent"
      )}
    >
      <div className="rift-topbar">
        {hideBrand ? (
          <div aria-hidden="true" className="min-w-0" />
        ) : (
          <a href={HOME_ROUTE} className="rift-wordmark rift-wordmark--sm">
            <span className="rift-wordmark-ranked">ranked</span>
            <span className="rift-wordmark-wr">wr</span>
          </a>
        )}

        <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-6">
          <a
            href={CHAMPIONS_ROUTE}
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
            href={LEADERBOARDS_ROUTE}
            className={cn(
              "rift-topbar-link",
              route === LEADERBOARDS_ROUTE && "rift-topbar-link--action"
            )}
            aria-current={route === LEADERBOARDS_ROUTE ? "page" : undefined}
          >
            Tier List
          </a>
        </nav>
      </div>
    </header>
  )
}
