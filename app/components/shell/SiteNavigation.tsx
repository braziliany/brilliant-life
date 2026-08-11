import type { SitePage } from "../../page-view.types";

type Props = {
  onChange: (page: SitePage) => void;
};

export function SiteNavigation({ onChange }: Props) {
  return (
    <header className="siteNavigation">
      <button className="siteBrand" type="button" onClick={() => onChange("home")} aria-label="璀璨人生首页"><span className="brandMark" aria-hidden="true" /><b>璀璨人生</b></button>
    </header>
  );
}
