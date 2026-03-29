import { createHash } from "node:crypto"
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  buildChampionRiotMapping,
  type RiotChampionListEntry,
} from "../src/lib/champion-identity"
import {
  STATIC_DATA_VERSION,
  backdropManifestPath,
  championPageDataPath,
  championPagesIndexPath,
  sortNumericKeys,
  stableSerialize,
  type BackdropManifest,
  type ChampionCatalog,
  type ChampionPageData,
  type ChampionPageIndexRecord,
  type ChampionPagesIndex,
} from "../src/lib/static-data"

const RIOT_PUBLISHING_BASE_URL = "https://content.publishing.riotgames.com"
const RIOT_WEBSITE_BASE_URL = "https://wildrift.leagueoflegends.com"
const RIOT_LIST_LOCALE = "en_US"
const RIOT_INDEX_LOCALE = "en-us"
const RIOT_LIST_LIMIT = 200
const RIOT_LIST_URL = `${RIOT_PUBLISHING_BASE_URL}/publishing-content/v2.0/public/channel/wildrift_website/list/wildrift_champions`
const RIOT_PAGE_URL = `${RIOT_PUBLISHING_BASE_URL}/publishing-content/v2.0/public/channel/wildrift_website/page`

type SyncOptions = {
  dataRoot?: string
  fetchImpl?: typeof fetch
  now?: Date
}

type SyncSummary = {
  backdropManifestChanged: boolean
  changed: boolean
  championCatalogChanged: boolean
  fetchedPages: number
  indexChanged: boolean
  listChanged: boolean
  listHash: string
  pageFilesDeleted: number
  pageFilesWritten: number
}

type RiotChampionListResponse = {
  data?: RiotChampionListItem[]
  metadata?: {
    totalItems?: number
  }
}

type RiotChampionListItem = {
  title?: string
  media?: {
    url?: string
  }
  action?: {
    payload?: {
      url?: string
    }
  }
}

type RiotChampionPageResponse = {
  url?: string
  title?: string
  analytics?: {
    publishDate?: string
  }
  blades?: RiotBlade[]
}

type RiotBlade = {
  type?: string
  title?: string
  subtitle?: string
  role?: {
    roles?: Array<{
      name?: string
    }>
  }
  difficulty?: {
    label?: string
    value?: number
    maxValue?: number
    name?: string
  }
  backdrop?: {
    background?: RiotMedia
  }
  groups?: RiotBladeGroup[]
}

type RiotBladeGroup = {
  label?: string
  thumbnail?: RiotImage
  content?: {
    title?: string
    subtitle?: string
    media?: RiotMedia
    description?: {
      body?: string
    }
  }
}

type RiotImage = {
  url?: string
}

type RiotMedia = {
  url?: string
  sources?: Array<{
    src?: string
    type?: string
  }>
}

type StoredChampionPageMetadata = {
  mastheadVideoUrl: string
  pageHash: string
  publishDate?: string
}

export function hashCanonicalValue(value: unknown) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex")
}

async function readJsonFile<T>(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }

    throw error
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function fileExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function riotSlugFromUrl(riotUrlPath: string) {
  const pathname = riotUrlPath.replace(/^https?:\/\/[^/]+/, "")
  const segments = pathname.split("/").filter(Boolean)
  const championSegmentIndex = segments.findIndex((segment) => segment === "champions")
  const riotSlug = segments[championSegmentIndex + 1]

  if (!riotSlug) {
    throw new Error(`Unable to extract Riot slug from URL ${riotUrlPath}.`)
  }

  return riotSlug
}

function toAbsoluteRiotUrl(riotUrlPath: string) {
  return riotUrlPath.startsWith("http")
    ? riotUrlPath
    : new URL(riotUrlPath, RIOT_WEBSITE_BASE_URL).toString()
}

export function normalizeRiotChampionListEntry(item: RiotChampionListItem) {
  const title = item.title?.trim()
  const riotUrlPath = item.action?.payload?.url?.trim()

  if (!title || !riotUrlPath) {
    throw new Error("Riot champion list entry is missing title or URL.")
  }

  const riotSlug = riotSlugFromUrl(riotUrlPath)
  const riotUrl = toAbsoluteRiotUrl(riotUrlPath)
  const cardImageUrl = item.media?.url?.trim() ?? ""

  return {
    riotSlug,
    riotUrl,
    title,
    cardImageUrl,
    listEntryHash: hashCanonicalValue({
      cardImageUrl,
      riotSlug,
      riotUrl,
      title,
    }),
  } satisfies RiotChampionListEntry
}

export function computeRiotChampionListHash(riotEntries: RiotChampionListEntry[]) {
  return hashCanonicalValue(
    [...riotEntries]
      .sort((left, right) => left.riotSlug.localeCompare(right.riotSlug))
      .map(({ cardImageUrl, riotSlug, riotUrl, title }) => ({
        cardImageUrl,
        riotSlug,
        riotUrl,
        title,
      }))
  )
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string) {
  const response = await fetchImpl(url)

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`)
  }

  return (await response.json()) as T
}

export async function fetchRiotChampionList(fetchImpl: typeof fetch) {
  const riotEntries: RiotChampionListEntry[] = []
  let from = 0
  let totalItems = Number.POSITIVE_INFINITY

  while (from < totalItems) {
    const listUrl = new URL(RIOT_LIST_URL)
    listUrl.searchParams.set("locale", RIOT_LIST_LOCALE)
    listUrl.searchParams.set("from", String(from))
    listUrl.searchParams.set("limit", String(RIOT_LIST_LIMIT))

    const response = await fetchJson<RiotChampionListResponse>(fetchImpl, listUrl.toString())
    const items = response.data ?? []
    totalItems = response.metadata?.totalItems ?? items.length
    riotEntries.push(...items.map((item) => normalizeRiotChampionListEntry(item)))

    if (items.length === 0) {
      break
    }

    from += items.length
  }

  if (riotEntries.length === 0) {
    throw new Error("Riot champion list endpoint returned no champions.")
  }

  return riotEntries
}

function riotPageUrlForSlug(riotSlug: string) {
  const encodedPath = encodeURIComponent(`/champions/${riotSlug}/`)
  const pageUrl = new URL(`${RIOT_PAGE_URL}/${encodedPath}`)
  pageUrl.searchParams.set("locale", RIOT_LIST_LOCALE)
  return pageUrl.toString()
}

function firstVideoSourceUrl(media?: RiotMedia) {
  return (
    media?.sources?.find((source) => source.src && source.type === "video/mp4")?.src ??
    media?.sources?.find((source) => source.src)?.src ??
    ""
  )
}

export function normalizeChampionPage(
  page: RiotChampionPageResponse,
  championId: string,
  riotEntry: RiotChampionListEntry,
  now: Date
) {
  const blades = page.blades ?? []
  const masthead = blades.find((blade) => blade.type === "characterMasthead")

  if (!masthead) {
    throw new Error(`Champion page ${riotEntry.riotSlug} is missing a character masthead.`)
  }

  const mastheadVideoUrl = firstVideoSourceUrl(masthead.backdrop?.background)

  if (!mastheadVideoUrl) {
    throw new Error(`Champion page ${riotEntry.riotSlug} is missing a masthead video.`)
  }

  const abilitiesBlade = blades.find((blade) => blade.type === "iconTab")
  const fullWidthImageBlade = blades.find((blade) => blade.type === "fullWidthImage")
  const skinsBlade = blades.find((blade) => blade.type === "landingMediaCarousel")

  const normalizedPage = {
    championId,
    riotSlug: riotEntry.riotSlug,
    riotUrl: riotEntry.riotUrl,
    title: page.title?.trim() || masthead.title?.trim() || riotEntry.title,
    subtitle: masthead.subtitle?.trim() ?? "",
    roles:
      masthead.role?.roles
        ?.map((role) => role.name?.trim() ?? "")
        .filter((role) => role.length > 0) ?? [],
    difficulty:
      masthead.difficulty &&
      masthead.difficulty.label &&
      masthead.difficulty.name &&
      masthead.difficulty.value != null &&
      masthead.difficulty.maxValue != null
        ? {
            label: masthead.difficulty.label,
            maxValue: masthead.difficulty.maxValue,
            name: masthead.difficulty.name,
            value: masthead.difficulty.value,
          }
        : null,
    mastheadVideoUrl,
    fullWidthImageUrl: fullWidthImageBlade?.backdrop?.background?.url?.trim() ?? null,
    abilities:
      abilitiesBlade?.groups?.map((group) => ({
        description: group.content?.description?.body?.trim() ?? "",
        iconUrl: group.thumbnail?.url?.trim() ?? "",
        label: group.label?.trim() ?? group.content?.title?.trim() ?? "",
        subtitle: group.content?.subtitle?.trim() ?? "",
        videoUrl: firstVideoSourceUrl(group.content?.media),
      })) ?? [],
    skins:
      skinsBlade?.groups?.map((group) => ({
        imageUrl: group.content?.media?.url?.trim() ?? "",
        label: group.label?.trim() ?? "",
        thumbnailUrl: group.thumbnail?.url?.trim() ?? "",
      })) ?? [],
    publishDate: page.analytics?.publishDate?.trim() || undefined,
  }

  const hash = hashCanonicalValue(normalizedPage)

  return {
    version: STATIC_DATA_VERSION,
    generatedAt: now.toISOString(),
    ...normalizedPage,
    hash,
  } satisfies ChampionPageData
}

function enrichChampionCatalog(
  championCatalog: ChampionCatalog,
  mapping: Record<string, RiotChampionListEntry>
) {
  return {
    ...championCatalog,
    champions: Object.fromEntries(
      sortNumericKeys(Object.keys(championCatalog.champions)).map((championId) => {
        const champion = championCatalog.champions[championId]
        const riotEntry = mapping[championId]

        return [
          championId,
          riotEntry
            ? {
                ...champion,
                riotSlug: riotEntry.riotSlug,
                riotUrl: riotEntry.riotUrl,
              }
            : {
                ...champion,
                riotSlug: undefined,
                riotUrl: undefined,
              },
        ]
      })
    ),
  } satisfies ChampionCatalog
}

async function readStoredChampionPageMetadata(
  filePath: string
): Promise<StoredChampionPageMetadata | null> {
  const pageFile = await readJsonFile<ChampionPageData>(filePath)

  if (!pageFile) {
    return null
  }

  return {
    mastheadVideoUrl: pageFile.mastheadVideoUrl,
    pageHash: pageFile.hash,
    publishDate: pageFile.publishDate,
  }
}

function pickLatestChampionPageRecord(
  records: ChampionPageIndexRecord[]
): ChampionPageIndexRecord | null {
  return (
    records
      .filter((record) => record.publishDate && Number.isFinite(Date.parse(record.publishDate)))
      .sort((left, right) => {
        const publishDateDelta =
          Date.parse(right.publishDate ?? "") - Date.parse(left.publishDate ?? "")

        if (publishDateDelta !== 0) {
          return publishDateDelta
        }

        return left.riotSlug.localeCompare(right.riotSlug)
      })[0] ?? null
  )
}

export function planChampionPageFetches(args: {
  existingIndex: ChampionPagesIndex | null
  listChanged: boolean
  mapping: Record<string, RiotChampionListEntry>
  pageExistsBySlug: Record<string, boolean>
}) {
  const existingRecordsBySlug = new Map(
    Object.values(args.existingIndex?.champions ?? {}).map((record) => [record.riotSlug, record])
  )
  const championIdsToFetch: string[] = []

  for (const championId of sortNumericKeys(Object.keys(args.mapping))) {
    const riotEntry = args.mapping[championId]
    const baseRecord = existingRecordsBySlug.get(riotEntry.riotSlug) ?? null
    const pageExists = args.pageExistsBySlug[riotEntry.riotSlug] ?? false

    if (!pageExists || !baseRecord) {
      championIdsToFetch.push(championId)
      continue
    }

    if (args.listChanged && baseRecord.listEntryHash !== riotEntry.listEntryHash) {
      championIdsToFetch.push(championId)
    }
  }

  return championIdsToFetch
}

export async function syncRiotChampionPages({
  dataRoot = path.join(process.cwd(), "public", "data"),
  fetchImpl = fetch,
  now = new Date(),
}: SyncOptions = {}) {
  const championsPath = path.join(dataRoot, "champions.v1.json")
  const backdropPath = path.join(dataRoot, backdropManifestPath().replace(/^data\//, ""))
  const indexPath = path.join(dataRoot, championPagesIndexPath().replace(/^data\//, ""))
  const championCatalog = await readJsonFile<ChampionCatalog>(championsPath)

  if (!championCatalog) {
    throw new Error(`Champion catalog missing at ${championsPath}.`)
  }

  const riotEntries = await fetchRiotChampionList(fetchImpl)
  const mapping = buildChampionRiotMapping(championCatalog.champions, riotEntries)
  const enrichedChampionCatalog = enrichChampionCatalog(championCatalog, mapping)
  const existingIndex = await readJsonFile<ChampionPagesIndex>(indexPath)
  const listHash = computeRiotChampionListHash(riotEntries)
  const listChanged = existingIndex?.listHash !== listHash
  const pageExistsBySlug: Record<string, boolean> = {}

  for (const riotEntry of Object.values(mapping)) {
    const pagePath = path.join(
      dataRoot,
      championPageDataPath(riotEntry.riotSlug).replace(/^data\//, "")
    )
    pageExistsBySlug[riotEntry.riotSlug] = await fileExists(pagePath)
  }

  const championIdsToFetch = planChampionPageFetches({
    existingIndex,
    listChanged,
    mapping,
    pageExistsBySlug,
  })
  const fetchedPagesBySlug = new Map<string, ChampionPageData>()

  for (const championId of championIdsToFetch) {
    const riotEntry = mapping[championId]
    const page = await fetchJson<RiotChampionPageResponse>(
      fetchImpl,
      riotPageUrlForSlug(riotEntry.riotSlug)
    )
    fetchedPagesBySlug.set(
      riotEntry.riotSlug,
      normalizeChampionPage(page, championId, riotEntry, now)
    )
  }

  const existingRecordsBySlug = new Map(
    Object.values(existingIndex?.champions ?? {}).map((record) => [record.riotSlug, record])
  )
  const nextChampionPageIndexRecords: Record<string, ChampionPageIndexRecord> = {}

  for (const championId of sortNumericKeys(Object.keys(mapping))) {
    const riotEntry = mapping[championId]
    const storedPagePath = path.join(
      dataRoot,
      championPageDataPath(riotEntry.riotSlug).replace(/^data\//, "")
    )
    const fetchedPage = fetchedPagesBySlug.get(riotEntry.riotSlug)
    let storedMetadata: StoredChampionPageMetadata | null = null

    if (!fetchedPage) {
      const existingRecord = existingRecordsBySlug.get(riotEntry.riotSlug)

      storedMetadata = existingRecord
        ? {
            mastheadVideoUrl: (
              await readJsonFile<ChampionPageData>(storedPagePath)
            )?.mastheadVideoUrl ?? "",
            pageHash: existingRecord.pageHash,
            publishDate: existingRecord.publishDate,
          }
        : await readStoredChampionPageMetadata(storedPagePath)
    }

    const metadata = fetchedPage
      ? {
          mastheadVideoUrl: fetchedPage.mastheadVideoUrl,
          pageHash: fetchedPage.hash,
          publishDate: fetchedPage.publishDate,
        }
      : storedMetadata

    if (!metadata) {
      throw new Error(`Missing stored page metadata for ${riotEntry.riotSlug}.`)
    }

    nextChampionPageIndexRecords[championId] = {
      cardImageUrl: riotEntry.cardImageUrl,
      championId,
      listEntryHash: riotEntry.listEntryHash,
      pageHash: metadata.pageHash,
      pagePath: championPageDataPath(riotEntry.riotSlug),
      publishDate: metadata.publishDate,
      riotSlug: riotEntry.riotSlug,
      riotUrl: riotEntry.riotUrl,
      title: riotEntry.title,
    }
  }

  const nextIndexBase = {
    champions: nextChampionPageIndexRecords,
    listHash,
    sourceLocale: RIOT_INDEX_LOCALE,
    version: STATIC_DATA_VERSION,
  } satisfies Omit<ChampionPagesIndex, "generatedAt">

  const championCatalogChanged =
    stableSerialize(championCatalog) !== stableSerialize(enrichedChampionCatalog)
  const indexChanged =
    stableSerialize(
      existingIndex
        ? {
            ...existingIndex,
            generatedAt: "",
          }
        : null
    ) !==
    stableSerialize({
      ...nextIndexBase,
      generatedAt: "",
    })
  const nextIndex = {
    ...nextIndexBase,
    generatedAt:
      indexChanged || !existingIndex ? now.toISOString() : existingIndex.generatedAt,
  } satisfies ChampionPagesIndex
  const latestChampionRecord = pickLatestChampionPageRecord(
    Object.values(nextChampionPageIndexRecords)
  )

  if (!latestChampionRecord) {
    throw new Error("Unable to determine the latest published champion page.")
  }

  const latestChampionPage =
    fetchedPagesBySlug.get(latestChampionRecord.riotSlug) ??
    (await readJsonFile<ChampionPageData>(
      path.join(dataRoot, latestChampionRecord.pagePath.replace(/^data\//, ""))
    ))

  if (!latestChampionPage?.mastheadVideoUrl) {
    throw new Error(
      `Missing masthead video for latest champion ${latestChampionRecord.riotSlug}.`
    )
  }

  const existingBackdropManifest = await readJsonFile<BackdropManifest>(backdropPath)
  const nextBackdropManifest = {
    generatedAt: now.toISOString(),
    latestChampionSlug: latestChampionRecord.riotSlug,
    mainBackdropUrl: latestChampionPage.mastheadVideoUrl,
    version: STATIC_DATA_VERSION,
  } satisfies BackdropManifest
  const backdropManifestChanged =
    stableSerialize(
      existingBackdropManifest
        ? {
            ...existingBackdropManifest,
            generatedAt: "",
          }
        : null
    ) !==
    stableSerialize({
      ...nextBackdropManifest,
      generatedAt: "",
    })
  const desiredSlugs = new Set(Object.values(mapping).map((entry) => entry.riotSlug))
  const stalePagePaths = Object.values(existingIndex?.champions ?? {})
    .filter((record) => !desiredSlugs.has(record.riotSlug))
    .map((record) => path.join(dataRoot, record.pagePath.replace(/^data\//, "")))
  let pageFilesWritten = 0

  if (championCatalogChanged) {
    await writeJsonFile(championsPath, enrichedChampionCatalog)
  }

  for (const fetchedPage of fetchedPagesBySlug.values()) {
    const pageFilePath = path.join(
      dataRoot,
      championPageDataPath(fetchedPage.riotSlug).replace(/^data\//, "")
    )
    const existingPage = await readJsonFile<ChampionPageData>(pageFilePath)

    if (existingPage?.hash === fetchedPage.hash) {
      continue
    }

    await writeJsonFile(pageFilePath, fetchedPage)
    pageFilesWritten += 1
  }

  for (const stalePagePath of stalePagePaths) {
    await rm(stalePagePath, { force: true })
  }

  if (indexChanged) {
    await writeJsonFile(indexPath, nextIndex)
  }

  if (backdropManifestChanged) {
    await writeJsonFile(backdropPath, nextBackdropManifest)
  }

  return {
    changed:
      championCatalogChanged ||
      indexChanged ||
      backdropManifestChanged ||
      pageFilesWritten > 0 ||
      stalePagePaths.length > 0,
    backdropManifestChanged,
    championCatalogChanged,
    fetchedPages: championIdsToFetch.length,
    indexChanged,
    listChanged,
    listHash,
    pageFilesDeleted: stalePagePaths.length,
    pageFilesWritten,
  } satisfies SyncSummary
}

async function main() {
  const summary = await syncRiotChampionPages()
  console.log(`SYNC_SUMMARY ${JSON.stringify(summary)}`)
}

if (import.meta.main) {
  await main()
}
