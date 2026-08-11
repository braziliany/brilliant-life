"use client";

import { useEffect, useState } from "react";
import type { ShanghaiDate } from "../../page-view.types";
import { getTimeGreeting } from "./time-greeting";

export function DashboardHeader({ today }: { today: ShanghaiDate }) {
  const [greeting, setGreeting] = useState(() => getTimeGreeting());

  useEffect(() => {
    const update = () => setGreeting(getTimeGreeting());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="topbar">
      <div><p className="eyebrow">{today.weekday} · {today.month + 1}月{today.day}日</p><h1>{greeting}好，Amanda!</h1><p className="subtitle">健康、工作、财务与职业档案的当前记录</p></div>
    </header>
  );
}
