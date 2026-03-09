import { startTransition, useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

import { ChampionPage } from "@/components/champion-page"
import { ChampionListPage } from "@/components/champion-list-page"
import { ChampionSearchAutocomplete } from "@/components/champion-search-autocomplete"
import { LeaderboardsPage } from "@/components/leaderboards-page"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import {
  applyDocumentSeo,
  type StructuredDataValue,
} from "@/lib/document-seo"
import {
  type AppRoute,
  CHAMPIONS_ROUTE,
  LEADERBOARDS_ROUTE,
  buildRouteUrl,
  championRoute,
  championSlugFromRoute,
  isChampionRoute,
  routeFromPathname,
} from "@/lib/routing"
import { MAIN_BACKDROP_URL } from "@/lib/backdrops"
import { findChampionMatch, type ChampionDirectoryEntry } from "@/lib/champion-pages"
import {
  absoluteSiteUrl,
  championListSeoMetadata,
  homeSeoMetadata,
  leaderboardsSeoMetadata,
} from "@/lib/site-metadata"

function breadcrumbStructuredData(
  items: Array<{
    name: string
    path: string
  }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      item: absoluteSiteUrl(item.path),
      name: item.name,
      position: index + 1,
    })),
  } satisfies StructuredDataValue
}

function HomePage({
  initialQuery,
  onSearch,
  onChampionSelect,
}: {
  initialQuery: string
  onSearch: (query: string) => Promise<void>
  onChampionSelect: (champion: ChampionDirectoryEntry) => Promise<void>
}) {
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    setSearchQuery(initialQuery)
  }, [initialQuery])

  return (
    <main className="rift-home-page rift-home-video-shell">
      <a href="#home-content" className="skip-link">
        Skip to content
      </a>

      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="rift-home-video"
        aria-hidden="true"
      >
        <source src={MAIN_BACKDROP_URL} type="video/mp4" />
      </video>

      <div className="rift-home-overlay" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideBrand transparent />

        <section
          id="home-content"
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-4 pt-6 text-center"
        >
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full space-y-8">
              <div className="space-y-3">
                <h1 className="rift-wordmark rift-wordmark--hero">
                  <span className="rift-wordmark-ranked">ranked</span>
                  <span className="rift-wordmark-wr">wr</span>
                </h1>
              </div>

              <div className="mx-auto w-full max-w-2xl space-y-3">
                <form
                  className="min-w-0 flex-1"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setIsSearching(true)

                    try {
                      await onSearch(searchQuery)
                    } finally {
                      setIsSearching(false)
                    }
                  }}
                >
                  <ChampionSearchAutocomplete
                    id="champion-search"
                    value={searchQuery}
                    onChampionSelect={async (champion) => {
                      setIsSearching(true)

                      try {
                        await onChampionSelect(champion)
                      } finally {
                        setIsSearching(false)
                      }
                    }}
                    onValueChange={setSearchQuery}
                    ariaLabel="Champion search"
                    isSearching={isSearching}
                  />
                </form>

                <div className="flex justify-end">
                  <a href={LEADERBOARDS_ROUTE} className="rift-inline-cta">
                    View leaderboards
                    <ArrowRight className="size-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <SiteFooter />
        </section>
      </div>
    </main>
  )
}

function App() {
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))

  useEffect(() => {
    function syncLocationState() {
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    }

    window.addEventListener("popstate", syncLocationState)

    return () => {
      window.removeEventListener("popstate", syncLocationState)
    }
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [locationState.pathname, locationState.search])

  const route = routeFromPathname(locationState.pathname)
  const initialQuery = new URLSearchParams(locationState.search).get("q") ?? ""

  function navigate(route: AppRoute, params?: URLSearchParams) {
    const nextUrl = buildRouteUrl(route, params)
    const nextSearch = params?.toString()

    window.history.pushState(null, "", nextUrl)

    startTransition(() => {
      setLocationState({
        pathname: route,
        search: nextSearch ? `?${nextSearch}` : "",
      })
    })
  }

  async function handleHomeSearch(query: string) {
    const nextParams = new URLSearchParams()
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      navigate(LEADERBOARDS_ROUTE)
      return
    }

    const championMatch = await findChampionMatch(trimmedQuery)

    if (championMatch?.riotSlug) {
      navigate(championRoute(championMatch.riotSlug))
      return
    }

    nextParams.set("q", trimmedQuery)
    navigate(LEADERBOARDS_ROUTE, nextParams)
  }

  async function handleChampionSelect(champion: ChampionDirectoryEntry) {
    if (champion.riotSlug) {
      navigate(championRoute(champion.riotSlug))
      return
    }

    await handleHomeSearch(champion.displayName)
  }

  useEffect(() => {
    if (isChampionRoute(route)) {
      return
    }

    if (route === LEADERBOARDS_ROUTE) {
      const metadata = leaderboardsSeoMetadata({
        path: LEADERBOARDS_ROUTE,
      })

      applyDocumentSeo({
        canonicalPath: LEADERBOARDS_ROUTE,
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        robots: locationState.search ? "noindex,follow" : "index,follow",
        structuredData: [
          breadcrumbStructuredData([
            { name: "Home", path: "/" },
            { name: "Leaderboards", path: LEADERBOARDS_ROUTE },
          ]),
        ],
        title: metadata.title,
      })
      return
    }

    if (route === CHAMPIONS_ROUTE) {
      const metadata = championListSeoMetadata(0)

      applyDocumentSeo({
        canonicalPath: CHAMPIONS_ROUTE,
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        robots: locationState.search ? "noindex,follow" : "index,follow",
        structuredData: [
          breadcrumbStructuredData([
            { name: "Home", path: "/" },
            { name: "Champions", path: CHAMPIONS_ROUTE },
          ]),
        ],
        title: metadata.title,
      })
      return
    }

    const metadata = homeSeoMetadata()

    applyDocumentSeo({
      canonicalPath: "/",
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          description: metadata.description,
          name: "rankedwr",
          url: absoluteSiteUrl("/"),
        } satisfies StructuredDataValue,
      ],
      title: metadata.title,
    })
  }, [locationState.search, route])

  let page = (
    <HomePage
      initialQuery={initialQuery}
      onSearch={handleHomeSearch}
      onChampionSelect={handleChampionSelect}
    />
  )
  let showSharedFooter = false

  if (route === LEADERBOARDS_ROUTE) {
    page = <LeaderboardsPage />
    showSharedFooter = true
  } else if (route === CHAMPIONS_ROUTE) {
    page = <ChampionListPage />
    showSharedFooter = true
  } else if (isChampionRoute(route)) {
    const championSlug = championSlugFromRoute(route)

    if (championSlug) {
      page = <ChampionPage slug={championSlug} />
      showSharedFooter = true
    }
  }

  return (
    <>
      {page}
      {showSharedFooter ? <SiteFooter /> : null}
    </>
  )
}

export default App
