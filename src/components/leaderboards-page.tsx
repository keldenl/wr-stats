import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, CircleHelp } from "lucide-react"

import { LaneIcon } from "@/components/lane-icon"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SiteHeader } from "@/components/site-header"
import { MAIN_BACKDROP_URL } from "@/lib/backdrops"
import {
  applyDocumentSeo,
  type StructuredDataValue,
} from "@/lib/document-seo"
import { loadChampionPageBySlug } from "@/lib/champion-pages"
import {
  LEADERBOARDS_ROUTE,
  championRoute,
  replaceRouteSearch,
} from "@/lib/routing"
import {
  absoluteSiteUrl,
  leaderboardsSeoMetadata,
} from "@/lib/site-metadata"
import {
  LANE_LABELS,
  TIER_LABELS,
  loadLeaderboards,
  sortLaneKeys,
  sortNumericKeys,
  type LaneId,
  type LeaderboardEntry,
  type LeaderboardPayload,
} from "@/lib/tencent-lolm"

type SortKey = "strengthScore" | "winRate" | "pickRate" | "banRate"
type SortDirection = "asc" | "desc"

const DEFAULT_TIER = "1"
const ALL_LANE = "all"
type LaneFilterId = LaneId | typeof ALL_LANE
const DEFAULT_LANE: LaneFilterId = ALL_LANE

const LANE_FILTER_LABELS: Record<LaneFilterId, string> = {
  all: "All",
  ...LANE_LABELS,
}

function pickDefaultTier(tiers: string[]) {
  if (tiers.includes(DEFAULT_TIER)) {
    return DEFAULT_TIER
  }

  return tiers[0] ?? DEFAULT_TIER
}

function hasLaneFilter(lane: LaneFilterId, lanes: LaneId[]) {
  return lane === ALL_LANE || lanes.includes(lane)
}

function pickDefaultLane(lanes: LaneId[]) {
  if (hasLaneFilter(DEFAULT_LANE, lanes)) {
    return DEFAULT_LANE
  }

  return lanes[0] ?? DEFAULT_LANE
}

function isLaneId(value: string) {
  return Object.prototype.hasOwnProperty.call(LANE_LABELS, value)
}

function isLaneFilterId(value: string | null): value is LaneFilterId {
  return value === ALL_LANE || (value !== null && isLaneId(value))
}

function bucketLabel(bucket: string) {
  return TIER_LABELS[bucket] ?? `Bucket ${bucket}`
}

function rankTooltipContent(bucket: string) {
  if (bucket !== "4") {
    return null
  }

  return "Peak of the Rift is the China-only elite competitive ladder, similar to Legendary Ranked."
}

function ordinalSuffix(value: number) {
  const remainder = value % 10
  const teenRemainder = value % 100

  if (teenRemainder >= 11 && teenRemainder <= 13) {
    return "th"
  }

  if (remainder === 1) {
    return "st"
  }

  if (remainder === 2) {
    return "nd"
  }

  if (remainder === 3) {
    return "rd"
  }

  return "th"
}

function formatLastUpdatedDate(date: string | null) {
  if (!date || date.length !== 8) {
    return "Unknown"
  }

  const parsedDate = new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8))
  )
  const month = new Intl.DateTimeFormat(undefined, {
    month: "long",
  }).format(parsedDate)
  const day = parsedDate.getDate()

  if (parsedDate.getFullYear() === new Date().getFullYear()) {
    return `${month} ${day}${ordinalSuffix(day)}`
  }

  return `${month} ${day}${ordinalSuffix(day)}, ${parsedDate.getFullYear()}`
}

function formatArchiveTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatRelativeArchiveTime(value: string) {
  const now = Date.now()
  const diffMilliseconds = new Date(value).getTime() - now
  const absoluteMilliseconds = Math.abs(diffMilliseconds)
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  })

  if (absoluteMilliseconds < 60 * 60 * 1000) {
    return formatter.format(Math.round(diffMilliseconds / (60 * 1000)), "minute")
  }

  if (absoluteMilliseconds < 24 * 60 * 60 * 1000) {
    return formatter.format(Math.round(diffMilliseconds / (60 * 60 * 1000)), "hour")
  }

  return formatter.format(
    Math.round(diffMilliseconds / (24 * 60 * 60 * 1000)),
    "day"
  )
}

function formatSnapshotLabel(
  statDate: string,
  fetchedAt: string,
  showArchiveTime: boolean
) {
  const dateLabel = formatLastUpdatedDate(statDate)

  if (!showArchiveTime) {
    return dateLabel
  }

  return `${dateLabel} · ${formatArchiveTime(fetchedAt)}`
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatStrengthScore(value: number) {
  return value.toFixed(2)
}

function renderStrengthInfo() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="How tier is calculated"
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        Tier is a quick strength grade based on win rate, pick rate, and ban rate.
        Higher tiers usually mean a stronger overall meta pick.
      </TooltipContent>
    </Tooltip>
  )
}

function strengthTierBadgeVariant(tier: LeaderboardEntry["strengthTier"]) {
  if (tier === "S" || tier === "A") {
    return "default"
  }

  if (tier === "B" || tier === "C") {
    return "secondary"
  }

  return "outline"
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
        item: absoluteSiteUrl(LEADERBOARDS_ROUTE),
        name: "Tier List",
        position: 2,
      },
    ],
  } satisfies StructuredDataValue
}

function parseFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const q = params.get("q") ?? ""
  const tier = params.get("tier") ?? DEFAULT_TIER
  const laneParam = params.get("lane")
  const lane = isLaneFilterId(laneParam) ? laneParam : DEFAULT_LANE
  const sort = params.get("sort")
  const direction = params.get("direction")
  const snapshotId = params.get("snapshot") ?? ""

  return {
    direction: direction === "asc" ? "asc" : "desc",
    lane,
    q,
    snapshotId,
    sort:
      sort === "strengthScore" ||
      sort === "pickRate" ||
      sort === "banRate" ||
      sort === "winRate"
        ? sort
        : "strengthScore",
    tier,
  } satisfies {
    direction: SortDirection
    lane: LaneFilterId
    q: string
    snapshotId: string
    sort: SortKey
    tier: string
  }
}

function LeaderboardTable({
  entries,
  sortBy,
  sortDirection,
  onSortChange,
}: {
  entries: LeaderboardEntry[]
  sortBy: SortKey
  sortDirection: SortDirection
  onSortChange: (sortKey: SortKey) => void
}) {
  if (!entries.length) {
    return (
      <div className="rift-empty-state">
        <p className="text-sm font-medium text-foreground">
          No champions matched this filter.
        </p>
      </div>
    )
  }

  return (
    <div className="rift-table-shell px-3 sm:px-4">
      <Table className="rift-table min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rank</TableHead>
            <TableHead className="w-14 text-center">Role</TableHead>
            <TableHead>Champion</TableHead>
            {(
              [
                ["strengthScore", "Tier"],
                ["winRate", "Win"],
                ["pickRate", "Pick"],
                ["banRate", "Ban"],
              ] as const
            ).map(([sortKey, label]) => {
              const isActive = sortBy === sortKey
              const isTierColumn = sortKey === "strengthScore"

              return (
                <TableHead
                  key={sortKey}
                  className={isTierColumn ? "text-center" : "text-right"}
                  aria-sort={
                    isActive
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {isTierColumn ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        className="rift-sort-button ml-0 justify-center"
                        onClick={() => onSortChange(sortKey)}
                      >
                        {label}
                        {isActive ? (
                          sortDirection === "asc" ? (
                            <ArrowUp />
                          ) : (
                            <ArrowDown />
                          )
                        ) : (
                          <ArrowUpDown />
                        )}
                      </button>
                      {renderStrengthInfo()}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="rift-sort-button"
                      onClick={() => onSortChange(sortKey)}
                    >
                      {label}
                      {isActive ? (
                        sortDirection === "asc" ? (
                          <ArrowUp />
                        ) : (
                          <ArrowDown />
                        )
                      ) : (
                        <ArrowUpDown />
                      )}
                    </button>
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {entries.map((entry, index) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell className="rift-role-cell">
                <LaneIcon lane={entry.lane} label={entry.laneLabel} />
              </TableCell>
              <TableCell>
                {entry.riotSlug ? (
                  <a
                    href={championRoute(entry.riotSlug)}
                    className="rift-champion-link"
                  >
                    <Avatar size="lg" className="rounded-xl">
                      <AvatarImage
                        src={entry.avatar}
                        alt={entry.name}
                        className="rounded-xl"
                      />
                      <AvatarFallback className="rounded-xl bg-muted text-xs">
                        {initialsFromName(entry.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium text-foreground">
                      {entry.name}
                    </span>
                  </a>
                ) : (
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar size="lg" className="rounded-xl">
                      <AvatarImage
                        src={entry.avatar}
                        alt={entry.name}
                        className="rounded-xl"
                      />
                      <AvatarFallback className="rounded-xl bg-muted text-xs">
                        {initialsFromName(entry.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium text-foreground">
                      {entry.name}
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={strengthTierBadgeVariant(entry.strengthTier)}
                  className="min-w-8"
                  title={formatStrengthScore(entry.strengthScore)}
                  aria-label={`Tier ${entry.strengthTier}, strength score ${formatStrengthScore(
                    entry.strengthScore
                  )}`}
                >
                  {entry.strengthTier}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatPercent(entry.winRate)}
              </TableCell>
              <TableCell className="text-right">
                {formatPercent(entry.pickRate)}
              </TableCell>
              <TableCell className="text-right">
                {formatPercent(entry.banRate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function LeaderboardsPage() {
  const [initialFilters] = useState(parseFiltersFromUrl)
  const [payload, setPayload] = useState<LeaderboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heroVideo, setHeroVideo] = useState<{
    name: string
    riotSlug: string
    videoUrl: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(initialFilters.q)
  const [selectedTier, setSelectedTier] = useState(initialFilters.tier)
  const [selectedLane, setSelectedLane] = useState<LaneFilterId>(initialFilters.lane)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState(
    initialFilters.snapshotId
  )
  const [sortBy, setSortBy] = useState<SortKey>(initialFilters.sort)
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    initialFilters.direction
  )
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const applyPayload = useEffectEvent((nextPayload: LeaderboardPayload) => {
    const tiers = sortNumericKeys(Object.keys(nextPayload.entriesByTier)).filter(
      (tierKey) =>
        tierKey !== "0" &&
        Object.values(nextPayload.entriesByTier[tierKey] ?? {}).some(
          (entries) => entries.length > 0
        )
    )
    const nextTier = tiers.includes(selectedTier)
      ? selectedTier
      : tiers.includes(initialFilters.tier)
        ? initialFilters.tier
        : pickDefaultTier(tiers)
    const lanes = sortLaneKeys(
      Object.keys(nextPayload.entriesByTier[nextTier] ?? {}) as LaneId[]
    )
    const nextLane = hasLaneFilter(selectedLane, lanes)
      ? selectedLane
      : hasLaneFilter(initialFilters.lane, lanes)
        ? initialFilters.lane
        : pickDefaultLane(lanes)

    startTransition(() => {
      setPayload(nextPayload)
      setSelectedTier(nextTier)
      setSelectedLane(nextLane)

      if (selectedSnapshotId !== nextPayload.snapshotId) {
        setSelectedSnapshotId(nextPayload.snapshotId)
      }
    })
  })

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)

      try {
        const nextPayload = await loadLeaderboards(selectedSnapshotId || undefined)

        if (cancelled) {
          return
        }

        applyPayload(nextPayload)
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load archived tier list data."

        setError(message)
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
  }, [selectedSnapshotId])

  const tierKeys = useMemo(
    () =>
      sortNumericKeys(Object.keys(payload?.entriesByTier ?? {})).filter(
        (tierKey) =>
          tierKey !== "0" &&
          Object.values(payload?.entriesByTier[tierKey] ?? {}).some(
            (entries) => entries.length > 0
          )
      ),
    [payload]
  )

  const laneKeys = useMemo(
    () =>
      sortLaneKeys(
        Object.keys(payload?.entriesByTier[selectedTier] ?? {}) as LaneId[]
      ),
    [payload, selectedTier]
  )

  const laneFilterKeys = useMemo(
    () => [ALL_LANE, ...laneKeys] as LaneFilterId[],
    [laneKeys]
  )

  const snapshotDateCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const snapshot of payload?.snapshots ?? []) {
      counts.set(snapshot.statDate, (counts.get(snapshot.statDate) ?? 0) + 1)
    }

    return counts
  }, [payload])

  const selectedSnapshotMeta = useMemo(
    () =>
      payload?.snapshots.find(
        (snapshot) => snapshot.id === (selectedSnapshotId || payload.snapshotId)
      ) ?? null,
    [payload, selectedSnapshotId]
  )

  useEffect(() => {
    if (!hasLaneFilter(selectedLane, laneKeys)) {
      setSelectedLane(pickDefaultLane(laneKeys))
    }
  }, [laneKeys, selectedLane])

  useEffect(() => {
    const params = new URLSearchParams()

    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim())
    }

    params.set("tier", selectedTier)
    params.set("lane", selectedLane)
    params.set("sort", sortBy)
    params.set("direction", sortDirection)

    if (payload && selectedSnapshotId && selectedSnapshotId !== payload.latestSnapshotId) {
      params.set("snapshot", selectedSnapshotId)
    }

    replaceRouteSearch(LEADERBOARDS_ROUTE, params)
  }, [
    payload,
    searchQuery,
    selectedLane,
    selectedSnapshotId,
    selectedTier,
    sortBy,
    sortDirection,
  ])

  const visibleEntries = useMemo(() => {
    const tierEntries = payload?.entriesByTier[selectedTier]

    if (!tierEntries) {
      return []
    }

    const baseEntries =
      selectedLane === ALL_LANE
        ? laneKeys.flatMap((laneKey) => tierEntries[laneKey] ?? [])
        : tierEntries[selectedLane] ?? []
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase()

    const filteredEntries = normalizedQuery
      ? baseEntries.filter((entry) => entry.searchText.includes(normalizedQuery))
      : baseEntries

    return [...filteredEntries].sort((left, right) => {
      const delta =
        sortBy === "strengthScore"
          ? left.strengthScore - right.strengthScore
          : sortBy === "winRate"
            ? left.winRate - right.winRate
            : sortBy === "pickRate"
              ? left.pickRate - right.pickRate
              : left.banRate - right.banRate

      return sortDirection === "asc" ? delta : -delta
    })
  }, [
    deferredSearchQuery,
    laneKeys,
    payload,
    selectedLane,
    selectedTier,
    sortBy,
    sortDirection,
  ])

  const topChampionEntry = useMemo(() => {
    const tierEntries = payload?.entriesByTier[selectedTier]

    if (!tierEntries) {
      return null
    }

    return [...laneKeys.flatMap((laneKey) => tierEntries[laneKey] ?? [])].sort(
      (left, right) => {
        if (left.strengthScore !== right.strengthScore) {
          return right.strengthScore - left.strengthScore
        }

        if (left.winRate !== right.winRate) {
          return right.winRate - left.winRate
        }

        return right.pickRate - left.pickRate
      }
    )[0] ?? null
  }, [laneKeys, payload, selectedTier])

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!topChampionEntry?.riotSlug) {
        setHeroVideo(null)
        return
      }

      try {
        const championPage = await loadChampionPageBySlug(topChampionEntry.riotSlug)

        if (cancelled) {
          return
        }

        setHeroVideo({
          name: championPage.title,
          riotSlug: championPage.riotSlug,
          videoUrl: championPage.mastheadVideoUrl,
        })
      } catch {
        if (!cancelled) {
          setHeroVideo(null)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [topChampionEntry?.riotSlug])

  function handleSortChange(nextSortKey: SortKey) {
    if (sortBy === nextSortKey) {
      setSortDirection((currentDirection) =>
        currentDirection === "asc" ? "desc" : "asc"
      )
      return
    }

    setSortBy(nextSortKey)
    setSortDirection("desc")
  }

  const selectedTierLabel = bucketLabel(selectedTier)
  const snapshotLabel =
    payload && selectedSnapshotMeta
      ? formatSnapshotLabel(
          selectedSnapshotMeta.statDate,
          selectedSnapshotMeta.fetchedAt,
          (snapshotDateCounts.get(selectedSnapshotMeta.statDate) ?? 0) > 1
        )
      : payload
        ? formatLastUpdatedDate(payload.statDate)
        : "Loading"

  useEffect(() => {
    const metadata = leaderboardsSeoMetadata({
      archivedAtLabel: payload ? formatRelativeArchiveTime(payload.archivedAt) : undefined,
      imageUrl: topChampionEntry?.avatar ?? null,
      path: LEADERBOARDS_ROUTE,
      statDateLabel: payload ? formatLastUpdatedDate(payload.statDate) : undefined,
      topChampionName: topChampionEntry?.name,
    })

    applyDocumentSeo({
      canonicalPath: LEADERBOARDS_ROUTE,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      robots: window.location.search ? "noindex,follow" : "index,follow",
      structuredData: [
        breadcrumbStructuredData(),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          dateModified: payload?.archivedAt,
          description: metadata.description,
          name: metadata.title,
          url: absoluteSiteUrl(LEADERBOARDS_ROUTE),
        } satisfies StructuredDataValue,
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: visibleEntries.slice(0, 10).map((entry, index) => ({
            "@type": "ListItem",
            name: entry.name,
            position: index + 1,
            url: absoluteSiteUrl(championRoute(entry.riotSlug)),
          })),
        } satisfies StructuredDataValue,
      ],
      title: metadata.title,
    })
  }, [payload, topChampionEntry, visibleEntries])

  return (
    <TooltipProvider>
      <main className="rift-champion-page-shell rift-leaderboard-page-shell">
        <a href="#leaderboard-results" className="skip-link">
          Skip to results
        </a>

        <SiteHeader />

        <section id="leaderboard-overview" className="rift-leaderboard-hero">
          <video
            key={heroVideo?.videoUrl ?? MAIN_BACKDROP_URL}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="rift-leaderboard-hero-video"
            aria-hidden="true"
          >
            <source src={heroVideo?.videoUrl ?? MAIN_BACKDROP_URL} type="video/mp4" />
          </video>

          <div className="rift-leaderboard-hero-overlay" aria-hidden="true" />

          <div className="rift-leaderboard-hero-content">
            <div className="rift-leaderboard-hero-inner">
              <div className="rift-leaderboard-heading-row">
                <div className="rift-leaderboard-toolbar-group">
                  <Select value={selectedTier} onValueChange={setSelectedTier}>
                    <SelectTrigger
                      size="sm"
                      className="rift-champion-kicker rift-leaderboard-kicker-select"
                      aria-label="Rank bucket"
                    >
                      <SelectValue>{selectedTierLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {tierKeys.map((tierKey) => (
                          <SelectItem key={tierKey} value={tierKey}>
                            {bucketLabel(tierKey)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {rankTooltipContent(selectedTier) ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rift-leaderboard-info-button"
                          aria-label="Rank bucket info"
                        >
                          <CircleHelp className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>
                        {rankTooltipContent(selectedTier)}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>

                {payload ? (
                  <div className="rift-leaderboard-toolbar-group">
                    <Select
                      value={selectedSnapshotId || payload.snapshotId}
                      onValueChange={setSelectedSnapshotId}
                    >
                      <SelectTrigger
                        size="sm"
                        className="rift-champion-bucket-select rift-leaderboard-archive-select"
                        aria-label="Archived snapshot"
                      >
                        <SelectValue>{snapshotLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(payload.snapshots ?? []).map((snapshot) => {
                            const showArchiveTime =
                              (snapshotDateCounts.get(snapshot.statDate) ?? 0) > 1

                            return (
                              <SelectItem key={snapshot.id} value={snapshot.id}>
                                {formatSnapshotLabel(
                                  snapshot.statDate,
                                  snapshot.fetchedAt,
                                  showArchiveTime
                                )}
                              </SelectItem>
                            )
                          })}
                        </SelectGroup>
                      </SelectContent>
                    </Select>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rift-leaderboard-info-button"
                          aria-label="Archive info"
                        >
                          <CircleHelp className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>
                        This date is the archived CN stats snapshot currently shown in
                        the table. Pulled {formatRelativeArchiveTime(payload.archivedAt)}.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
              </div>

              <div className="rift-champion-title-block">
                <h1 className="rift-champion-title rift-leaderboard-page-title">
                  Tier List
                </h1>
                <p className="mt-3 max-w-3xl text-sm text-slate-200 sm:text-base">
                  Track the current Wild Rift tier list with sortable win rate, pick
                  rate, ban rate, and strength score across ranked buckets and lanes.
                </p>
              </div>

              <div className="rift-leaderboard-hero-panel">
                <div className="rift-leaderboard-controls">
                  <div>
                    <InputGroup className="rift-leaderboard-search h-11">
                      <InputGroupInput
                        id="leaderboard-search"
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Filter by champion"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Champion filter"
                      />
                    </InputGroup>
                  </div>

                  <ToggleGroup
                    type="single"
                    value={selectedLane}
                    onValueChange={(value) => {
                      if (value) {
                        setSelectedLane(value as LaneFilterId)
                      }
                    }}
                    variant="outline"
                    className="rift-filter-group rift-filter-group--lane"
                  >
                    {laneFilterKeys.map((laneKey) => (
                      <ToggleGroupItem
                        key={laneKey}
                        value={laneKey}
                        className="rift-filter-item rift-filter-item--lane"
                      >
                        {laneKey === ALL_LANE ? (
                          <span>All</span>
                        ) : (
                          <>
                            <LaneIcon
                              lane={laneKey}
                              label={LANE_FILTER_LABELS[laneKey]}
                              size="tiny"
                            />
                            <span>{LANE_FILTER_LABELS[laneKey]}</span>
                          </>
                        )}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="leaderboard-results" className="rift-leaderboard-results-shell">
          <div className="rift-leaderboard-results-inner">
            <div className="rift-leaderboard-results">
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Unable to load tier list</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : isLoading ? (
                <div className="rift-loading-state">
                  <Spinner className="size-6" />
                </div>
              ) : (
                <LeaderboardTable
                  entries={visibleEntries}
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSortChange={handleSortChange}
                />
              )}
            </div>
          </div>
        </section>
      </main>
    </TooltipProvider>
  )
}
