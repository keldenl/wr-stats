import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react"

import { SiteHeader } from "@/components/site-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { MAIN_BACKDROP_URL } from "@/lib/backdrops"
import {
  applyDocumentSeo,
  type StructuredDataValue,
} from "@/lib/document-seo"
import {
  CHAMPIONS_ROUTE,
  championRoute,
  replaceRouteSearch,
} from "@/lib/routing"
import {
  absoluteSiteUrl,
  championListSeoMetadata,
} from "@/lib/site-metadata"
import {
  loadChampionDirectory,
  type ChampionDirectoryEntry,
} from "@/lib/champion-pages"

function parseFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search)

  return {
    q: params.get("q") ?? "",
  }
}

function initialsFromName(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  return letters || "?"
}

function breadcrumbStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        item: absoluteSiteUrl("/"),
        name: "Home",
        position: 1,
      },
      {
        "@type": "ListItem",
        item: absoluteSiteUrl(CHAMPIONS_ROUTE),
        name: "Champions",
        position: 2,
      },
    ],
  } satisfies StructuredDataValue
}

export function ChampionListPage() {
  const [initialFilters] = useState(parseFiltersFromUrl)
  const [champions, setChampions] = useState<ChampionDirectoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(initialFilters.q)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const applyChampionDirectory = useEffectEvent(
    (nextChampions: ChampionDirectoryEntry[]) => {
      setChampions(
        [...nextChampions].sort((left, right) =>
          left.displayName.localeCompare(right.displayName)
        )
      )
    }
  )

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)

      try {
        const nextChampions = await loadChampionDirectory()

        if (cancelled) {
          return
        }

        applyChampionDirectory(nextChampions)
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load champions."
        )
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    const trimmedQuery = searchQuery.trim()

    if (trimmedQuery) {
      params.set("q", trimmedQuery)
    }

    replaceRouteSearch(CHAMPIONS_ROUTE, params)
  }, [searchQuery])

  const visibleChampions = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return champions
    }

    return champions.filter((champion) =>
      champion.searchText.includes(normalizedQuery)
    )
  }, [champions, deferredSearchQuery])
  const championCountLabel = isLoading
    ? "Loading champions"
    : `${visibleChampions.length}${
        visibleChampions.length === champions.length ? "" : ` / ${champions.length}`
      } champions`

  useEffect(() => {
    const metadata = championListSeoMetadata(
      champions.length,
      champions[0]?.avatarUrl ?? null
    )

    applyDocumentSeo({
      canonicalPath: CHAMPIONS_ROUTE,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      robots: searchQuery.trim() ? "noindex,follow" : "index,follow",
      structuredData: [
        breadcrumbStructuredData(),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          description: metadata.description,
          name: metadata.title,
          url: absoluteSiteUrl(CHAMPIONS_ROUTE),
        } satisfies StructuredDataValue,
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: champions.map((champion, index) => ({
            "@type": "ListItem",
            name: champion.displayName,
            position: index + 1,
            url: absoluteSiteUrl(championRoute(champion.riotSlug)),
          })),
        } satisfies StructuredDataValue,
      ],
      title: metadata.title,
    })
  }, [champions, searchQuery])

  return (
    <main className="rift-champion-page-shell rift-leaderboard-page-shell">
      <a href="#champion-list-results" className="skip-link">
        Skip to champion list
      </a>

      <SiteHeader />

      <section id="champion-list-overview" className="rift-leaderboard-hero">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="rift-leaderboard-hero-video"
          aria-hidden="true"
        >
          <source src={MAIN_BACKDROP_URL} type="video/mp4" />
        </video>

        <div className="rift-leaderboard-hero-overlay" aria-hidden="true" />

        <div className="rift-leaderboard-hero-content rift-champion-list-hero-content">
          <div className="rift-leaderboard-hero-inner">
            <div className="rift-champion-title-block">
              <h1 className="rift-champion-title rift-leaderboard-page-title">
                Champions
              </h1>
            </div>

            <InputGroup className="rift-leaderboard-search rift-champion-list-search h-11">
              <InputGroupInput
                id="champion-list-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Filter champions"
                autoComplete="off"
                spellCheck={false}
                aria-label="Champion filter"
              />
            </InputGroup>
          </div>
        </div>
      </section>

      <section id="champion-list-results" className="rift-leaderboard-results-shell">
        <p className="rift-champion-list-count rift-champion-list-count--grid">
          {championCountLabel}
        </p>
        <div className="rift-leaderboard-results-inner">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load champions</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="rift-loading-state">
              <Spinner className="size-6" />
            </div>
          ) : visibleChampions.length ? (
            <div className="rift-champion-list-grid-shell">
              <div className="rift-champion-list-grid">
                {visibleChampions.map((champion) => (
                  <a
                    key={champion.championId}
                    href={championRoute(champion.riotSlug)}
                    className="rift-champion-list-item"
                  >
                    <Avatar size="xl" className="rift-champion-list-avatar">
                      <AvatarImage src={champion.avatarUrl} alt={champion.displayName} />
                      <AvatarFallback className="bg-muted text-xs">
                        {initialsFromName(champion.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="rift-champion-list-name">
                      {champion.displayName}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <Empty className="rift-champion-list-empty">
              <EmptyHeader>
                <p className="rift-champion-list-count rift-champion-list-count--grid">
                  {championCountLabel}
                </p>
                <EmptyTitle>No champions matched</EmptyTitle>
                <EmptyDescription>
                  Try a different name or clear the filter.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </section>
    </main>
  )
}
