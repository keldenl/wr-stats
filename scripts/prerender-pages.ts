import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  calculateChampionStrengthScore,
  getChampionStrengthTier,
} from "../src/lib/champion-strength"
import {
  CHAMPIONS_ROUTE,
  HOME_ROUTE,
  LEADERBOARDS_ROUTE,
  championRoute,
} from "../src/lib/routing"
import {
  absoluteSiteUrl,
  championListSeoMetadata,
  championSeoMetadata,
  homeSeoMetadata,
  humanizeDisplayName,
  leaderboardsSeoMetadata,
  SITE_NAME,
  type ChampionStatsSeoSummary,
} from "../src/lib/site-metadata"
import {
  LANE_LABELS,
  sortLaneKeys,
  sortNumericKeys,
  type ChampionCatalog,
  type ChampionPageData,
  type ChampionPagesIndex,
  type LaneId,
  type LeaderboardSnapshot,
  type StaticDataManifest,
} from "../src/lib/static-data"

type ChampionDirectoryEntry = {
  avatarUrl: string
  cardImageUrl: string
  championId: string
  displayName: string
  riotSlug: string
  riotUrl: string
  title: string
}

type LeaderboardEntry = {
  avatarUrl: string
  banRate: number
  championId: string
  displayName: string
  lane: LaneId
  laneLabel: string
  pickRate: number
  riotSlug: string
  strengthScore: number
  strengthTier: string
  winRate: number
}

type ChampionBucketSummary = {
  bucket: string
  label: string
  roles: ChampionStatsSeoSummary[]
}

type StaticPage = {
  bodyHtml: string
  canonicalPath: string
  description: string
  imageUrl: string
  robots?: string
  structuredData?: StructuredDataValue[]
  title: string
}

type StructuredDataValue = Record<string, unknown>

const ROOT_DIR = process.cwd()
const DIST_DIR = path.join(ROOT_DIR, "dist")
const PUBLIC_DIR = path.join(ROOT_DIR, "public")
const DEFAULT_BUCKET = "1"
const MAX_HOME_LINKS = 12
const MAX_LEADERBOARD_ROWS = 20

const PRERENDER_STYLES = `
<style data-rift-prerender>
  :root {
    color-scheme: dark;
  }

  body {
    margin: 0;
    background: #0b1118;
    color: #f8fafc;
    font-family: FigtreeVariable, "Figtree", ui-sans-serif, system-ui, sans-serif;
  }

  #root {
    min-height: 100vh;
  }

  .prerender-page {
    max-width: 72rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }

  .prerender-topbar,
  .prerender-subnav,
  .prerender-breadcrumbs,
  .prerender-link-list,
  .prerender-inline-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
  }

  .prerender-topbar {
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .prerender-brand {
    font-size: 1.125rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .prerender-page a {
    color: #7dd3fc;
    text-decoration: none;
  }

  .prerender-page a:hover,
  .prerender-page a:focus-visible {
    text-decoration: underline;
  }

  .prerender-hero {
    margin-bottom: 2rem;
  }

  .prerender-hero h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.5rem);
    line-height: 1.05;
  }

  .prerender-hero p,
  .prerender-section p,
  .prerender-section li,
  .prerender-table {
    color: #d7e3f1;
    line-height: 1.65;
  }

  .prerender-section {
    margin-top: 2rem;
  }

  .prerender-section h2 {
    margin-bottom: 0.75rem;
    font-size: 1.5rem;
  }

  .prerender-section h3 {
    margin-bottom: 0.5rem;
    font-size: 1.125rem;
  }

  .prerender-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
  }

  .prerender-card {
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 1rem;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.7);
  }

  .prerender-list {
    margin: 0;
    padding-left: 1.25rem;
  }

  .prerender-link-list {
    list-style: none;
    padding: 0;
    margin: 1rem 0 0;
  }

  .prerender-link-list li {
    min-width: 10rem;
  }

  .prerender-table-shell {
    overflow-x: auto;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 1rem;
    background: rgba(15, 23, 42, 0.7);
  }

  .prerender-table {
    width: 100%;
    border-collapse: collapse;
  }

  .prerender-table th,
  .prerender-table td {
    padding: 0.875rem 1rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    text-align: left;
    vertical-align: top;
  }

  .prerender-table tr:last-child td {
    border-bottom: 0;
  }

  .prerender-muted {
    color: #94a3b8;
  }

  .prerender-kicker {
    margin: 0 0 0.5rem;
    color: #7dd3fc;
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .prerender-anchor-nav {
    margin-top: 1rem;
  }

  .prerender-anchor-nav a {
    margin-right: 1rem;
  }

  .prerender-image {
    width: 100%;
    border-radius: 1rem;
    display: block;
    margin-top: 1rem;
  }

  @media (max-width: 640px) {
    .prerender-page {
      padding: 1.5rem 1rem 3rem;
    }

    .prerender-topbar {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
`.trim()

async function readJsonFile<T>(pathname: string) {
  return JSON.parse(await readFile(pathname, "utf8")) as T
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;")
}

function publicAssetUrl(pathname: string) {
  return pathname.startsWith("/") ? pathname : `/${pathname}`
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatDate(value: string | undefined) {
  if (!value) {
    return "Unknown"
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
  }).format(new Date(value))
}

function buildStructuredDataHtml(entries: StructuredDataValue[]) {
  return entries
    .map(
      (entry) =>
        `<script type="application/ld+json" data-rift-structured-data="true">${JSON.stringify(entry)}</script>`
    )
    .join("\n")
}

function replaceOrInsertTag(html: string, pattern: RegExp, replacement: string) {
  if (pattern.test(html)) {
    return html.replace(pattern, replacement)
  }

  return html.replace("</head>", `${replacement}\n</head>`)
}

function buildHtmlPage(templateHtml: string, page: StaticPage) {
  let html = templateHtml

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+name="description"[^>]*>/i,
    `<meta name="description" content="${escapeAttribute(page.description)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+name="robots"[^>]*>/i,
    `<meta name="robots" content="${escapeAttribute(page.robots ?? "index,follow")}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<link[^>]+rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${escapeAttribute(absoluteSiteUrl(page.canonicalPath))}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+property="og:type"[^>]*>/i,
    '<meta property="og:type" content="website" />'
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+property="og:site_name"[^>]*>/i,
    '<meta property="og:site_name" content="rankedwr" />'
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${escapeAttribute(page.title)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+property="og:description"[^>]*>/i,
    `<meta property="og:description" content="${escapeAttribute(page.description)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+property="og:url"[^>]*>/i,
    `<meta property="og:url" content="${escapeAttribute(absoluteSiteUrl(page.canonicalPath))}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+property="og:image"[^>]*>/i,
    `<meta property="og:image" content="${escapeAttribute(page.imageUrl)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+property="og:image:alt"[^>]*>/i,
    `<meta property="og:image:alt" content="${escapeAttribute(page.title)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+name="twitter:card"[^>]*>/i,
    '<meta name="twitter:card" content="summary_large_image" />'
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+name="twitter:title"[^>]*>/i,
    `<meta name="twitter:title" content="${escapeAttribute(page.title)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+name="twitter:description"[^>]*>/i,
    `<meta name="twitter:description" content="${escapeAttribute(page.description)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+name="twitter:image"[^>]*>/i,
    `<meta name="twitter:image" content="${escapeAttribute(page.imageUrl)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<meta[^>]+name="twitter:image:alt"[^>]*>/i,
    `<meta name="twitter:image:alt" content="${escapeAttribute(page.title)}" />`
  )
  html = replaceOrInsertTag(
    html,
    /<style data-rift-prerender>[\s\S]*?<\/style>/i,
    PRERENDER_STYLES
  )
  html = html.replace(
    /<script type="application\/ld\+json" data-rift-structured-data="true">[\s\S]*?<\/script>/gi,
    ""
  )
  html = html.replace(
    "</head>",
    `${buildStructuredDataHtml(page.structuredData ?? [])}\n</head>`
  )
  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>/,
    `<div id="root">${page.bodyHtml}</div>`
  )

  return html
}

async function writeRoutePage(route: string, html: string) {
  if (route === HOME_ROUTE) {
    await writeFile(path.join(DIST_DIR, "index.html"), html)
    return
  }

  const outputDir = path.join(DIST_DIR, route.replace(/^\/+|\/+$/g, ""))
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, "index.html"), html)
}

function renderTopbar() {
  return `
    <header class="prerender-topbar">
      <div class="prerender-brand">${escapeHtml(SITE_NAME)}</div>
      <nav class="prerender-subnav" aria-label="Primary">
        <a href="${HOME_ROUTE}">Home</a>
        <a href="${LEADERBOARDS_ROUTE}">Leaderboards</a>
        <a href="${CHAMPIONS_ROUTE}">Champions</a>
      </nav>
    </header>
  `
}

function renderBreadcrumbs(
  items: Array<{
    href: string
    label: string
  }>
) {
  return `
    <nav class="prerender-breadcrumbs" aria-label="Breadcrumb">
      ${items
        .map(
          (item, index) =>
            `${index > 0 ? '<span class="prerender-muted">/</span>' : ""}<a href="${item.href}">${escapeHtml(item.label)}</a>`
        )
        .join("")}
    </nav>
  `
}

function renderChampionLinks(champions: ChampionDirectoryEntry[]) {
  return `
    <ul class="prerender-link-list">
      ${champions
        .map(
          (champion) =>
            `<li><a href="${championRoute(champion.riotSlug)}">${escapeHtml(champion.displayName)}</a></li>`
        )
        .join("")}
    </ul>
  `
}

function renderLeaderboardTable(entries: LeaderboardEntry[]) {
  return `
    <div class="prerender-table-shell">
      <table class="prerender-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Champion</th>
            <th>Lane</th>
            <th>Tier</th>
            <th>Win</th>
            <th>Pick</th>
            <th>Ban</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (entry, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td><a href="${championRoute(entry.riotSlug)}">${escapeHtml(entry.displayName)}</a></td>
                  <td>${escapeHtml(entry.laneLabel)}</td>
                  <td>${escapeHtml(entry.strengthTier)}</td>
                  <td>${formatPercent(entry.winRate)}</td>
                  <td>${formatPercent(entry.pickRate)}</td>
                  <td>${formatPercent(entry.banRate)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
}

function renderChampionStatsTable(buckets: ChampionBucketSummary[]) {
  if (!buckets.length) {
    return `<p class="prerender-muted">Champion stats are not available right now.</p>`
  }

  return buckets
    .map(
      (bucket) => `
        <section class="prerender-section">
          <h3>${escapeHtml(bucket.label)}</h3>
          <div class="prerender-table-shell">
            <table class="prerender-table">
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>Tier</th>
                  <th>Win</th>
                  <th>Pick</th>
                  <th>Ban</th>
                </tr>
              </thead>
              <tbody>
                ${bucket.roles
                  .map(
                    (role) => `
                      <tr>
                        <td>${escapeHtml(role.laneLabel)}</td>
                        <td>${escapeHtml(role.strengthTier)}</td>
                        <td>${formatPercent(role.winRate)}</td>
                        <td>${formatPercent(role.pickRate)}</td>
                        <td>${formatPercent(role.banRate)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>
      `
    )
    .join("")
}

function renderAbilities(page: ChampionPageData) {
  return `
    <ol class="prerender-list">
      ${page.abilities
        .map(
          (ability) => `
            <li>
              <strong>${escapeHtml(ability.label)}</strong>
              <span class="prerender-muted"> (${escapeHtml(ability.subtitle)})</span>
              <div>${escapeHtml(ability.description)}</div>
            </li>
          `
        )
        .join("")}
    </ol>
  `
}

function renderSkins(page: ChampionPageData) {
  if (!page.skins.length) {
    return `<p class="prerender-muted">No skins are synced for this champion yet.</p>`
  }

  return `
    <ul class="prerender-list">
      ${page.skins
        .map((skin) => `<li>${escapeHtml(humanizeDisplayName(skin.label))}</li>`)
        .join("")}
    </ul>
  `
}

function championStructuredData(
  displayName: string,
  path: string,
  description: string,
  imageUrl: string,
  riotUrl: string
) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: absoluteSiteUrl(HOME_ROUTE),
          name: "Home",
          position: 1,
        },
        {
          "@type": "ListItem",
          item: absoluteSiteUrl(CHAMPIONS_ROUTE),
          name: "Champions",
          position: 2,
        },
        {
          "@type": "ListItem",
          item: absoluteSiteUrl(path),
          name: displayName,
          position: 3,
        },
      ],
    } satisfies StructuredDataValue,
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      about: {
        "@type": "Thing",
        name: displayName,
        sameAs: riotUrl,
      },
      dateModified: new Date().toISOString(),
      description,
      image: imageUrl,
      name: `${displayName} Wild Rift stats, abilities, and tier`,
      url: absoluteSiteUrl(path),
    } satisfies StructuredDataValue,
  ]
}

function collectionStructuredData(name: string, path: string, description: string) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: absoluteSiteUrl(HOME_ROUTE),
          name: "Home",
          position: 1,
        },
        {
          "@type": "ListItem",
          item: absoluteSiteUrl(path),
          name,
          position: 2,
        },
      ],
    } satisfies StructuredDataValue,
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      description,
      name,
      url: absoluteSiteUrl(path),
    } satisfies StructuredDataValue,
  ]
}

function itemListStructuredData(
  items: Array<{
    name: string
    path: string
  }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      name: item.name,
      position: index + 1,
      url: absoluteSiteUrl(item.path),
    })),
  } satisfies StructuredDataValue
}

function buildHomePage(
  champions: ChampionDirectoryEntry[],
  featuredEntries: LeaderboardEntry[],
  imageUrl: string
): StaticPage {
  const metadata = homeSeoMetadata(imageUrl)
  const featuredChampions = featuredEntries
    .map((entry) => champions.find((champion) => champion.championId === entry.championId))
    .filter((champion): champion is ChampionDirectoryEntry => champion !== undefined)
    .filter((champion, index, entries) => {
      return entries.findIndex((entry) => entry.championId === champion.championId) === index
    })
    .slice(0, MAX_HOME_LINKS)

  return {
    bodyHtml: `
      <main class="prerender-page">
        ${renderTopbar()}
        <section class="prerender-hero">
          <p class="prerender-kicker">Wild Rift stats</p>
          <h1>Wild Rift champion win rates, tier lists, and official champion pages</h1>
          <p>${escapeHtml(metadata.description)}</p>
          <nav class="prerender-anchor-nav" aria-label="Quick links">
            <a href="${LEADERBOARDS_ROUTE}">View leaderboards</a>
            <a href="${CHAMPIONS_ROUTE}">Browse all champions</a>
          </nav>
          <p class="prerender-muted">Updated every 8 hours with current ranked snapshots.</p>
        </section>

        <section class="prerender-section">
          <h2>Featured champions</h2>
          <p>Start with the strongest current Diamond+ picks or jump directly to the full champion index.</p>
          ${renderChampionLinks(featuredChampions)}
        </section>
      </main>
    `,
    canonicalPath: HOME_ROUTE,
    description: metadata.description,
    imageUrl: metadata.imageUrl,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        logo: absoluteSiteUrl("/apple-touch-icon.png"),
        name: "rankedwr",
        sameAs: ["https://twitter.com/RepotedWR"],
        url: absoluteSiteUrl(HOME_ROUTE),
      } satisfies StructuredDataValue,
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        alternateName: "Ranked WR",
        description: metadata.description,
        name: "rankedwr",
        url: absoluteSiteUrl(HOME_ROUTE),
      } satisfies StructuredDataValue,
      itemListStructuredData(
        featuredChampions.map((champion) => ({
          name: champion.displayName,
          path: championRoute(champion.riotSlug),
        }))
      ),
    ],
    title: metadata.title,
  }
}

function buildLeaderboardsPage(
  entries: LeaderboardEntry[],
  latestSnapshot: LeaderboardSnapshot,
  imageUrl: string
): StaticPage {
  const metadata = leaderboardsSeoMetadata({
    imageUrl,
    path: LEADERBOARDS_ROUTE,
    statDateLabel: formatDateFromSnapshot(latestSnapshot.statDate),
    topChampionName: entries[0]?.displayName,
  })

  return {
    bodyHtml: `
      <main class="prerender-page">
        ${renderTopbar()}
        ${renderBreadcrumbs([
          { href: HOME_ROUTE, label: "Home" },
          { href: LEADERBOARDS_ROUTE, label: "Leaderboards" },
        ])}
        <section id="leaderboard-overview" class="prerender-hero">
          <p class="prerender-kicker">Diamond+</p>
          <h1>Wild Rift leaderboards</h1>
          <p>${escapeHtml(metadata.description)}</p>
          <nav class="prerender-anchor-nav" aria-label="Leaderboard sections">
            <a href="#leaderboard-results">Jump to results</a>
            <a href="${CHAMPIONS_ROUTE}">Browse champion pages</a>
          </nav>
        </section>

        <section id="leaderboard-results" class="prerender-section">
          <h2>Top champions right now</h2>
          <p>Sorted by weighted strength score across current Diamond+ lane tables.</p>
          ${renderLeaderboardTable(entries.slice(0, MAX_LEADERBOARD_ROWS))}
        </section>

        <section class="prerender-section">
          <h2>How this Wild Rift tier list works</h2>
          <p>Rankedwr combines official Tencent CN ranked ladder snapshots with a weighted strength score based on win rate, pick rate, and ban rate.</p>
          <p>Use the filters to narrow by lane, bucket, and archive snapshot, then open any champion row to view a dedicated page with abilities, skins, and role-specific performance.</p>
        </section>
      </main>
    `,
    canonicalPath: LEADERBOARDS_ROUTE,
    description: metadata.description,
    imageUrl: metadata.imageUrl,
    structuredData: collectionStructuredData(
      "Leaderboards",
      LEADERBOARDS_ROUTE,
      metadata.description
    ).concat(
      itemListStructuredData(
        entries.slice(0, 10).map((entry) => ({
          name: entry.displayName,
          path: championRoute(entry.riotSlug),
        }))
      )
    ),
    title: metadata.title,
  }
}

function buildChampionListPage(
  champions: ChampionDirectoryEntry[],
  imageUrl: string
): StaticPage {
  const metadata = championListSeoMetadata(champions.length, imageUrl)

  return {
    bodyHtml: `
      <main class="prerender-page">
        ${renderTopbar()}
        ${renderBreadcrumbs([
          { href: HOME_ROUTE, label: "Home" },
          { href: CHAMPIONS_ROUTE, label: "Champions" },
        ])}
        <section id="champion-list-overview" class="prerender-hero">
          <p class="prerender-kicker">Champion index</p>
          <h1>Browse every Wild Rift champion</h1>
          <p>${escapeHtml(metadata.description)}</p>
          <nav class="prerender-anchor-nav" aria-label="Champion page sections">
            <a href="#champion-list-results">Jump to champion list</a>
            <a href="${LEADERBOARDS_ROUTE}">View leaderboards</a>
          </nav>
        </section>

        <section id="champion-list-results" class="prerender-section">
          <h2>Champion pages</h2>
          ${renderChampionLinks(champions)}
        </section>

        <section class="prerender-section">
          <h2>Use the champion index to reach every stats page faster</h2>
          <p>Each champion page links current CN ranked performance with Riot&apos;s official champion data, so you can move from search to win rate, role, ability, and skin info without leaving the site.</p>
        </section>
      </main>
    `,
    canonicalPath: CHAMPIONS_ROUTE,
    description: metadata.description,
    imageUrl: metadata.imageUrl,
    structuredData: collectionStructuredData(
      "Champions",
      CHAMPIONS_ROUTE,
      metadata.description
    ).concat(
      itemListStructuredData(
        champions.slice(0, 24).map((champion) => ({
          name: champion.displayName,
          path: championRoute(champion.riotSlug),
        }))
      )
    ),
    title: metadata.title,
  }
}

function buildChampionPage(
  champion: ChampionDirectoryEntry,
  page: ChampionPageData,
  buckets: ChampionBucketSummary[]
): StaticPage {
  const canonicalPath = championRoute(champion.riotSlug)
  const defaultBucket =
    buckets.find((bucket) => bucket.bucket === DEFAULT_BUCKET) ?? buckets[0] ?? null
  const defaultRole = defaultBucket?.roles[0] ?? null
  const metadata = championSeoMetadata({
    displayName: champion.displayName,
    imageUrl: page.skins[0]?.imageUrl ?? champion.cardImageUrl,
    path: canonicalPath,
    roles: page.roles,
    stats:
      defaultBucket && defaultRole
        ? {
            ...defaultRole,
            bucketLabel: defaultBucket.label,
          }
        : null,
    subtitle: page.subtitle,
  })

  return {
    bodyHtml: `
      <main class="prerender-page">
        ${renderTopbar()}
        ${renderBreadcrumbs([
          { href: HOME_ROUTE, label: "Home" },
          { href: CHAMPIONS_ROUTE, label: "Champions" },
          { href: canonicalPath, label: champion.displayName },
        ])}
        <section id="champion-overview" class="prerender-hero">
          <p class="prerender-kicker">${escapeHtml(page.roles.map(humanizeDisplayName).join(" / "))}</p>
          <h1>${escapeHtml(champion.displayName)}</h1>
          <p>${escapeHtml(`Explore current Wild Rift stats, role strength, abilities, and skins for ${champion.displayName}.`)}</p>
          <p>${escapeHtml(page.subtitle)}</p>
          <p class="prerender-muted">
            Riot page:
            <a href="${escapeAttribute(page.riotUrl)}" rel="noreferrer">${escapeHtml(page.riotUrl)}</a>
          </p>
          <nav class="prerender-anchor-nav" aria-label="Champion sections">
            <a href="#champion-stats">Stats</a>
            <a href="#champion-content">Abilities</a>
            <a href="#champion-skins">Skins</a>
          </nav>
          ${
            page.fullWidthImageUrl
              ? `<img class="prerender-image" src="${escapeAttribute(page.fullWidthImageUrl)}" alt="${escapeAttribute(champion.displayName)} key art" />`
              : ""
          }
        </section>

        <section id="champion-stats" class="prerender-section">
          <h2>Latest ranked stats</h2>
          <p>Latest stats use the current published China ranked snapshot, with Diamond+ shown first when available.</p>
          ${renderChampionStatsTable(buckets)}
        </section>

        <section id="champion-content" class="prerender-section">
          <h2>Abilities</h2>
          ${renderAbilities(page)}
        </section>

        <section id="champion-skins" class="prerender-section">
          <h2>Skins</h2>
          ${renderSkins(page)}
          <p class="prerender-muted">Published ${escapeHtml(formatDate(page.publishDate))}</p>
        </section>

        <section class="prerender-section">
          <h2>About ${escapeHtml(champion.displayName)} on rankedwr</h2>
          <p>This page combines Riot&apos;s official champion details with rankedwr&apos;s latest published ranked snapshot so you can compare role strength, then move straight into abilities and skins.</p>
        </section>
      </main>
    `,
    canonicalPath,
    description: metadata.description,
    imageUrl: metadata.imageUrl,
    structuredData: championStructuredData(
      champion.displayName,
      canonicalPath,
      metadata.description,
      metadata.imageUrl,
      page.riotUrl
    ),
    title: metadata.title,
  }
}

function buildNotFoundPage(): StaticPage {
  return {
    bodyHtml: `
      <main class="prerender-page">
        ${renderTopbar()}
        <section class="prerender-hero">
          <p class="prerender-kicker">404</p>
          <h1>Page not found</h1>
          <p>The page you requested does not exist. Use the main routes below to continue browsing.</p>
        </section>
        <section class="prerender-section">
          <div class="prerender-inline-links">
            <a href="${HOME_ROUTE}">Home</a>
            <a href="${LEADERBOARDS_ROUTE}">Leaderboards</a>
            <a href="${CHAMPIONS_ROUTE}">Champions</a>
          </div>
        </section>
      </main>
    `,
    canonicalPath: "/404.html",
    description: "Missing page on rankedwr.",
    imageUrl: absoluteSiteUrl("/favicon.png"),
    robots: "noindex,follow",
    title: "Page not found | rankedwr",
  }
}

function formatDateFromSnapshot(statDate: string) {
  if (statDate.length !== 8) {
    return "the latest snapshot"
  }

  const nextDate = `${statDate.slice(0, 4)}-${statDate.slice(4, 6)}-${statDate.slice(6, 8)}`
  return formatDate(nextDate)
}

function buildChampionDirectory(
  championCatalog: ChampionCatalog,
  pagesIndex: ChampionPagesIndex
) {
  return Object.values(pagesIndex.champions)
    .map((entry) => {
      const champion = championCatalog.champions[entry.championId]

      if (!champion) {
        return null
      }

      return {
        avatarUrl: publicAssetUrl(champion.avatar),
        cardImageUrl: entry.cardImageUrl,
        championId: entry.championId,
        displayName: champion.displayName,
        riotSlug: entry.riotSlug,
        riotUrl: entry.riotUrl,
        title: champion.title,
      } satisfies ChampionDirectoryEntry
    })
    .filter((entry): entry is ChampionDirectoryEntry => entry !== null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

function buildLeaderboardEntries(
  snapshot: LeaderboardSnapshot,
  championCatalog: ChampionCatalog,
  tierKey = DEFAULT_BUCKET
) {
  const tier = snapshot.tiers[tierKey] ?? {}
  const entries = sortLaneKeys(Object.keys(tier) as LaneId[]).flatMap((laneKey) =>
    (tier[laneKey] ?? []).map(([championId, winRate, pickRate, banRate]) => {
      const champion = championCatalog.champions[championId]

      if (!champion?.riotSlug) {
        return null
      }

      const strengthScore = calculateChampionStrengthScore(winRate, pickRate, banRate)

      return {
        avatarUrl: publicAssetUrl(champion.avatar),
        banRate,
        championId,
        displayName: champion.displayName,
        lane: laneKey,
        laneLabel: LANE_LABELS[laneKey],
        pickRate,
        riotSlug: champion.riotSlug,
        strengthScore,
        strengthTier: getChampionStrengthTier(strengthScore),
        winRate,
      } satisfies LeaderboardEntry
    })
  )

  return entries
    .filter((entry): entry is LeaderboardEntry => entry !== null)
    .toSorted((left, right) => {
      if (left.strengthScore !== right.strengthScore) {
        return right.strengthScore - left.strengthScore
      }

      if (left.winRate !== right.winRate) {
        return right.winRate - left.winRate
      }

      return right.pickRate - left.pickRate
    })
}

function buildChampionBuckets(
  snapshot: LeaderboardSnapshot,
  championId: string
): ChampionBucketSummary[] {
  return sortNumericKeys(Object.keys(snapshot.tiers))
    .filter((bucket) => bucket !== "0")
    .map((bucket) => {
      const roles = sortLaneKeys(Object.keys(snapshot.tiers[bucket] ?? {}) as LaneId[])
        .map((laneKey) => {
          const row = snapshot.tiers[bucket]?.[laneKey]?.find(
            ([rowChampionId]) => rowChampionId === championId
          )

          if (!row) {
            return null
          }

          const [, winRate, pickRate, banRate] = row
          const strengthScore = calculateChampionStrengthScore(winRate, pickRate, banRate)

          return {
            banRate,
            bucketLabel: bucket,
            laneLabel: LANE_LABELS[laneKey],
            pickRate,
            strengthTier: getChampionStrengthTier(strengthScore),
            winRate,
          } satisfies ChampionStatsSeoSummary
        })
        .filter((role): role is ChampionStatsSeoSummary => role !== null)
        .toSorted((left, right) => right.pickRate - left.pickRate)

      return {
        bucket,
        label: bucket === "1" ? "Diamond+" : bucket === "2" ? "Master+" : bucket === "3" ? "Challenger" : bucket === "4" ? "Peak of the Rift" : `Bucket ${bucket}`,
        roles,
      }
    })
    .filter((bucket) => bucket.roles.length > 0)
}

function buildSitemapXml(
  champions: ChampionDirectoryEntry[],
  pagesIndex: ChampionPagesIndex,
  manifest: StaticDataManifest,
  championPages: Map<string, ChampionPageData>,
  defaultImageUrl: string
) {
  const latestModified = formatDateForSitemap(manifest.generatedAt)
  const urls = [
    { image: defaultImageUrl, lastmod: latestModified, path: HOME_ROUTE },
    { image: defaultImageUrl, lastmod: latestModified, path: LEADERBOARDS_ROUTE },
    { image: defaultImageUrl, lastmod: latestModified, path: CHAMPIONS_ROUTE },
    ...champions.map((champion) => {
      const pageEntry = pagesIndex.champions[champion.championId]
      const page = championPages.get(champion.riotSlug)

      return {
        image: page?.skins[0]?.imageUrl ?? pageEntry?.cardImageUrl ?? defaultImageUrl,
        lastmod: formatDateForSitemap(pageEntry?.publishDate ?? pagesIndex.generatedAt),
        path: championRoute(champion.riotSlug),
      }
    }),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
  .map(
    (entry) => `  <url>
    <loc>${escapeHtml(absoluteSiteUrl(entry.path))}</loc>
    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>
    <image:image>
      <image:loc>${escapeHtml(entry.image)}</image:loc>
    </image:image>
  </url>`
  )
  .join("\n")}
</urlset>
`
}

function formatDateForSitemap(value: string) {
  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString()
}

async function main() {
  const templateHtml = await readFile(path.join(DIST_DIR, "index.html"), "utf8")
  const championCatalog = await readJsonFile<ChampionCatalog>(
    path.join(PUBLIC_DIR, "data/champions.v1.json")
  )
  const pagesIndex = await readJsonFile<ChampionPagesIndex>(
    path.join(PUBLIC_DIR, "data/champion-pages.index.v1.json")
  )
  const manifest = await readJsonFile<StaticDataManifest>(
    path.join(PUBLIC_DIR, "data/manifest.v1.json")
  )
  const latestSnapshot = await readJsonFile<LeaderboardSnapshot>(
    path.join(PUBLIC_DIR, manifest.latestPath)
  )
  const champions = buildChampionDirectory(championCatalog, pagesIndex)
  const leaderboardEntries = buildLeaderboardEntries(latestSnapshot, championCatalog)
  const championPages = new Map(
    await Promise.all(
      champions.map(async (champion) => {
        const page = await readJsonFile<ChampionPageData>(
          path.join(PUBLIC_DIR, `data/champion-pages/${champion.riotSlug}.v1.json`)
        )

        return [champion.riotSlug, page] as const
      })
    )
  )
  const defaultSocialImage =
    pagesIndex.champions[leaderboardEntries[0]?.championId ?? ""]?.cardImageUrl ??
    absoluteSiteUrl("/favicon.png")

  await writeRoutePage(
    HOME_ROUTE,
    buildHtmlPage(
      templateHtml,
      buildHomePage(champions, leaderboardEntries, defaultSocialImage)
    )
  )

  await writeRoutePage(
    LEADERBOARDS_ROUTE,
    buildHtmlPage(
      templateHtml,
      buildLeaderboardsPage(
        leaderboardEntries,
        latestSnapshot,
        pagesIndex.champions[leaderboardEntries[0]?.championId ?? ""]?.cardImageUrl ??
          defaultSocialImage
      )
    )
  )

  await writeRoutePage(
    CHAMPIONS_ROUTE,
    buildHtmlPage(
      templateHtml,
      buildChampionListPage(
        champions,
        pagesIndex.champions[champions[0]?.championId ?? ""]?.cardImageUrl ??
          defaultSocialImage
      )
    )
  )

  for (const champion of champions) {
    const page = championPages.get(champion.riotSlug)

    if (!page) {
      continue
    }

    await writeRoutePage(
      championRoute(champion.riotSlug),
      buildHtmlPage(
        templateHtml,
        buildChampionPage(champion, page, buildChampionBuckets(latestSnapshot, champion.championId))
      )
    )
  }

  await writeFile(
    path.join(DIST_DIR, "404.html"),
    buildHtmlPage(templateHtml, buildNotFoundPage())
  )
  await writeFile(
    path.join(DIST_DIR, "sitemap.xml"),
    buildSitemapXml(
      champions,
      pagesIndex,
      manifest,
      championPages,
      defaultSocialImage
    )
  )
}

await main()
