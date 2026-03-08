import { useEffect, useEffectEvent, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Flame } from "lucide-react"

import { LaneIcon } from "@/components/lane-icon"
import { SiteHeader } from "@/components/site-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LEADERBOARDS_ROUTE, routeToHash } from "@/lib/hash-routing"
import {
  loadChampionPageByChampionId,
  loadChampionPageEntryBySlug,
} from "@/lib/champion-pages"
import type { ChampionPageData } from "@/lib/static-data"
import {
  TIER_LABELS,
  loadChampionHeroStats,
  type ChampionHeroStatsPayload,
  type ChampionRoleStat,
  type ChampionStatsBucket,
  type LaneId,
} from "@/lib/tencent-lolm"

const SKIN_RAIL_SCROLL_AMOUNT = 320
const DEFAULT_BUCKET = "1"

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function strengthTierBadgeVariant(tier: ChampionRoleStat["strengthTier"]) {
  if (tier === "S" || tier === "A") {
    return "default"
  }

  if (tier === "B" || tier === "C") {
    return "secondary"
  }

  return "outline"
}

function pickDefaultBucket(buckets: ChampionStatsBucket[]) {
  if (buckets.some((bucket) => bucket.bucket === DEFAULT_BUCKET)) {
    return DEFAULT_BUCKET
  }

  return buckets[0]?.bucket ?? ""
}

function findBucket(
  payload: ChampionHeroStatsPayload | null,
  bucket: string
) {
  return payload?.buckets.find((entry) => entry.bucket === bucket) ?? null
}

function pickLaneForBucket(
  bucket: ChampionStatsBucket | null,
  currentLane?: LaneId | null
) {
  if (!bucket) {
    return null
  }

  if (currentLane && bucket.roles.some((role) => role.lane === currentLane)) {
    return currentLane
  }

  return bucket.roles[0]?.lane ?? null
}

export function ChampionPage({ slug }: { slug: string }) {
  const [championPage, setChampionPage] = useState<ChampionPageData | null>(null)
  const [heroStats, setHeroStats] = useState<ChampionHeroStatsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAbilityIndex, setSelectedAbilityIndex] = useState(0)
  const [selectedSkinIndex, setSelectedSkinIndex] = useState(0)
  const [selectedBucket, setSelectedBucket] = useState("")
  const [selectedLane, setSelectedLane] = useState<LaneId | null>(null)
  const skinRailRef = useRef<HTMLDivElement | null>(null)

  const applyChampionPage = useEffectEvent((nextChampionPage: ChampionPageData) => {
    setChampionPage(nextChampionPage)
    setSelectedAbilityIndex(0)
    setSelectedSkinIndex(0)
  })

  const applyHeroStats = useEffectEvent((nextHeroStats: ChampionHeroStatsPayload) => {
    const nextBucket = pickDefaultBucket(nextHeroStats.buckets)
    const nextBucketData = findBucket(nextHeroStats, nextBucket)

    setHeroStats(nextHeroStats)
    setStatsError(null)
    setSelectedBucket(nextBucket)
    setSelectedLane(pickLaneForBucket(nextBucketData))
  })

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)
      setStatsError(null)
      setHeroStats(null)
      setSelectedBucket("")
      setSelectedLane(null)

      try {
        const pageEntry = await loadChampionPageEntryBySlug(slug)
        const [pageResult, statsResult] = await Promise.allSettled([
          loadChampionPageByChampionId(pageEntry.championId),
          loadChampionHeroStats(pageEntry.championId),
        ])

        if (cancelled) {
          return
        }

        if (pageResult.status !== "fulfilled") {
          throw pageResult.reason
        }

        applyChampionPage(pageResult.value)

        if (statsResult.status === "fulfilled") {
          applyHeroStats(statsResult.value)
        } else {
          setHeroStats(null)
          setStatsError(
            statsResult.reason instanceof Error
              ? statsResult.reason.message
              : "Failed to load champion stats."
          )
        }
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        setChampionPage(null)
        setHeroStats(null)
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load champion page."
        )
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [slug])

  const selectedStatsBucket = findBucket(heroStats, selectedBucket) ?? heroStats?.buckets[0] ?? null
  const activeRoleStats =
    selectedStatsBucket?.roles.find((role) => role.lane === selectedLane) ??
    selectedStatsBucket?.roles[0] ??
    null
  const activeAbility =
    championPage?.abilities[selectedAbilityIndex] ?? championPage?.abilities[0] ?? null
  const activeSkin =
    championPage?.skins[selectedSkinIndex] ?? championPage?.skins[0] ?? null

  function scrollSkinRail(direction: "previous" | "next") {
    skinRailRef.current?.scrollBy({
      behavior: "smooth",
      left: direction === "next" ? SKIN_RAIL_SCROLL_AMOUNT : -SKIN_RAIL_SCROLL_AMOUNT,
    })
  }

  function handleBucketChange(nextBucket: string) {
    if (!heroStats) {
      return
    }

    const nextBucketData = findBucket(heroStats, nextBucket)

    setSelectedBucket(nextBucket)
    setSelectedLane((currentLane) => pickLaneForBucket(nextBucketData, currentLane))
  }

  return (
    <main className="rift-champion-page-shell">
      <a href="#champion-content" className="skip-link">
        Skip to content
      </a>

      <SiteHeader
        rightLabel="Leaderboards"
        rightHref={routeToHash(LEADERBOARDS_ROUTE)}
      />

      {error ? (
        <section className="mx-auto flex w-full max-w-5xl px-4 py-10 sm:px-6">
          <Alert variant="destructive">
            <AlertTitle>Unable to load champion</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </section>
      ) : isLoading || !championPage ? (
        <section className="rift-loading-state mx-auto mt-8 flex w-[calc(100%-2rem)] max-w-5xl sm:w-[calc(100%-3rem)]">
          <Spinner className="size-6" />
        </section>
      ) : (
        <>
          <section className="rift-champion-hero">
            <video
              key={championPage.mastheadVideoUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="rift-champion-hero-video"
              aria-hidden="true"
            >
              <source src={championPage.mastheadVideoUrl} type="video/mp4" />
            </video>

            <div className="rift-champion-hero-overlay" aria-hidden="true" />

            <div className="rift-champion-hero-content">
              <div className="rift-champion-hero-inner">
                <div className="rift-champion-title-block">
                  <p className="rift-champion-kicker">{championPage.subtitle}</p>
                  <h1 className="rift-champion-title">{championPage.title}</h1>
                </div>

                <div className="rift-champion-hero-stats">
                  {heroStats && selectedStatsBucket && activeRoleStats ? (
                    <>
                      <div className="rift-champion-stat-grid">
                        <div className="rift-champion-stat-item">
                          <p className="rift-champion-stat-label">Tier</p>
                          <Badge
                            variant={strengthTierBadgeVariant(activeRoleStats.strengthTier)}
                            className="rift-champion-stat-tier text-lg px-4 py-3 font-bold"
                            title={activeRoleStats.strengthScore.toFixed(2)}
                          >
                            {activeRoleStats.strengthTier}
                          </Badge>
                        </div>
                        <div className="rift-champion-stat-item">
                          <p className="rift-champion-stat-label">Win</p>
                          <p className="rift-champion-stat-value">
                            {formatPercent(activeRoleStats.winRate)}
                          </p>
                        </div>
                        <div className="rift-champion-stat-item">
                          <p className="rift-champion-stat-label">Pick</p>
                          <p className="rift-champion-stat-value">
                            {formatPercent(activeRoleStats.pickRate)}
                          </p>
                        </div>
                        <div className="rift-champion-stat-item">
                          <p className="rift-champion-stat-label">Ban</p>
                          <p className="rift-champion-stat-value">
                            {formatPercent(activeRoleStats.banRate)}
                          </p>
                        </div>
                      </div>

                      <div className="rift-champion-hero-stats-controls">
                        <ToggleGroup
                          type="single"
                          value={activeRoleStats.lane}
                          onValueChange={(value) => {
                            if (value) {
                              setSelectedLane(value as LaneId)
                            }
                          }}
                          variant="outline"
                          spacing={1}
                          className="rift-champion-role-toggle"
                          aria-label="Champion roles"
                        >
                          {selectedStatsBucket.roles.map((role) => (
                            <ToggleGroupItem
                              key={role.lane}
                              value={role.lane}
                              className="rift-champion-role-toggle-item"
                              aria-label={role.laneLabel}
                              title={`${role.laneLabel} · ${formatPercent(role.pickRate)} pick`}
                            >
                              <LaneIcon
                                lane={role.lane}
                                label={role.laneLabel}
                                size="compact"
                              />
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>

                        <Select
                          value={selectedStatsBucket.bucket}
                          onValueChange={handleBucketChange}
                        >
                          <SelectTrigger
                            size="sm"
                            className="rift-champion-bucket-select"
                            aria-label="Rank bucket"
                          >
                            <SelectValue placeholder={TIER_LABELS[DEFAULT_BUCKET]} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {heroStats.buckets.map((bucket) => (
                                <SelectItem key={bucket.bucket} value={bucket.bucket}>
                                  {bucket.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <div className="rift-champion-hero-stats-fallback">
                      <p className="rift-champion-hero-stats-fallback-copy">
                        {statsError ?? "Stats unavailable for this champion right now."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section id="champion-content" className="rift-champion-abilities-shell">
            <div className="rift-champion-content-column">
              <div className="rift-champion-section-copy rift-champion-section-copy--centered">
                <h2 className="rift-champion-section-title">Abilities</h2>
              </div>

              {activeAbility ? (
                <div className="rift-champion-ability-stage">
                  <div className="rift-champion-media-frame rift-champion-media-frame--wide">
                    <AspectRatio ratio={16 / 9}>
                      <video
                        key={activeAbility.videoUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="rift-champion-ability-video"
                      >
                        <source src={activeAbility.videoUrl} type="video/mp4" />
                      </video>

                      <div className="rift-champion-ability-overlay" aria-hidden="true" />
                      <div className="rift-champion-ability-overlay-copy">
                        <p className="rift-champion-ability-subtitle">
                          {activeAbility.subtitle}
                        </p>
                        <p className="rift-champion-ability-title">
                          {activeAbility.label}
                        </p>
                        <p className="rift-champion-ability-description">
                          {activeAbility.description}
                        </p>
                      </div>
                    </AspectRatio>
                  </div>

                  <div className="rift-champion-ability-list rift-champion-ability-list--centered">
                    {championPage.abilities.map((ability, index) => (
                      <button
                        key={ability.label}
                        type="button"
                        className="rift-champion-ability-button"
                        data-active={selectedAbilityIndex === index}
                        onClick={() => setSelectedAbilityIndex(index)}
                      >
                        <span className="rift-champion-ability-icon-frame">
                          <img
                            src={ability.iconUrl}
                            alt=""
                            className="rift-champion-ability-icon"
                          />
                        </span>
                        <span className="rift-champion-ability-label">
                          {ability.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Alert>
                  <Flame data-icon="inline-start" />
                  <AlertTitle>No ability data</AlertTitle>
                  <AlertDescription>
                    This champion does not have synced ability media yet.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </section>

          <section className="rift-champion-skins-shell">
            <div className="rift-champion-skins-inner">
              <div className="rift-champion-section-copy rift-champion-section-copy--centered">
                <h2 className="rift-champion-section-title rift-champion-section-title--dark">
                  Skins
                </h2>
              </div>

              {activeSkin ? (
                <>
                  <div className="rift-champion-skin-stage">
                    <img
                      src={activeSkin.imageUrl}
                      alt={activeSkin.label}
                      className="rift-champion-skin-image"
                    />
                    <div className="rift-champion-skin-overlay" aria-hidden="true" />
                    <div className="rift-champion-skin-overlay-copy">
                      <p className="rift-champion-skin-overlay-title">{activeSkin.label}</p>
                    </div>
                  </div>

                  <div className="rift-champion-skin-rail-shell">
                    <button
                      type="button"
                      className="rift-champion-skin-arrow"
                      aria-label="Previous skins"
                      onClick={() => scrollSkinRail("previous")}
                    >
                      <ChevronLeft />
                    </button>

                    <div
                      ref={skinRailRef}
                      className="rift-champion-skin-selector"
                      role="tablist"
                      aria-label="Champion skins"
                    >
                      {championPage.skins.map((skin, index) => (
                        <button
                          key={skin.label}
                          type="button"
                          className="rift-champion-skin-button"
                          data-active={selectedSkinIndex === index}
                          onClick={() => setSelectedSkinIndex(index)}
                        >
                          <span className="rift-champion-skin-thumb-frame">
                            <img
                              src={skin.thumbnailUrl}
                              alt=""
                              className="rift-champion-skin-thumb"
                            />
                          </span>
                          <span className="rift-champion-skin-label">{skin.label}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="rift-champion-skin-arrow"
                      aria-label="Next skins"
                      onClick={() => scrollSkinRail("next")}
                    >
                      <ChevronRight />
                    </button>
                  </div>
                </>
              ) : (
                <Alert>
                  <Flame data-icon="inline-start" />
                  <AlertTitle>No skins available</AlertTitle>
                  <AlertDescription>
                    This champion does not have synced skin art yet.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  )
}
