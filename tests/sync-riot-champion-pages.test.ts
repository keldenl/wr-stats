import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { RiotChampionListEntry } from "../src/lib/champion-identity"
import {
  backdropManifestPath,
  championPageDataPath,
  championPagesIndexPath,
  type ChampionCatalog,
  type BackdropManifest,
  type ChampionPageData,
  type ChampionPagesIndex,
  type ChampionRecord,
} from "../src/lib/static-data"
import {
  computeRiotChampionListHash,
  hashCanonicalValue,
  normalizeChampionPage,
  syncRiotChampionPages,
} from "../scripts/sync-riot-champion-pages"

const NOW = new Date("2026-03-08T12:00:00.000Z")
const PREVIOUS_NOW = new Date("2026-03-07T12:00:00.000Z")

function buildChampionRecord(
  id: string,
  displayName: string,
  riotEntry: RiotChampionListEntry
): ChampionRecord {
  return {
    alias: displayName.toLowerCase(),
    avatar: `data/avatars/${id}.png`,
    displayName,
    id,
    riotSlug: riotEntry.riotSlug,
    riotUrl: riotEntry.riotUrl,
    searchText: displayName.toLowerCase(),
    title: displayName,
  }
}

function buildRiotEntry(
  riotSlug: string,
  title: string,
  cardImageUrl = `${riotSlug}.jpg`
): RiotChampionListEntry {
  const riotUrl = `https://wildrift.leagueoflegends.com/en-us/champions/${riotSlug}/`

  return {
    cardImageUrl,
    listEntryHash: hashCanonicalValue({
      cardImageUrl,
      riotSlug,
      riotUrl,
      title,
    }),
    riotSlug,
    riotUrl,
    title,
  }
}

function buildRiotPageResponse(riotEntry: RiotChampionListEntry) {
  return {
    analytics: {
      publishDate: "2026-01-16T19:24:39Z",
    },
    blades: [
      {
        backdrop: {
          background: {
            sources: [
              {
                src: `https://cdn.example.com/${riotEntry.riotSlug}.mp4`,
                type: "video/mp4",
              },
            ],
          },
        },
        difficulty: {
          label: "Difficulty",
          maxValue: 3,
          name: "Medium",
          value: 2,
        },
        role: {
          roles: [{ name: "FIGHTER" }],
        },
        subtitle: `${riotEntry.title} subtitle`,
        title: riotEntry.title,
        type: "characterMasthead",
      },
      {
        groups: [
          {
            content: {
              description: {
                body: `${riotEntry.title} ability description`,
              },
              media: {
                sources: [
                  {
                    src: `https://cdn.example.com/${riotEntry.riotSlug}-ability.mp4`,
                    type: "video/mp4",
                  },
                ],
              },
              subtitle: "passive",
            },
            label: `${riotEntry.title} ability`,
            thumbnail: {
              url: `https://cdn.example.com/${riotEntry.riotSlug}-ability.png`,
            },
          },
        ],
        type: "iconTab",
      },
      {
        backdrop: {
          background: {
            url: `https://cdn.example.com/${riotEntry.riotSlug}-wide.png`,
          },
        },
        type: "fullWidthImage",
      },
      {
        groups: [
          {
            content: {
              media: {
                url: `https://cdn.example.com/${riotEntry.riotSlug}-skin.png`,
              },
            },
            label: `${riotEntry.title} skin`,
            thumbnail: {
              url: `https://cdn.example.com/${riotEntry.riotSlug}-skin-thumb.png`,
            },
          },
        ],
        type: "landingMediaCarousel",
      },
    ],
    title: riotEntry.title,
    url: riotEntry.riotUrl,
  }
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function createChampionCatalog(records: Record<string, ChampionRecord>): ChampionCatalog {
  return {
    champions: records,
    generatedAt: PREVIOUS_NOW.toISOString(),
    hash: "catalog-hash",
    version: 1,
  }
}

function createIndex(records: ChampionPagesIndex["champions"], listHash: string): ChampionPagesIndex {
  return {
    champions: records,
    generatedAt: PREVIOUS_NOW.toISOString(),
    listHash,
    sourceLocale: "en-us",
    version: 1,
  }
}

function createFetchMock(args: {
  listEntries: RiotChampionListEntry[]
  pageResponses: Record<string, unknown>
}) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/list/wildrift_champions")) {
      return new Response(
        JSON.stringify({
          data: args.listEntries.map((entry) => ({
            action: {
              payload: {
                url: `/en-us/champions/${entry.riotSlug}/`,
              },
            },
            media: {
              url: entry.cardImageUrl,
            },
            title: entry.title,
          })),
          metadata: {
            totalItems: args.listEntries.length,
          },
        })
      )
    }

    if (url.includes("/page/")) {
      const decoded = decodeURIComponent(url)
      const riotSlug = decoded.split("/champions/")[1]?.split("/")[0]

      if (!riotSlug || !(riotSlug in args.pageResponses)) {
        throw new Error(`Unexpected page fetch for ${url}`)
      }

      return new Response(JSON.stringify(args.pageResponses[riotSlug]))
    }

    throw new Error(`Unexpected fetch ${url}`)
  }
}

describe("syncRiotChampionPages", () => {
  let tempDir = ""
  let dataRoot = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "rankedwr-riot-sync-"))
    dataRoot = path.join(tempDir, "data")
    await mkdir(dataRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  it("skips page fetches when the list hash is unchanged and page files exist", async () => {
    const aatrox = buildRiotEntry("aatrox", "AATROX")
    const storedPage = normalizeChampionPage(
      buildRiotPageResponse(aatrox),
      "10002",
      aatrox,
      PREVIOUS_NOW
    )
    const championCatalog = createChampionCatalog({
      "10002": buildChampionRecord("10002", "Aatrox", aatrox),
    })
    const index = createIndex(
      {
        "10002": {
          cardImageUrl: aatrox.cardImageUrl,
          championId: "10002",
          listEntryHash: aatrox.listEntryHash,
          pageHash: storedPage.hash,
          pagePath: championPageDataPath(aatrox.riotSlug),
          publishDate: storedPage.publishDate,
          riotSlug: aatrox.riotSlug,
          riotUrl: aatrox.riotUrl,
          title: aatrox.title,
        },
      },
      computeRiotChampionListHash([aatrox])
    )

    await writeJson(path.join(dataRoot, "champions.v1.json"), championCatalog)
    await writeJson(path.join(dataRoot, backdropManifestPath().replace(/^data\//, "")), {
      generatedAt: PREVIOUS_NOW.toISOString(),
      latestChampionSlug: aatrox.riotSlug,
      mainBackdropUrl: storedPage.mastheadVideoUrl,
      version: 1,
    } satisfies BackdropManifest)
    await writeJson(
      path.join(dataRoot, championPagesIndexPath().replace(/^data\//, "")),
      index
    )
    await writeJson(
      path.join(dataRoot, championPageDataPath(aatrox.riotSlug).replace(/^data\//, "")),
      storedPage
    )

    const summary = await syncRiotChampionPages({
      dataRoot,
      fetchImpl: createFetchMock({
        listEntries: [aatrox],
        pageResponses: {},
      }) as typeof fetch,
      now: NOW,
    })

    expect(summary.fetchedPages).toBe(0)
    expect(summary.changed).toBe(false)
    expect(summary.backdropManifestChanged).toBe(false)
    expect(summary.indexChanged).toBe(false)
    expect(summary.pageFilesWritten).toBe(0)
  })

  it("fetches only missing page files when the list hash is unchanged", async () => {
    const aatrox = buildRiotEntry("aatrox", "AATROX")
    const fetchedPage = normalizeChampionPage(
      buildRiotPageResponse(aatrox),
      "10002",
      aatrox,
      NOW
    )
    const championCatalog = createChampionCatalog({
      "10002": buildChampionRecord("10002", "Aatrox", aatrox),
    })
    const index = createIndex(
      {
        "10002": {
          cardImageUrl: aatrox.cardImageUrl,
          championId: "10002",
          listEntryHash: aatrox.listEntryHash,
          pageHash: fetchedPage.hash,
          pagePath: championPageDataPath(aatrox.riotSlug),
          publishDate: fetchedPage.publishDate,
          riotSlug: aatrox.riotSlug,
          riotUrl: aatrox.riotUrl,
          title: aatrox.title,
        },
      },
      computeRiotChampionListHash([aatrox])
    )

    await writeJson(path.join(dataRoot, "champions.v1.json"), championCatalog)
    await writeJson(
      path.join(dataRoot, championPagesIndexPath().replace(/^data\//, "")),
      index
    )

    const summary = await syncRiotChampionPages({
      dataRoot,
      fetchImpl: createFetchMock({
        listEntries: [aatrox],
        pageResponses: {
          [aatrox.riotSlug]: buildRiotPageResponse(aatrox),
        },
      }) as typeof fetch,
      now: NOW,
    })

    const storedPage = JSON.parse(
      await readFile(
        path.join(dataRoot, championPageDataPath(aatrox.riotSlug).replace(/^data\//, "")),
        "utf8"
      )
    ) as ChampionPageData

    expect(summary.fetchedPages).toBe(1)
    expect(summary.backdropManifestChanged).toBe(true)
    expect(summary.pageFilesWritten).toBe(1)
    expect(storedPage.hash).toBe(fetchedPage.hash)

    const backdropManifest = JSON.parse(
      await readFile(path.join(dataRoot, backdropManifestPath().replace(/^data\//, "")), "utf8")
    ) as BackdropManifest

    expect(backdropManifest.latestChampionSlug).toBe("aatrox")
    expect(backdropManifest.mainBackdropUrl).toBe(fetchedPage.mastheadVideoUrl)
  })

  it("fetches only changed champions when the Riot list changes", async () => {
    const previousAatrox = buildRiotEntry("aatrox", "AATROX", "aatrox-v1.jpg")
    const nextAatrox = buildRiotEntry("aatrox", "AATROX", "aatrox-v2.jpg")
    const ahri = buildRiotEntry("ahri", "AHRI", "ahri-v1.jpg")
    const oldAatroxPage = normalizeChampionPage(
      buildRiotPageResponse(previousAatrox),
      "10002",
      previousAatrox,
      PREVIOUS_NOW
    )
    const oldAhriPage = normalizeChampionPage(
      buildRiotPageResponse(ahri),
      "10003",
      ahri,
      PREVIOUS_NOW
    )
    const championCatalog = createChampionCatalog({
      "10002": buildChampionRecord("10002", "Aatrox", previousAatrox),
      "10003": buildChampionRecord("10003", "Ahri", ahri),
    })
    const index = createIndex(
      {
        "10002": {
          cardImageUrl: previousAatrox.cardImageUrl,
          championId: "10002",
          listEntryHash: previousAatrox.listEntryHash,
          pageHash: oldAatroxPage.hash,
          pagePath: championPageDataPath(previousAatrox.riotSlug),
          publishDate: oldAatroxPage.publishDate,
          riotSlug: previousAatrox.riotSlug,
          riotUrl: previousAatrox.riotUrl,
          title: previousAatrox.title,
        },
        "10003": {
          cardImageUrl: ahri.cardImageUrl,
          championId: "10003",
          listEntryHash: ahri.listEntryHash,
          pageHash: oldAhriPage.hash,
          pagePath: championPageDataPath(ahri.riotSlug),
          publishDate: oldAhriPage.publishDate,
          riotSlug: ahri.riotSlug,
          riotUrl: ahri.riotUrl,
          title: ahri.title,
        },
      },
      computeRiotChampionListHash([previousAatrox, ahri])
    )

    const aatroxPagePath = path.join(
      dataRoot,
      championPageDataPath(previousAatrox.riotSlug).replace(/^data\//, "")
    )

    await writeJson(path.join(dataRoot, "champions.v1.json"), championCatalog)
    await writeJson(
      path.join(dataRoot, championPagesIndexPath().replace(/^data\//, "")),
      index
    )
    await writeJson(aatroxPagePath, oldAatroxPage)
    await writeJson(
      path.join(dataRoot, championPageDataPath(ahri.riotSlug).replace(/^data\//, "")),
      oldAhriPage
    )

    const beforeAatroxPage = await readFile(aatroxPagePath, "utf8")
    const summary = await syncRiotChampionPages({
      dataRoot,
      fetchImpl: createFetchMock({
        listEntries: [nextAatrox, ahri],
        pageResponses: {
          [nextAatrox.riotSlug]: buildRiotPageResponse(nextAatrox),
        },
      }) as typeof fetch,
      now: NOW,
    })
    const afterAatroxPage = await readFile(aatroxPagePath, "utf8")
    const nextIndex = JSON.parse(
      await readFile(
        path.join(dataRoot, championPagesIndexPath().replace(/^data\//, "")),
        "utf8"
      )
    ) as ChampionPagesIndex

    expect(summary.listChanged).toBe(true)
    expect(summary.fetchedPages).toBe(1)
    expect(summary.backdropManifestChanged).toBe(true)
    expect(summary.pageFilesWritten).toBe(0)
    expect(beforeAatroxPage).toBe(afterAatroxPage)
    expect(nextIndex.champions["10002"].listEntryHash).toBe(nextAatrox.listEntryHash)
    expect(nextIndex.champions["10003"].listEntryHash).toBe(ahri.listEntryHash)
  })
})
