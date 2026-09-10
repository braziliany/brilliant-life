import type { SitePage } from "../../page-view.types";

type Props = {
  onChange: (page: SitePage) => void;
  activePage?: "home" | "timeline";
};

export function SiteNavigation({ onChange, activePage = "home" }: Props) {
  return (
    <header className="siteNavigation">
      <button className="siteBrand" type="button" onClick={() => onChange("home")} aria-label="璀璨人生首页"><span className="brandMark" aria-hidden="true" /><b>璀璨人生</b></button>
      <nav aria-label="主要导航">
        <button className={activePage === "home" ? "active" : ""} type="button" onClick={() => onChange("home")} aria-current={activePage === "home" ? "page" : undefined}>首页</button>
        <a className={activePage === "timeline" ? "active" : ""} href="/timeline" aria-current={activePage === "timeline" ? "page" : undefined}>时间线</a>
      </nav>
    </header>
  );
}
