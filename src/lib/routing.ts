export const HOME_ROUTE = "/" as const
export const LEADERBOARDS_ROUTE = "/leaderboards/" as const
export const CHAMPIONS_ROUTE = "/champions/" as const
export const CHAMPION_ROUTE_PREFIX = "/champions/" as const

export type ChampionRoute = `${typeof CHAMPION_ROUTE_PREFIX}${string}/`
export type AppRoute =
  | typeof HOME_ROUTE
  | typeof LEADERBOARDS_ROUTE
  | typeof CHAMPIONS_ROUTE
  | ChampionRoute

function ensureLeadingSlash(pathname: string) {
  return pathname.startsWith("/") ? pathname : `/${pathname}`
}

export function normalizePathname(pathname: string) {
  const strippedPathname = pathname.split(/[?#]/, 1)[0] ?? pathname
  const normalizedPathname = ensureLeadingSlash(strippedPathname).replace(/\/{2,}/g, "/")

  if (normalizedPathname === "/") {
    return HOME_ROUTE
  }

  return normalizedPathname.endsWith("/")
    ? normalizedPathname
    : `${normalizedPathname}/`
}

function championPathSegments(pathname: string) {
  const normalizedPathname = normalizePathname(pathname)
  const segments = normalizedPathname.split("/").filter(Boolean)

  if (segments[0] !== "champions" || segments.length !== 2) {
    return null
  }

  return segments
}

export function championRoute(riotSlug: string): ChampionRoute {
  return `${CHAMPION_ROUTE_PREFIX}${encodeURIComponent(riotSlug)}/` as ChampionRoute
}

export function isChampionRoute(route: AppRoute): route is ChampionRoute {
  return championPathSegments(route) !== null
}

export function championSlugFromRoute(route: AppRoute) {
  const segments = championPathSegments(route)

  if (!segments) {
    return null
  }

  return decodeURIComponent(segments[1] ?? "")
}

export function routeFromPathname(pathname: string) {
  const normalizedPathname = normalizePathname(pathname)

  if (normalizedPathname === LEADERBOARDS_ROUTE) {
    return LEADERBOARDS_ROUTE
  }

  if (normalizedPathname === CHAMPIONS_ROUTE) {
    return CHAMPIONS_ROUTE
  }

  if (championPathSegments(normalizedPathname)) {
    return normalizedPathname as ChampionRoute
  }

  return HOME_ROUTE
}

export function routeFromHash(hash: string) {
  const normalizedHash = hash.replace(/^#/, "") || HOME_ROUTE
  return routeFromPathname(normalizedHash)
}

export function buildRouteUrl(route: AppRoute, params?: URLSearchParams) {
  const nextSearch = params?.toString()
  return nextSearch ? `${route}?${nextSearch}` : route
}

export function replaceRouteSearch(route: AppRoute, params: URLSearchParams) {
  window.history.replaceState(null, "", buildRouteUrl(route, params))
}
