export const HOME_ROUTE = "/" as const
export const TIER_LIST_ROUTE = "/tier-list/" as const
export const LEADERBOARDS_ROUTE = TIER_LIST_ROUTE
export const LEGACY_LEADERBOARDS_ROUTE = "/leaderboards/" as const
export const CHAMPIONS_ROUTE = "/champions/" as const
export const CHAMPION_ROUTE_PREFIX = "/champion/" as const
export const LEGACY_CHAMPION_ROUTE_PREFIX = "/champions/" as const

export type ChampionRoute = `${typeof CHAMPION_ROUTE_PREFIX}${string}/`
export type AppRoute =
  | typeof HOME_ROUTE
  | typeof LEADERBOARDS_ROUTE
  | typeof CHAMPIONS_ROUTE
  | ChampionRoute

function ensureLeadingSlash(pathname: string) {
  return pathname.startsWith("/") ? pathname : `/${pathname}`
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeChampionSlug(value: string) {
  return decodePathSegment(value).trim().toLowerCase()
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

  if (segments.length !== 2) {
    return null
  }

  const routeSegment = segments[0]?.toLowerCase()

  if (
    routeSegment !== CHAMPION_ROUTE_PREFIX.replaceAll("/", "") &&
    routeSegment !== LEGACY_CHAMPION_ROUTE_PREFIX.replaceAll("/", "")
  ) {
    return null
  }

  const slug = normalizeChampionSlug(segments[1] ?? "")

  if (!slug) {
    return null
  }

  return {
    slug,
  }
}

export function championRoute(riotSlug: string): ChampionRoute {
  return `${CHAMPION_ROUTE_PREFIX}${encodeURIComponent(normalizeChampionSlug(riotSlug))}/` as ChampionRoute
}

export function legacyChampionRoute(riotSlug: string) {
  return `${LEGACY_CHAMPION_ROUTE_PREFIX}${encodeURIComponent(normalizeChampionSlug(riotSlug))}/`
}

export function isChampionRoute(route: AppRoute): route is ChampionRoute {
  return championPathSegments(route) !== null
}

export function championSlugFromRoute(route: AppRoute) {
  const segments = championPathSegments(route)

  if (!segments) {
    return null
  }

  return segments.slug
}

export function canonicalRouteFromPathname(pathname: string): AppRoute | null {
  const normalizedPathname = normalizePathname(pathname)
  const normalizedLowerPathname = normalizedPathname.toLowerCase()

  if (normalizedPathname === HOME_ROUTE) {
    return HOME_ROUTE
  }

  if (
    normalizedLowerPathname === LEADERBOARDS_ROUTE ||
    normalizedLowerPathname === LEGACY_LEADERBOARDS_ROUTE
  ) {
    return LEADERBOARDS_ROUTE
  }

  if (normalizedLowerPathname === CHAMPIONS_ROUTE) {
    return CHAMPIONS_ROUTE
  }

  const championPath = championPathSegments(normalizedPathname)

  if (championPath) {
    return championRoute(championPath.slug)
  }

  return null
}

export function routeFromPathname(pathname: string) {
  return canonicalRouteFromPathname(pathname) ?? HOME_ROUTE
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
