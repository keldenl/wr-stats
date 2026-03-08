import { normalizeChampionIdentityName } from "@/lib/champion-identity"
import {
  championPagesIndexPath,
  dataFileUrl,
  type ChampionCatalog,
  type ChampionPageData,
  type ChampionPagesIndex,
} from "@/lib/static-data"

let championPagesIndexPromise: Promise<ChampionPagesIndex> | null = null
let championCatalogPromise: Promise<ChampionCatalog> | null = null
const championPageCache = new Map<string, Promise<ChampionPageData>>()

export type ChampionDirectoryEntry = {
  avatarUrl: string
  championId: string
  displayName: string
  riotSlug: string
  riotUrl: string
  searchText: string
  title: string
}

type ScoredChampionMatch = {
  champion: ChampionDirectoryEntry
  rank: number
}

async function readJson<T>(pathname: string) {
  const response = await fetch(dataFileUrl(pathname))

  if (!response.ok) {
    throw new Error(`Request failed for ${pathname}: ${response.status}`)
  }

  return (await response.json()) as T
}

export async function loadChampionPagesIndex() {
  championPagesIndexPromise ??= readJson<ChampionPagesIndex>(championPagesIndexPath())
  return championPagesIndexPromise
}

async function loadChampionCatalog() {
  championCatalogPromise ??= readJson<ChampionCatalog>("data/champions.v1.json")
  return championCatalogPromise
}

export async function loadChampionDirectory() {
  const championCatalog = await loadChampionCatalog()

  return Object.values(championCatalog.champions)
    .filter(
      (champion): champion is ChampionCatalog["champions"][string] &
        Required<Pick<ChampionCatalog["champions"][string], "riotSlug" | "riotUrl">> =>
        Boolean(champion.riotSlug && champion.riotUrl)
    )
    .map((champion) => ({
      avatarUrl: champion.avatar ? dataFileUrl(champion.avatar) : "",
      championId: champion.id,
      displayName: champion.displayName,
      riotSlug: champion.riotSlug,
      riotUrl: champion.riotUrl,
      searchText: champion.searchText,
      title: champion.title,
    }))
}

export function searchChampionDirectory(
  query: string,
  champions: ChampionDirectoryEntry[],
  limit = champions.length
) {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return []
  }

  const normalizedQuery = trimmedQuery.toLowerCase()
  const normalizedIdentityQuery = normalizeChampionIdentityName(trimmedQuery)
  const scoredMatches: ScoredChampionMatch[] = champions
    .map((champion) => {
      const displayName = champion.displayName.toLowerCase()
      const riotSlug = champion.riotSlug.toLowerCase()
      const normalizedDisplayName = normalizeChampionIdentityName(champion.displayName)
      let rank = Number.POSITIVE_INFINITY

      if (
        normalizedDisplayName === normalizedIdentityQuery ||
        riotSlug === normalizedQuery
      ) {
        rank = 0
      } else if (
        displayName.startsWith(normalizedQuery) ||
        riotSlug.startsWith(normalizedQuery)
      ) {
        rank = 1
      } else if (champion.searchText.includes(normalizedQuery)) {
        rank = 2
      }

      return {
        champion,
        rank,
      }
    })
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank
      }

      if (left.champion.displayName.length !== right.champion.displayName.length) {
        return left.champion.displayName.length - right.champion.displayName.length
      }

      return left.champion.displayName.localeCompare(right.champion.displayName)
    })

  return scoredMatches.slice(0, limit).map((entry) => entry.champion)
}

export function pickChampionMatch(
  query: string,
  champions: ChampionDirectoryEntry[]
) {
  return searchChampionDirectory(query, champions, 1)[0] ?? null
}

export async function findChampionMatch(query: string) {
  const championDirectory = await loadChampionDirectory()
  return pickChampionMatch(query, championDirectory)
}

async function loadChampionPageByPath(pathname: string) {
  const cachedPage = championPageCache.get(pathname)

  if (cachedPage) {
    return cachedPage
  }

  const pagePromise = readJson<ChampionPageData>(pathname)
  championPageCache.set(pathname, pagePromise)
  return pagePromise
}

export async function loadChampionPageByChampionId(championId: string) {
  const index = await loadChampionPagesIndex()
  const entry = index.champions[championId]

  if (!entry) {
    throw new Error(`No champion page is available for champion ${championId}.`)
  }

  return loadChampionPageByPath(entry.pagePath)
}

export async function loadChampionPageBySlug(riotSlug: string) {
  const index = await loadChampionPagesIndex()
  const entry = Object.values(index.champions).find(
    (champion) => champion.riotSlug === riotSlug
  )

  if (!entry) {
    throw new Error(`No champion page is available for slug ${riotSlug}.`)
  }

  return loadChampionPageByPath(entry.pagePath)
}
