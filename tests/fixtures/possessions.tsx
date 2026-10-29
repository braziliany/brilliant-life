import { createRoot } from "react-dom/client";
import { PossessionsPage } from "../../app/features/possessions/PossessionsPage";
import { HomePage } from "../../app/components/home/HomePage";
import { SiteNavigation } from "../../app/components/shell/SiteNavigation";
import "../../app/globals.css";
// Real page components; HTTP responses are controlled by browser tests, not D1.
const home = <main className="pageShell"><div className="dashboard"><SiteNavigation /><HomePage
  today={{ year: 2026, month: 9, day: 26, weekday: "星期一" }} dailyQuote={{ text: "旅程总有一天会迎来终点，不必匆忙。", speaker: "合成作者" }}
  healthLoadStatus="ready" steps={null} stepGoal={8500} stepProgress={null} activeEnergy={null} todayHealthSynced={false}
  workdays={18} healthHistoryDays={0} netSalary={4820} workExperienceCount={0} money={value => value.toFixed(2)}
  onOpenDashboard={() => {}} onOpenAnnual={() => {}} /></div></main>;
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).get("fixture") === "home" ? home : <PossessionsPage />);
