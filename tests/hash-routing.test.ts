import { describe, expect, it } from "bun:test"

import {
  CHAMPIONS_ROUTE,
  CHAMPION_ROUTE_PREFIX,
  HOME_ROUTE,
  LEADERBOARDS_ROUTE,
  championRoute,
  championSlugFromRoute,
  routeFromHash,
  routeToHash,
} from "../src/lib/hash-routing"

describe("hash routing", () => {
  it("builds champion hashes", () => {
    const route = championRoute("smolder")

    expect(route).toBe(`${CHAMPION_ROUTE_PREFIX}smolder`)
    expect(routeToHash(route)).toBe("#/champions/smolder")
    expect(championSlugFromRoute(route)).toBe("smolder")
  })

  it("parses home and leaderboard hashes", () => {
    expect(routeFromHash("#/")).toBe(HOME_ROUTE)
    expect(routeFromHash("#/champions")).toBe(CHAMPIONS_ROUTE)
    expect(routeFromHash("#/leaderboards")).toBe(LEADERBOARDS_ROUTE)
    expect(routeFromHash("#/champions/smolder")).toBe("/champions/smolder")
  })
})
