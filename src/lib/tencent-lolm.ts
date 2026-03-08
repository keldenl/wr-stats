import {
  LANE_LABELS,
  dataFileUrl,
  normalizeChampionCatalog,
  normalizeSnapshot,
  sortLaneKeys,
  sortNumericKeys,
  type ChampionCatalog,
  type CompactLeaderboardRow,
  type LaneId,
  type LeaderboardSnapshot,
  type SnapshotMeta,
  type StaticDataManifest,
} from "@/lib/static-data"
import {
  calculateChampionStrengthScore,
  getChampionStrengthTier,
  type ChampionStrengthTier,
} from "@/lib/champion-strength"

export { LANE_LABELS, sortLaneKeys, sortNumericKeys }
export type { LaneId }

export const TIER_LABELS: Record<string, string> = {
  "1": "Diamond+",
  "2": "Master+",
  "3": "Challenger",
  "4": "Peak of the Rift",
}

export type LeaderboardEntry = {
  alias: string
  avatar: string
  riotSlug: string
  strengthScore: number
  strengthTier: ChampionStrengthTier
  id: string
  lane: LaneId
  laneLabel: string
  name: string
  pickRate: number
  searchText: string
  title: string
  winRate: number
  banRate: number
}

export type LeaderboardPayload = {
  archivedAt: string
  entriesByTier: Record<string, Record<string, LeaderboardEntry[]>>
  latestSnapshotId: string
  snapshotId: string
  snapshots: SnapshotMeta[]
  statDate: string
}

export type ChampionRoleStat = {
  lane: LaneId
  laneLabel: string
  pickRate: number
  winRate: number
  banRate: number
  strengthScore: number
  strengthTier: ChampionStrengthTier
}

export type ChampionStatsBucket = {
  bucket: string
  label: string
  roles: ChampionRoleStat[]
}

export type ChampionHeroStatsPayload = {
  archivedAt: string
  buckets: ChampionStatsBucket[]
  latestSnapshotId: string
  snapshotId: string
  statDate: string
}

let manifestPromise: Promise<StaticDataManifest> | null = null
let championCatalogPromise: Promise<ChampionCatalog> | null = null
const snapshotCache = new Map<string, Promise<LeaderboardSnapshot>>()

async function readJson<T>(pathname: string) {
  const response = await fetch(dataFileUrl(pathname))

  if (!response.ok) {
    throw new Error(`Request failed for ${pathname}: ${response.status}`)
  }

  return (await response.json()) as T
}

async function loadManifest() {
  manifestPromise ??= readJson<StaticDataManifest>("data/manifest.v1.json")
  return manifestPromise
}

async function loadChampionCatalog() {
  if (!championCatalogPromise) {
    championCatalogPromise = loadManifest().then((manifest) =>
      readJson<ChampionCatalog>(manifest.championsPath)
    )
  }

  return championCatalogPromise
}

async function loadSnapshotByPath(pathname: string) {
  const cachedSnapshot = snapshotCache.get(pathname)

  if (cachedSnapshot) {
    return cachedSnapshot
  }

  const snapshotPromise = readJson<LeaderboardSnapshot>(pathname)
  snapshotCache.set(pathname, snapshotPromise)

  return snapshotPromise
}

function normalizeEntry(
  snapshotId: string,
  tierKey: string,
  laneKey: LaneId,
  rowIndex: number,
  compactRow: CompactLeaderboardRow,
  champions: ChampionCatalog["champions"]
): LeaderboardEntry {
  const [heroId, winRate, pickRate, banRate] = compactRow
  const champion = champions[heroId]
  const strengthScore = calculateChampionStrengthScore(winRate, pickRate, banRate)

  return {
    alias: champion?.alias ?? "",
    avatar: champion?.avatar ? dataFileUrl(champion.avatar) : "",
    riotSlug: champion?.riotSlug ?? "",
    strengthScore,
    strengthTier: getChampionStrengthTier(strengthScore),
    id: `${snapshotId}-${tierKey}-${laneKey}-${heroId}-${rowIndex}`,
    lane: laneKey,
    laneLabel: LANE_LABELS[laneKey] ?? `Lane ${laneKey}`,
    name: champion?.displayName ?? `Hero ${heroId}`,
    pickRate,
    searchText: champion?.searchText ?? `hero ${heroId}`,
    title: champion?.title ?? `Hero ${heroId}`,
    winRate,
    banRate,
  }
}

function buildEntriesByTier(
  snapshot: LeaderboardSnapshot,
  champions: ChampionCatalog["champions"]
) {
  const entriesByTier: Record<string, Record<string, LeaderboardEntry[]>> = {}

  for (const tierKey of sortNumericKeys(Object.keys(snapshot.tiers))) {
    entriesByTier[tierKey] = {}

    for (const laneKey of sortLaneKeys(
      Object.keys(snapshot.tiers[tierKey] ?? {}) as LaneId[]
    )) {
      const rows = snapshot.tiers[tierKey]?.[laneKey] ?? []

      entriesByTier[tierKey][laneKey] = rows.map((row, rowIndex) =>
        normalizeEntry(snapshot.snapshotId, tierKey, laneKey, rowIndex, row, champions)
      )
    }
  }

  return entriesByTier
}

function normalizeChampionRoleStat(
  laneKey: LaneId,
  compactRow: CompactLeaderboardRow
): ChampionRoleStat {
  const [, winRate, pickRate, banRate] = compactRow
  const strengthScore = calculateChampionStrengthScore(winRate, pickRate, banRate)

  return {
    banRate,
    lane: laneKey,
    laneLabel: LANE_LABELS[laneKey] ?? `Lane ${laneKey}`,
    pickRate,
    strengthScore,
    strengthTier: getChampionStrengthTier(strengthScore),
    winRate,
  }
}

function buildChampionStatsBuckets(
  snapshot: LeaderboardSnapshot,
  championId: string
): ChampionStatsBucket[] {
  return sortNumericKeys(Object.keys(snapshot.tiers))
    .filter((tierKey) => tierKey !== "0")
    .map((tierKey) => {
      const laneKeys = sortLaneKeys(
        Object.keys(snapshot.tiers[tierKey] ?? {}) as LaneId[]
      )
      const laneOrder = new Map(
        laneKeys.map((laneKey, index) => [laneKey, index] as const)
      )
      const roles = laneKeys
        .map((laneKey) => {
          const row = snapshot.tiers[tierKey]?.[laneKey]?.find(
            ([heroId]) => heroId === championId
          )

          return row ? normalizeChampionRoleStat(laneKey, row) : null
        })
        .filter((role): role is ChampionRoleStat => role !== null)
        .sort((left, right) => {
          if (left.pickRate !== right.pickRate) {
            return right.pickRate - left.pickRate
          }

          return (laneOrder.get(left.lane) ?? Number.MAX_SAFE_INTEGER) -
            (laneOrder.get(right.lane) ?? Number.MAX_SAFE_INTEGER)
        })

      return {
        bucket: tierKey,
        label: TIER_LABELS[tierKey] ?? `Bucket ${tierKey}`,
        roles,
      }
    })
    .filter((bucket) => bucket.roles.length > 0)
}

export async function loadLeaderboards(snapshotId?: string) {
  const [manifest, championCatalog] = await Promise.all([
    loadManifest(),
    loadChampionCatalog(),
  ])

  const selectedSnapshotMeta =
    manifest.snapshots.find((snapshot) => snapshot.id === snapshotId) ??
    manifest.snapshots.find((snapshot) => snapshot.id === manifest.latestSnapshotId)

  if (!selectedSnapshotMeta) {
    throw new Error("No published leaderboard snapshots are available.")
  }

  const snapshotPath =
    selectedSnapshotMeta.id === manifest.latestSnapshotId
      ? manifest.latestPath
      : selectedSnapshotMeta.path

  const snapshot = await loadSnapshotByPath(snapshotPath)

  if (snapshot.snapshotId !== selectedSnapshotMeta.id) {
    throw new Error(`Snapshot mismatch for ${selectedSnapshotMeta.id}.`)
  }

  return {
    archivedAt: snapshot.fetchedAt,
    entriesByTier: buildEntriesByTier(snapshot, championCatalog.champions),
    latestSnapshotId: manifest.latestSnapshotId,
    snapshotId: snapshot.snapshotId,
    snapshots: manifest.snapshots,
    statDate: snapshot.statDate,
  } satisfies LeaderboardPayload
}

export async function loadChampionHeroStats(
  championId: string,
  snapshotId?: string
) {
  const manifest = await loadManifest()
  const selectedSnapshotMeta =
    manifest.snapshots.find((snapshot) => snapshot.id === snapshotId) ??
    manifest.snapshots.find((snapshot) => snapshot.id === manifest.latestSnapshotId)

  if (!selectedSnapshotMeta) {
    throw new Error("No published leaderboard snapshots are available.")
  }

  const snapshotPath =
    selectedSnapshotMeta.id === manifest.latestSnapshotId
      ? manifest.latestPath
      : selectedSnapshotMeta.path

  const snapshot = await loadSnapshotByPath(snapshotPath)

  if (snapshot.snapshotId !== selectedSnapshotMeta.id) {
    throw new Error(`Snapshot mismatch for ${selectedSnapshotMeta.id}.`)
  }

  return {
    archivedAt: snapshot.fetchedAt,
    buckets: buildChampionStatsBuckets(snapshot, championId),
    latestSnapshotId: manifest.latestSnapshotId,
    snapshotId: snapshot.snapshotId,
    statDate: snapshot.statDate,
  } satisfies ChampionHeroStatsPayload
}

export function normalizeSourceDataForTests(
  champions: Parameters<typeof normalizeChampionCatalog>[0],
  snapshot: Parameters<typeof normalizeSnapshot>[0]
) {
  return {
    champions: normalizeChampionCatalog(champions),
    snapshot: normalizeSnapshot(snapshot),
  }
}
