import {
  HOME_ROUTE,
  LEADERBOARDS_ROUTE,
  routeToHash,
} from "@/lib/hash-routing"

export function SiteHeader() {
  return (
    <header className="rift-topbar-shell">
      <div className="rift-topbar">
        <a href={routeToHash(HOME_ROUTE)} className="rift-wordmark rift-wordmark--sm">
          <span className="rift-wordmark-ranked">ranked</span>
          <span className="rift-wordmark-wr">wr</span>
        </a>

        <nav aria-label="Primary">
          <a
            href={routeToHash(LEADERBOARDS_ROUTE)}
            className="rift-topbar-link rift-topbar-link--action"
          >
            Leaderboard
          </a>
        </nav>
      </div>
    </header>
  )
}
