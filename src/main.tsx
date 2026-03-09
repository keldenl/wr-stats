import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App.tsx"
import "./index.css"
import { buildRouteUrl, routeFromHash } from "./lib/routing.ts"

function redirectLegacyHashRoute() {
  const legacyHash = window.location.hash

  if (!legacyHash.startsWith("#/")) {
    return
  }

  const route = routeFromHash(legacyHash)
  const [, legacySearch = ""] = legacyHash.slice(1).split("?")
  const nextParams = new URLSearchParams(window.location.search)

  for (const [key, value] of new URLSearchParams(legacySearch)) {
    nextParams.set(key, value)
  }

  const nextUrl = buildRouteUrl(route, nextParams.size ? nextParams : undefined)

  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.replaceState(null, "", nextUrl)
  }
}

redirectLegacyHashRoute()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
