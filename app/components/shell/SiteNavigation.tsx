import type { MouseEvent } from "react";

type Props = {
  activePage?: PrimaryNavigationKey;
};

export type PrimaryNavigationKey =
  | "home"
  | "health"
  | "time"
  | "career"
  | "finance-records"
  | "salary"
  | "annual"
  | "timeline";

const PRIMARY_NAVIGATION = [
  { key: "home", label: "首页", href: "/" },
  { key: "health", label: "健康", href: "/#health" },
  { key: "time", label: "时间", href: "/#time" },
  { key: "career", label: "职业", href: "/#career" },
  { key: "finance-records", label: "财务记录", href: "/#life-finance" },
  { key: "salary", label: "工资", href: "/#finance" },
  { key: "annual", label: "年度档案", href: "/#annual" },
  { key: "timeline", label: "时间线", href: "/timeline" },
] as const satisfies readonly { key: PrimaryNavigationKey; label: string; href: string }[];

export function SiteNavigation({ activePage = "home" }: Props) {
  const closeMenu = (event: MouseEvent<HTMLAnchorElement>) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
  };

  return (
    <header className="siteNavigation">
      <a className="siteBrand" href="/" aria-label="璀璨人生首页"><span className="brandMark" aria-hidden="true" /><b>璀璨人生</b></a>
      <details className="primaryNavigation">
        <summary>导航 <span aria-hidden="true">⌄</span></summary>
        <nav aria-label="主要导航">
          {PRIMARY_NAVIGATION.map((item) => (
            <a
              className={activePage === item.key ? "active" : ""}
              href={item.href}
              aria-current={activePage === item.key ? "page" : undefined}
              key={item.key}
              onClick={closeMenu}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </details>
    </header>
  );
}
