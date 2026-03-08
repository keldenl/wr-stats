import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, CircleHelp, Search } from "lucide-react"

import { LaneIcon } from "@/components/lane-icon"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
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
import {
  LEADERBOARDS_ROUTE,
  championRoute,
  replaceRouteSearch,
  routeToHash,
} from "@/lib/hash-routing"
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

function renderBucketLabel(bucket: string) {
  const label = bucketLabel(bucket)

  if (bucket !== "4") {
    return label
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-hidden="true"
            className="inline-flex size-4 items-center justify-center text-muted-foreground"
          >
            <CircleHelp className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          China-only elite competitive ladder (similar to Legendary Ranked)
        </TooltipContent>
      </Tooltip>
    </span>
  )
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
                    href={routeToHash(championRoute(entry.riotSlug))}
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
            : "Failed to load archived leaderboard data."

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
      payload?.snapshots.find((snapshot) => snapshot.id === payload.snapshotId) ?? null,
    [payload]
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

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background text-foreground">
        <a href="#leaderboard-results" className="skip-link">
          Skip to results
        </a>

        <SiteHeader
          rightLabel="Leaderboards"
          rightHref={routeToHash(LEADERBOARDS_ROUTE)}
        />

        <section className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5 sm:px-6 sm:py-6">
          <div className="rift-leaderboard-title text-center">
            <h1 className="rift-page-title">Leaderboards</h1>
            {payload ? (
              <div className="flex items-center justify-center gap-1.5 pt-1 text-sm text-muted-foreground">
                <span>Last updated</span>
                <Select
                  value={selectedSnapshotId || payload.snapshotId}
                  onValueChange={setSelectedSnapshotId}
                  disabled={!payload}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-auto min-w-0 gap-1 border-0 bg-transparent px-0 py-0 text-sm text-muted-foreground shadow-none ring-0 hover:bg-transparent focus-visible:border-transparent focus-visible:ring-0"
                    aria-label="Archived snapshot"
                  >
                    <SelectValue>
                      {selectedSnapshotMeta
                        ? formatSnapshotLabel(
                            selectedSnapshotMeta.statDate,
                            selectedSnapshotMeta.fetchedAt,
                            (snapshotDateCounts.get(selectedSnapshotMeta.statDate) ?? 0) > 1
                          )
                        : formatLastUpdatedDate(payload.statDate)}
                    </SelectValue>
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
                      className="inline-flex size-4 items-center justify-center"
                      aria-label="Archive info"
                    >
                      <CircleHelp className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    Pulled {formatRelativeArchiveTime(payload.archivedAt)}. Use
                    the date menu to view older snapshots.
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : null}
          </div>

          <div className="rift-leaderboard-filter-stack">
            <ToggleGroup
              type="single"
              value={selectedTier}
              onValueChange={(value) => {
                if (value) {
                  setSelectedTier(value)
                }
              }}
              variant="outline"
              className="rift-filter-group rift-filter-group--tier justify-center"
            >
              {tierKeys.map((tierKey) => (
                <ToggleGroupItem
                  key={tierKey}
                  value={tierKey}
                  className="rift-filter-item"
                >
                  {renderBucketLabel(tierKey)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="rift-leaderboard-controls grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <InputGroup className="rift-leaderboard-search h-11">
                  <InputGroupInput
                    id="leaderboard-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search champion"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Champion search"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      variant="default"
                      size="icon-sm"
                      className="rift-search-submit rift-search-submit--solid"
                      aria-hidden="true"
                      tabIndex={-1}
                    >
                      <Search />
                    </InputGroupButton>
                  </InputGroupAddon>
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
                className="rift-filter-group rift-filter-group--lane lg:w-auto lg:flex-nowrap"
              >
                {laneFilterKeys.map((laneKey) => (
                  <ToggleGroupItem
                    key={laneKey}
                    value={laneKey}
                    className="rift-filter-item"
                  >
                    {LANE_FILTER_LABELS[laneKey]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <div id="leaderboard-results" className="rift-leaderboard-results">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to load leaderboards</AlertTitle>
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
        </section>
      </main>
    </TooltipProvider>
  )
}
