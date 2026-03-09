import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { readFileSync } from "node:fs"

import {
  ALL_LANE,
  getLeaderboardEntriesForLaneFilter,
  getLeaderboardEntryRankKey,
  getLeaderboardRankChanges,
  loadChampionHeroStats,
  loadLeaderboards,
  resetTencentLolmCacheForTests,
} from "../src/lib/tencent-lolm"
import { calculateChampionStrengthScore } from "../src/lib/champion-strength"
import { sortLaneKeys, type LeaderboardEntry, type LaneId } from "../src/lib/tencent-lolm"

const manifest = {
  championsPath: "data/champions.v1.json",
  generatedAt: "2026-03-09T03:16:50.000Z",
  latestPath: "data/latest.v1.json",
  latestSnapshotId: "snapshot-current",
  snapshots: [
    {
      fetchedAt: "2026-03-09T03:16:50.000Z",
      hash: "current-hash",
      id: "snapshot-current",
      path: "data/latest.v1.json",
      rowCount: 6,
      statDate: "20260308",
      tierKeys: ["0", "1"],
    },
    {
      fetchedAt: "2026-03-08T06:23:09.000Z",
      hash: "previous-hash",
      id: "snapshot-previous",
      path: "data/snapshots/snapshot-previous.json",
      rowCount: 5,
      statDate: "20260307",
      tierKeys: ["0", "1"],
    },
  ],
  version: 1,
}

const championCatalog = {
  champions: {
    "10001": {
      alias: "alpha",
      avatar: "data/avatars/10001.png",
      displayName: "Alpha",
      id: "10001",
      riotSlug: "alpha",
      searchText: "alpha",
      title: "Alpha",
    },
    "10002": {
      alias: "bravo",
      avatar: "data/avatars/10002.png",
      displayName: "Bravo",
      id: "10002",
      riotSlug: "bravo",
      searchText: "bravo",
      title: "Bravo",
    },
    "10003": {
      alias: "charlie",
      avatar: "data/avatars/10003.png",
      displayName: "Charlie",
      id: "10003",
      riotSlug: "charlie",
      searchText: "charlie",
      title: "Charlie",
    },
    "10004": {
      alias: "delta",
      avatar: "data/avatars/10004.png",
      displayName: "Delta",
      id: "10004",
      riotSlug: "delta",
      searchText: "delta",
      title: "Delta",
    },
    "10005": {
      alias: "echo",
      avatar: "data/avatars/10005.png",
      displayName: "Echo",
      id: "10005",
      riotSlug: "echo",
      searchText: "echo",
      title: "Echo",
    },
  },
  generatedAt: "2026-03-09T03:16:50.000Z",
  hash: "champions-hash",
  version: 1,
}

const currentSnapshot = {
  fetchedAt: "2026-03-09T03:16:50.000Z",
  hash: "current-hash",
  snapshotId: "snapshot-current",
  statDate: "20260308",
  tiers: {
    "0": {},
    "1": {
      "1": [
        ["10001", 55, 5, 1],
        ["10002", 53, 4, 1],
        ["10004", 49, 2, 0.5],
      ],
      "2": [
        ["10005", 57, 8, 2],
        ["10001", 54, 3, 0.5],
        ["10003", 50, 2, 0.4],
      ],
    },
  },
  version: 1,
}

const previousSnapshot = {
  fetchedAt: "2026-03-08T06:23:09.000Z",
  hash: "previous-hash",
  snapshotId: "snapshot-previous",
  statDate: "20260307",
  tiers: {
    "0": {},
    "1": {
      "1": [
        ["10002", 56, 4, 1],
        ["10001", 54, 5, 1],
      ],
      "2": [
        ["10005", 58, 8, 2],
        ["10003", 52, 2, 0.4],
        ["10001", 51, 3, 0.5],
      ],
    },
  },
  version: 1,
}

describe("tencent lolm loaders", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    resetTencentLolmCacheForTests()

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.endsWith("data/manifest.v1.json")) {
        return new Response(JSON.stringify(manifest))
      }

      if (url.endsWith("data/champions.v1.json")) {
        return new Response(JSON.stringify(championCatalog))
      }

      if (url.endsWith("data/latest.v1.json")) {
        return new Response(JSON.stringify(currentSnapshot))
      }

      if (url.endsWith("data/snapshots/snapshot-previous.json")) {
        return new Response(JSON.stringify(previousSnapshot))
      }

      throw new Error(`Unexpected fetch ${url}`)
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetTencentLolmCacheForTests()
  })

  it("loads the previous snapshot and computes lane-specific and all-lane rank movement", async () => {
    const payload = await loadLeaderboards()

    expect(payload.previousSnapshotId).toBe("snapshot-previous")
    expect(payload.previousEntriesByTier).not.toBeNull()
    expect(payload.entriesByTier["1"]?.["1"]?.[0]?.championId).toBe("10001")

    const currentLaneEntries = getLeaderboardEntriesForLaneFilter(
      payload.entriesByTier["1"],
      "1"
    )
    const previousLaneEntries = getLeaderboardEntriesForLaneFilter(
      payload.previousEntriesByTier?.["1"],
      "1"
    )
    const laneRankChanges = getLeaderboardRankChanges(
      currentLaneEntries,
      previousLaneEntries
    )

    expect(
      laneRankChanges.get(
        getLeaderboardEntryRankKey(currentLaneEntries[0]!)
      )
    ).toEqual({
      currentRank: 1,
      previousRank: 2,
      delta: 1,
    })
    expect(
      laneRankChanges.get(
        getLeaderboardEntryRankKey(currentLaneEntries[1]!)
      )
    ).toEqual({
      currentRank: 2,
      previousRank: 1,
      delta: -1,
    })
    expect(
      laneRankChanges.get(
        getLeaderboardEntryRankKey(currentLaneEntries[2]!)
      )
    ).toEqual({
      currentRank: 3,
      previousRank: null,
      delta: null,
    })

    const currentAllEntries = getLeaderboardEntriesForLaneFilter(
      payload.entriesByTier["1"],
      ALL_LANE
    )
    const previousAllEntries = getLeaderboardEntriesForLaneFilter(
      payload.previousEntriesByTier?.["1"],
      ALL_LANE
    )
    const allRankChanges = getLeaderboardRankChanges(
      currentAllEntries,
      previousAllEntries
    )

    const echoSoloEntry = currentAllEntries.find(
      (entry) => entry.championId === "10005" && entry.lane === "2"
    )
    const alphaMidEntry = currentAllEntries.find(
      (entry) => entry.championId === "10001" && entry.lane === "1"
    )
    const alphaSoloEntry = currentAllEntries.find(
      (entry) => entry.championId === "10001" && entry.lane === "2"
    )
    const bravoMidEntry = currentAllEntries.find(
      (entry) => entry.championId === "10002" && entry.lane === "1"
    )
    const deltaMidEntry = currentAllEntries.find(
      (entry) => entry.championId === "10004" && entry.lane === "1"
    )

    expect(
      allRankChanges.get(
        getLeaderboardEntryRankKey(echoSoloEntry!)
      )
    ).toEqual({
      currentRank: 1,
      previousRank: 1,
      delta: 0,
    })
    expect(
      allRankChanges.get(
        getLeaderboardEntryRankKey(alphaMidEntry!)
      )
    ).toEqual({
      currentRank: 2,
      previousRank: 3,
      delta: 1,
    })
    expect(
      allRankChanges.get(
        getLeaderboardEntryRankKey(alphaSoloEntry!)
      )
    ).toEqual({
      currentRank: 3,
      previousRank: 5,
      delta: 2,
    })
    expect(
      allRankChanges.get(
        getLeaderboardEntryRankKey(bravoMidEntry!)
      )
    ).toEqual({
      currentRank: 4,
      previousRank: 2,
      delta: -2,
    })
    expect(
      allRankChanges.get(
        getLeaderboardEntryRankKey(deltaMidEntry!)
      )
    ).toEqual({
      currentRank: 6,
      previousRank: null,
      delta: null,
    })
  })

  it("builds champion page stats with per-role rank movement", async () => {
    const payload = await loadChampionHeroStats("10001")

    expect(payload.previousSnapshotId).toBe("snapshot-previous")
    expect(payload.buckets.map((bucket) => bucket.bucket)).toEqual(["1"])

    const bucket = payload.buckets[0]
    expect(bucket?.roles.map((role) => role.lane)).toEqual(["1", "2"])
    expect(bucket?.roles[0]).toMatchObject({
      lane: "1",
      rank: 1,
      previousRank: 2,
      rankDelta: 1,
    })
    expect(bucket?.roles[1]).toMatchObject({
      lane: "2",
      rank: 2,
      previousRank: 3,
      rankDelta: 1,
    })

    const unchangedPayload = await loadChampionHeroStats("10005")
    const unchangedRole = unchangedPayload.buckets[0]?.roles[0]

    expect(unchangedRole).toMatchObject({
      lane: "2",
      rank: 1,
      previousRank: 1,
      rankDelta: 0,
    })
  })

  it("computes movement against the shared cohort instead of previous-only rows", () => {
    const currentEntries = [
      {
        banRate: 1,
        championId: "10001",
        lane: "1",
        pickRate: 3,
        strengthScore: 58,
        winRate: 51,
      },
      {
        banRate: 0.2,
        championId: "10002",
        lane: "1",
        pickRate: 1,
        strengthScore: 54,
        winRate: 54,
      },
    ]
    const previousEntries = [
      {
        banRate: 0.2,
        championId: "10002",
        lane: "1",
        pickRate: 1,
        strengthScore: 56,
        winRate: 54,
      },
      {
        banRate: 1,
        championId: "10001",
        lane: "1",
        pickRate: 3,
        strengthScore: 55,
        winRate: 51,
      },
      {
        banRate: 0,
        championId: "10003",
        lane: "1",
        pickRate: 0.5,
        strengthScore: 57,
        winRate: 49,
      },
    ]

    const rankChanges = getLeaderboardRankChanges(
      currentEntries as Parameters<typeof getLeaderboardRankChanges>[0],
      previousEntries as Parameters<typeof getLeaderboardRankChanges>[1]
    )

    expect(rankChanges.get("10001:1")).toEqual({
      currentRank: 1,
      previousRank: 2,
      delta: 1,
    })
    expect(rankChanges.get("10002:1")).toEqual({
      currentRank: 2,
      previousRank: 1,
      delta: -1,
    })
  })

  it("matches the real March 7 to March 8 leaderboard cohort movement", () => {
    const manifest = JSON.parse(readFileSync("public/data/manifest.v1.json", "utf8"))
    const champions = JSON.parse(readFileSync("public/data/champions.v1.json", "utf8")).champions
    const currentSnapshot = JSON.parse(
      readFileSync(`public/${manifest.snapshots[0].path}`, "utf8")
    )
    const previousSnapshot = JSON.parse(
      readFileSync(`public/${manifest.snapshots[1].path}`, "utf8")
    )

    function toEntries(snapshot: typeof currentSnapshot, tier: string, lane: "all" | LaneId) {
      const lanes =
        lane === "all"
          ? sortLaneKeys(Object.keys(snapshot.tiers[tier] ?? {}) as LaneId[])
          : [lane]

      return lanes.flatMap((laneKey) =>
        (snapshot.tiers[tier]?.[laneKey] ?? []).map(
          ([championId, winRate, pickRate, banRate]: [
            string,
            number,
            number,
            number,
          ]): LeaderboardEntry => ({
            alias: champions[championId]?.alias ?? "",
            avatar: "",
            banRate,
            championId,
            id: `${snapshot.snapshotId}-${tier}-${laneKey}-${championId}`,
            lane: laneKey,
            laneLabel: laneKey,
            name: champions[championId]?.displayName ?? championId,
            pickRate,
            riotSlug: champions[championId]?.riotSlug ?? "",
            searchText: "",
            strengthScore: calculateChampionStrengthScore(winRate, pickRate, banRate),
            strengthTier: "A",
            title: champions[championId]?.title ?? championId,
            winRate,
          })
        )
      )
    }

    const currentEntries = toEntries(currentSnapshot, "1", "all")
    const previousEntries = toEntries(previousSnapshot, "1", "all")
    const rankChanges = getLeaderboardRankChanges(currentEntries, previousEntries)

    expect(rankChanges.get("10138:3")).toMatchObject({
      currentRank: 1,
      previousRank: 1,
      delta: 0,
    })
    expect(rankChanges.get("10138:1")).toMatchObject({
      currentRank: 6,
      previousRank: 7,
      delta: 1,
    })
    expect(rankChanges.get("10046:2")).toMatchObject({
      currentRank: 7,
      previousRank: 6,
      delta: -1,
    })
    expect(rankChanges.get("10063:1")).toMatchObject({
      currentRank: 16,
      previousRank: 12,
      delta: -4,
    })
  })
})
