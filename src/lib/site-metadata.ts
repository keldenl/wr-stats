export const SITE_NAME = "rankedwr"
export const SITE_HOST = "www.rankedwr.com"
export const SITE_ORIGIN = `https://${SITE_HOST}`
export const DEFAULT_SOCIAL_IMAGE = `${SITE_ORIGIN}/favicon.png`

export type ChampionStatsSeoSummary = {
  banRate: number
  bucketLabel: string
  laneLabel: string
  pickRate: number
  strengthTier: string
  winRate: number
}

export type ChampionSeoSummary = {
  displayName: string
  imageUrl?: string | null
  path: string
  roles: string[]
  stats?: ChampionStatsSeoSummary | null
  subtitle?: string | null
}

export type LeaderboardsSeoSummary = {
  archivedAtLabel?: string
  imageUrl?: string | null
  path: string
  statDateLabel?: string
  topChampionName?: string
}

export type SeoMetadata = {
  description: string
  imageUrl: string
  title: string
}

function formatRole(role: string) {
  return role
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ")
}

function formatRoleList(roles: string[]) {
  const formattedRoles = roles.map(formatRole)

  if (formattedRoles.length <= 1) {
    return formattedRoles[0] ?? "Wild Rift"
  }

  if (formattedRoles.length === 2) {
    return `${formattedRoles[0]} and ${formattedRoles[1]}`
  }

  return `${formattedRoles.slice(0, -1).join(", ")}, and ${formattedRoles.at(-1)}`
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

export function humanizeDisplayName(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue || trimmedValue !== trimmedValue.toUpperCase()) {
    return trimmedValue
  }

  return trimmedValue
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function absoluteSiteUrl(path: string) {
  return new URL(path, SITE_ORIGIN).toString()
}

export function homeSeoMetadata(imageUrl?: string | null): SeoMetadata {
  return {
    description:
      "Wild Rift champion win rates, tier lists, and searchable champion pages built from official Riot champion data and live ranked stats.",
    imageUrl: imageUrl ?? DEFAULT_SOCIAL_IMAGE,
    title: "rankedwr | Wild Rift champion win rates and tier lists",
  }
}

export function leaderboardsSeoMetadata(
  summary: LeaderboardsSeoSummary
): SeoMetadata {
  const statDatePart = summary.statDateLabel
    ? ` Updated for ${summary.statDateLabel}.`
    : ""
  const topChampionPart = summary.topChampionName
    ? ` Current leaderboard highlights include ${summary.topChampionName}.`
    : ""
  const archivedAtPart = summary.archivedAtLabel
    ? ` Snapshot archived ${summary.archivedAtLabel}.`
    : ""

  return {
    description:
      "Browse Wild Rift champion leaderboards by tier, lane, and snapshot with sortable win rate, pick rate, ban rate, and tier strength." +
      statDatePart +
      topChampionPart +
      archivedAtPart,
    imageUrl: summary.imageUrl ?? DEFAULT_SOCIAL_IMAGE,
    title: "Wild Rift leaderboards and tier list | rankedwr",
  }
}

export function championListSeoMetadata(
  championCount: number,
  imageUrl?: string | null
): SeoMetadata {
  const countPart = championCount > 0 ? ` Browse ${championCount} champions` : " Browse every champion"

  return {
    description:
      `${countPart} with direct links to Wild Rift stats, abilities, roles, and skin galleries.` +
      " Use the champion index to jump straight to each page.",
    imageUrl: imageUrl ?? DEFAULT_SOCIAL_IMAGE,
    title: "Wild Rift champion index | rankedwr",
  }
}

export function championSeoMetadata(summary: ChampionSeoSummary): SeoMetadata {
  const rolePart = summary.roles.length
    ? `${summary.displayName} is a ${formatRoleList(summary.roles)} champion in Wild Rift.`
    : `${summary.displayName} is a Wild Rift champion.`
  const subtitlePart = summary.subtitle ? ` Known as ${summary.subtitle}.` : ""
  const statsPart = summary.stats
    ? ` Latest ${summary.stats.bucketLabel} stats show ${summary.displayName} as a ${summary.stats.strengthTier}-tier ${summary.stats.laneLabel} pick with ${formatPercent(summary.stats.winRate)} win rate, ${formatPercent(summary.stats.pickRate)} pick rate, and ${formatPercent(summary.stats.banRate)} ban rate.`
    : ""

  return {
    description:
      `${rolePart}${subtitlePart}${statsPart} Explore abilities, skins, and official Riot champion details.`,
    imageUrl: summary.imageUrl ?? DEFAULT_SOCIAL_IMAGE,
    title: `${summary.displayName} Wild Rift stats, abilities, and tier | rankedwr`,
  }
}
