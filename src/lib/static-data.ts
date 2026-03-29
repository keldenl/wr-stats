export const STATIC_DATA_VERSION = 1

export const LANE_LABELS = {
  "1": "Mid",
  "2": "Solo",
  "3": "Duo",
  "4": "Support",
  "5": "Jungle",
} as const

export type LaneId = keyof typeof LANE_LABELS

export const LANE_ORDER: LaneId[] = ["2", "5", "1", "3", "4"]

export type SourceHeroRecord = {
  alias?: string
  avatar?: string
  heroId?: string
  name?: string
  poster?: string
  title?: string
}

export type HeroListResponse = {
  heroList: Record<string, SourceHeroRecord>
}

export type SourceLeaderboardEntry = {
  appear_rate_percent: string
  dtstatdate: string
  forbid_rate_percent: string
  hero_id: string
  position: LaneId
  win_rate_percent: string
}

export type SourceLeaderboardResponse = {
  data: Record<string, Record<string, SourceLeaderboardEntry[]>>
}

export type ChampionRecord = {
  alias: string
  avatar: string
  displayName: string
  id: string
  riotSlug?: string
  riotUrl?: string
  searchText: string
  title: string
}

export type ChampionCatalog = {
  version: number
  generatedAt: string
  hash: string
  champions: Record<string, ChampionRecord>
}

export type CompactLeaderboardRow = [
  heroId: string,
  winRate: number,
  pickRate: number,
  banRate: number,
]

export type LeaderboardSnapshot = {
  version: number
  snapshotId: string
  statDate: string
  fetchedAt: string
  hash: string
  tiers: Record<string, Record<string, CompactLeaderboardRow[]>>
}

export type SnapshotMeta = {
  id: string
  statDate: string
  fetchedAt: string
  hash: string
  path: string
  rowCount: number
  tierKeys: string[]
}

export type StaticDataManifest = {
  version: number
  generatedAt: string
  latestSnapshotId: string
  championsPath: string
  latestPath: string
  snapshots: SnapshotMeta[]
}

export type BackdropManifest = {
  version: number
  generatedAt: string
  latestChampionSlug: string
  mainBackdropUrl: string
}

export type ChampionPageIndexRecord = {
  championId: string
  riotSlug: string
  riotUrl: string
  title: string
  cardImageUrl: string
  listEntryHash: string
  pagePath: string
  pageHash: string
  publishDate?: string
}

export type ChampionPagesIndex = {
  version: number
  generatedAt: string
  sourceLocale: "en-us"
  listHash: string
  champions: Record<string, ChampionPageIndexRecord>
}

export type ChampionPageAbility = {
  label: string
  subtitle: string
  description: string
  iconUrl: string
  videoUrl: string
}

export type ChampionPageSkin = {
  label: string
  thumbnailUrl: string
  imageUrl: string
}

export type ChampionPageData = {
  version: number
  generatedAt: string
  championId: string
  riotSlug: string
  riotUrl: string
  title: string
  subtitle: string
  roles: string[]
  difficulty: {
    label: string
    value: number
    maxValue: number
    name: string
  } | null
  mastheadVideoUrl: string
  fullWidthImageUrl: string | null
  abilities: ChampionPageAbility[]
  skins: ChampionPageSkin[]
  publishDate?: string
  hash: string
}

export type NormalizedSnapshot = {
  rowCount: number
  statDate: string
  tierKeys: string[]
  tiers: Record<string, Record<string, CompactLeaderboardRow[]>>
}

export function avatarAssetPath(heroId: string) {
  return `data/avatars/${heroId}.png`
}

export function championPageDataPath(riotSlug: string) {
  return `data/champion-pages/${riotSlug}.v1.json`
}

export function championPagesIndexPath() {
  return "data/champion-pages.index.v1.json"
}

export function backdropManifestPath() {
  return "data/backdrops.v1.json"
}

export function championNameFromPoster(poster?: string) {
  if (!poster) {
    return "Unknown"
  }

  const fileName = poster.split("/").pop() ?? poster
  const stem = fileName.split("_")[0] ?? fileName
  const withSpaces = stem.replace(/([A-Z]+)/g, " $1").trim()

  if (withSpaces === "Monkey King") {
    return "Wukong"
  }

  return withSpaces
}

export function numberFromPercent(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function sortNumericKeys(source: string[]) {
  return [...source].sort((left, right) => {
    const leftNumber = Number.parseInt(left, 10)
    const rightNumber = Number.parseInt(right, 10)
    return leftNumber - rightNumber
  })
}

export function sortLaneKeys(source: LaneId[]) {
  const laneOrderMap = new Map(
    LANE_ORDER.map((laneId, index) => [laneId, index] as const)
  )

  return [...source].sort((left, right) => {
    const leftIndex = laneOrderMap.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = laneOrderMap.get(right) ?? Number.MAX_SAFE_INTEGER

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }

    return left.localeCompare(right)
  })
}

export function normalizeChampionCatalog(source: HeroListResponse) {
  const champions = Object.fromEntries(
    sortNumericKeys(Object.keys(source.heroList)).map((heroId) => {
      const hero = source.heroList[heroId] ?? {}
      const displayName = championNameFromPoster(hero.poster)
      const title = hero.title ?? hero.name ?? `Hero ${heroId}`
      const alias = hero.alias ?? ""
      const avatar = hero.avatar ?? ""

      return [
        heroId,
        {
          alias,
          avatar: avatar ? avatarAssetPath(heroId) : "",
          displayName,
          id: heroId,
          searchText: `${displayName} ${title} ${hero.name ?? ""} ${alias}`
            .trim()
            .toLowerCase(),
          title,
        } satisfies ChampionRecord,
      ]
    })
  )

  return champions
}

export function normalizeSnapshot(source: SourceLeaderboardResponse) {
  const tiers: Record<string, Record<string, CompactLeaderboardRow[]>> = {}
  const statDates = new Set<string>()
  let rowCount = 0

  for (const tierKey of sortNumericKeys(Object.keys(source.data ?? {}))) {
    tiers[tierKey] = {}

    for (const laneKey of sortNumericKeys(
      Object.keys(source.data[tierKey] ?? {})
    ) as LaneId[]) {
      const rows = source.data[tierKey]?.[laneKey] ?? []
      const compactRows: CompactLeaderboardRow[] = []

      for (const row of rows) {
        if (
          !row.hero_id ||
          !row.dtstatdate ||
          row.win_rate_percent == null ||
          row.appear_rate_percent == null ||
          row.forbid_rate_percent == null
        ) {
          throw new Error("Leaderboard payload is missing required fields.")
        }

        statDates.add(row.dtstatdate)
        rowCount += 1
        compactRows.push([
          row.hero_id,
          numberFromPercent(row.win_rate_percent),
          numberFromPercent(row.appear_rate_percent),
          numberFromPercent(row.forbid_rate_percent),
        ])
      }

      tiers[tierKey][laneKey] = compactRows
    }
  }

  if (statDates.size !== 1) {
    throw new Error("Leaderboard payload must contain exactly one dtstatdate.")
  }

  const [statDate] = [...statDates]

  return {
    rowCount,
    statDate,
    tierKeys: sortNumericKeys(Object.keys(tiers)),
    tiers,
  } satisfies NormalizedSnapshot
}

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    )

    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`
  }

  return JSON.stringify(value)
}

export function dataFileUrl(pathname: string) {
  const basePath = import.meta.env.BASE_URL ?? "/"
  return `${basePath}${pathname.replace(/^\/+/, "")}`
}
