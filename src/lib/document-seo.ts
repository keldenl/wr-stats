import { absoluteSiteUrl, SITE_NAME, type SeoMetadata } from "@/lib/site-metadata"

export type StructuredDataValue = Record<string, unknown>

export type DocumentSeoConfig = SeoMetadata & {
  canonicalPath: string
  robots?: string
  structuredData?: StructuredDataValue[]
}

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)

  if (!element) {
    element = document.createElement("meta")
    document.head.append(element)
  }

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }
}

function upsertLink(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLLinkElement>(selector)

  if (!element) {
    element = document.createElement("link")
    document.head.append(element)
  }

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }
}

export function applyDocumentSeo({
  canonicalPath,
  description,
  imageUrl,
  robots = "index,follow",
  structuredData = [],
  title,
}: DocumentSeoConfig) {
  const canonicalUrl = absoluteSiteUrl(canonicalPath)

  document.title = title

  upsertMeta('meta[name="description"]', {
    content: description,
    name: "description",
  })
  upsertMeta('meta[name="robots"]', {
    content: robots,
    name: "robots",
  })
  upsertLink('link[rel="canonical"]', {
    href: canonicalUrl,
    rel: "canonical",
  })

  upsertMeta('meta[property="og:type"]', {
    content: "website",
    property: "og:type",
  })
  upsertMeta('meta[property="og:site_name"]', {
    content: SITE_NAME,
    property: "og:site_name",
  })
  upsertMeta('meta[property="og:title"]', {
    content: title,
    property: "og:title",
  })
  upsertMeta('meta[property="og:description"]', {
    content: description,
    property: "og:description",
  })
  upsertMeta('meta[property="og:url"]', {
    content: canonicalUrl,
    property: "og:url",
  })
  upsertMeta('meta[property="og:image"]', {
    content: imageUrl,
    property: "og:image",
  })

  upsertMeta('meta[name="twitter:card"]', {
    content: "summary_large_image",
    name: "twitter:card",
  })
  upsertMeta('meta[name="twitter:title"]', {
    content: title,
    name: "twitter:title",
  })
  upsertMeta('meta[name="twitter:description"]', {
    content: description,
    name: "twitter:description",
  })
  upsertMeta('meta[name="twitter:image"]', {
    content: imageUrl,
    name: "twitter:image",
  })

  for (const node of document.head.querySelectorAll("[data-rift-structured-data]")) {
    node.remove()
  }

  for (const entry of structuredData) {
    const script = document.createElement("script")
    script.type = "application/ld+json"
    script.dataset.riftStructuredData = "true"
    script.textContent = JSON.stringify(entry)
    document.head.append(script)
  }
}
