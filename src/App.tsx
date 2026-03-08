import { startTransition, useEffect, useState } from "react"
import { ArrowRight, Twitter } from "lucide-react"

import { ChampionPage } from "@/components/champion-page"
import { ChampionListPage } from "@/components/champion-list-page"
import { ChampionSearchAutocomplete } from "@/components/champion-search-autocomplete"
import { LeaderboardsPage } from "@/components/leaderboards-page"
import {
  type AppRoute,
  CHAMPIONS_ROUTE,
  LEADERBOARDS_ROUTE,
  buildRouteUrl,
  championRoute,
  championSlugFromRoute,
  isChampionRoute,
  routeFromHash,
  routeToHash,
} from "@/lib/hash-routing"
import { MAIN_BACKDROP_URL } from "@/lib/backdrops"
import { findChampionMatch, type ChampionDirectoryEntry } from "@/lib/champion-pages"

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
        <section
          id="home-content"
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-4 pt-10 text-center"
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
                  <a href={routeToHash(LEADERBOARDS_ROUTE)} className="rift-inline-cta">
                    View leaderboards
                    <ArrowRight className="size-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <footer className="rift-home-footer">
            <p>
              All data sourced from Riot&apos;s official{" "}
              <a
                href="https://lolm.qq.com/act/a20220818raider/index.html"
                target="_blank"
                rel="noreferrer"
                className="rift-footer-link"
              >
                Wild Rift CN Dia+ Statistics
              </a>{" "}
              and{" "}
              <a
                href="https://wildrift.leagueoflegends.com/en-us/champions/"
                target="_blank"
                rel="noreferrer"
                className="rift-footer-link"
              >
                champions list
              </a>
              .
            </p>
            <p>
              Built by{" "}
              <a
                href="https://twitter.com/RepotedWR"
                target="_blank"
                rel="noreferrer"
                className="rift-footer-link inline-flex items-center gap-1"
              >
                <Twitter className="size-3.5" />
                RepotedWR
              </a>{" "}
              © 2026
            </p>
          </footer>
        </section>
      </div>
    </main>
  )
}

function App() {
  const [locationState, setLocationState] = useState(() => ({
    hash: window.location.hash,
    search: window.location.search,
  }))

  useEffect(() => {
    function syncLocationState() {
      setLocationState({
        hash: window.location.hash,
        search: window.location.search,
      })
    }

    window.addEventListener("hashchange", syncLocationState)
    window.addEventListener("popstate", syncLocationState)

    return () => {
      window.removeEventListener("hashchange", syncLocationState)
      window.removeEventListener("popstate", syncLocationState)
    }
  }, [])

  const route = routeFromHash(locationState.hash)
  const initialQuery = new URLSearchParams(locationState.search).get("q") ?? ""

  function navigate(route: AppRoute, params?: URLSearchParams) {
    const nextUrl = buildRouteUrl(route, params)
    const nextSearch = params?.toString()

    window.history.pushState(null, "", nextUrl)

    startTransition(() => {
      setLocationState({
        hash: routeToHash(route),
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

  if (route === LEADERBOARDS_ROUTE) {
    return <LeaderboardsPage />
  }

  if (route === CHAMPIONS_ROUTE) {
    return <ChampionListPage />
  }

  if (isChampionRoute(route)) {
    const championSlug = championSlugFromRoute(route)

    if (championSlug) {
      return <ChampionPage slug={championSlug} />
    }
  }

  return (
    <HomePage
      initialQuery={initialQuery}
      onSearch={handleHomeSearch}
      onChampionSelect={handleChampionSelect}
    />
  )
}

export default App
