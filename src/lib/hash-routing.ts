export const HOME_ROUTE = "/" as const
export const LEADERBOARDS_ROUTE = "/leaderboards" as const
export const CHAMPIONS_ROUTE = "/champions" as const
export const CHAMPION_ROUTE_PREFIX = "/champions/" as const

export type ChampionRoute = `${typeof CHAMPION_ROUTE_PREFIX}${string}`
export type AppRoute =
  | typeof HOME_ROUTE
  | typeof LEADERBOARDS_ROUTE
  | typeof CHAMPIONS_ROUTE
  | ChampionRoute

export function championRoute(riotSlug: string): ChampionRoute {
  return `${CHAMPION_ROUTE_PREFIX}${encodeURIComponent(riotSlug)}` as ChampionRoute
}

export function isChampionRoute(route: AppRoute): route is ChampionRoute {
  return route.startsWith(CHAMPION_ROUTE_PREFIX)
}

export function championSlugFromRoute(route: AppRoute) {
  if (!isChampionRoute(route)) {
    return null
  }

  return decodeURIComponent(route.slice(CHAMPION_ROUTE_PREFIX.length))
}

export function routeToHash(route: AppRoute) {
  return `#${route}`
}

export function routeFromHash(hash: string) {
  const normalizedHash = hash.replace(/^#/, "") || "/"
  const normalizedRoute = normalizedHash.startsWith("/")
    ? normalizedHash
    : `/${normalizedHash}`

  if (normalizedRoute === LEADERBOARDS_ROUTE) {
    return LEADERBOARDS_ROUTE
  }

  if (normalizedRoute === CHAMPIONS_ROUTE) {
    return CHAMPIONS_ROUTE
  }

  if (
    normalizedRoute.startsWith(CHAMPION_ROUTE_PREFIX) &&
    normalizedRoute.length > CHAMPION_ROUTE_PREFIX.length
  ) {
    return normalizedRoute as ChampionRoute
  }

  return HOME_ROUTE
}

export function buildRouteUrl(route: AppRoute, params?: URLSearchParams) {
  const nextSearch = params?.toString()
  const search = nextSearch ? `?${nextSearch}` : ""
  return `${window.location.pathname}${search}${routeToHash(route)}`
}

export function replaceRouteSearch(route: AppRoute, params: URLSearchParams) {
  window.history.replaceState(null, "", buildRouteUrl(route, params))
}
