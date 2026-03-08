import { Twitter } from "lucide-react"

export function SiteFooter() {
  return (
    <footer className="rift-home-footer">
      <p>
        All data sourced from Riot&apos;s official{" "}
        <a
          href="https://lolm.qq.com/act/a20220818raider/index.html"
          target="_blank"
          rel="noreferrer"
          className="rift-footer-link"
        >
          Wild Rift CN Dia+ Statistics
        </a>{" "}
        and{" "}
        <a
          href="https://wildrift.leagueoflegends.com/en-us/champions/"
          target="_blank"
          rel="noreferrer"
          className="rift-footer-link"
        >
          champions list
        </a>
        .
      </p>
      <p>
        Built by{" "}
        <a
          href="https://twitter.com/RepotedWR"
          target="_blank"
          rel="noreferrer"
          className="rift-footer-link inline-flex items-center gap-1 pb-4"
        >
          <Twitter className="size-3.5" />
          RepotedWR
        </a>{" "}
        © 2026
      </p>
    </footer>
  )
}
