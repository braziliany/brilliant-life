import type { SitePage } from "../../page-view.types";

type Props = {
  sitePage: SitePage;
  onChange: (page: SitePage) => void;
};

export function SiteNavigation({ sitePage, onChange }: Props) {
  return (
    <header className="siteNavigation">
      <button className="siteBrand" type="button" onClick={() => onChange("home")} aria-label="璀璨人生首页"><span className="brandMark" aria-hidden="true" /><b>璀璨人生</b></button>
      <nav aria-label="网站导航">
        <button type="button" className={sitePage === "home" ? "active" : ""} onClick={() => onChange("home")}>首页</button>
        <button type="button" className={sitePage === "dashboard" ? "active" : ""} onClick={() => onChange("dashboard")}>数据中心</button>
      </nav>
      <div className="siteProfile"><span className="avatar">AM</span><div><b>Amanda</b><small>生活记录者</small></div></div>
    </header>
  );
}
