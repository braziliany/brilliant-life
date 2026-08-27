import { FinanceTransactionsPage } from "../../features/finance/FinanceTransactionsPage";

const currentShanghaiYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric" }).format(new Date()));

export default function TransactionsRoute() {
  return <FinanceTransactionsPage initialYear={currentShanghaiYear()} />;
}
