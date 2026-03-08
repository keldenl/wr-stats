import { describe, expect, it, mock } from "bun:test"

import { loadChampionHeroStats } from "../src/lib/tencent-lolm"

describe("champion hero stats loader", () => {
  it("builds per-bucket role stats from leaderboard snapshots", async () => {
    const manifest = {
      championsPath: "data/champions.v1.json",
      generatedAt: "2026-03-08T12:00:00.000Z",
      latestPath: "data/latest.v1.json",
      latestSnapshotId: "snapshot-1",
      snapshots: [
        {
          fetchedAt: "2026-03-08T06:23:09.000Z",
          hash: "snapshot-hash",
          id: "snapshot-1",
          path: "data/latest.v1.json",
          rowCount: 9,
          statDate: "20260307",
          tierKeys: ["0", "1", "2", "3", "4"],
        },
      ],
      version: 1,
    }
    const snapshot = {
      fetchedAt: "2026-03-08T06:23:09.000Z",
      hash: "snapshot-hash",
      snapshotId: "snapshot-1",
      statDate: "20260307",
      tiers: {
        "0": {
          "1": [["10002", 60, 1.1, 4.2]],
        },
        "1": {
          "1": [["10002", 50, 4.1, 0.9]],
          "2": [["10002", 56, 10, 10]],
          "5": [["10002", 49.5, 4.1, 1.2]],
        },
        "2": {
          "3": [["10002", 52.4, 2.5, 1.6]],
        },
        "3": {
          "4": [["10002", 48.7, 1.7, 0.4]],
        },
        "4": {
          "2": [["10002", 47.1, 0.8, 0.2]],
        },
      },
      version: 1,
    }

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.endsWith("data/manifest.v1.json")) {
        return new Response(JSON.stringify(manifest))
      }

      if (url.endsWith("data/latest.v1.json")) {
        return new Response(JSON.stringify(snapshot))
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch

    try {
      const payload = await loadChampionHeroStats("10002")

      expect(payload.latestSnapshotId).toBe("snapshot-1")
      expect(payload.buckets.map((bucket) => bucket.bucket)).toEqual(["1", "2", "3", "4"])

      const diamondPlus = payload.buckets[0]
      expect(diamondPlus.label).toBe("Diamond+")
      expect(diamondPlus.roles.map((role) => role.lane)).toEqual(["2", "5", "1"])
      expect(diamondPlus.roles.map((role) => role.laneLabel)).toEqual([
        "Solo",
        "Jungle",
        "Mid",
      ])
      expect(diamondPlus.roles[0]?.strengthTier).toBe("S")
      expect(diamondPlus.roles[0]?.strengthScore).toBeCloseTo(58.24, 2)

      const masterPlus = payload.buckets[1]
      expect(masterPlus.roles).toHaveLength(1)
      expect(masterPlus.roles[0]).toMatchObject({
        banRate: 1.6,
        lane: "3",
        laneLabel: "Duo",
        pickRate: 2.5,
        winRate: 52.4,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
