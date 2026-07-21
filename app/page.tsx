const habits = [
  { icon: "↗", name: "晨间拉伸", coach: "Alice McCain", done: 9, total: 12 },
  { icon: "●", name: "瑜伽训练", coach: "Jennifer Lubin", done: 6, total: 10 },
  { icon: "◆", name: "肩颈放松", coach: "Johnson Cooper", done: 4, total: 8 },
  { icon: "⌁", name: "核心训练", coach: "自主训练", done: 8, total: 10 },
];

const days = Array.from({ length: 30 }, (_, index) => index + 1);

function Icon({ children, active = false, label, onClick }: { children: React.ReactNode; active?: boolean; label: string; onClick: () => void }) {
  return <button type="button" className={`navIcon${active ? " active" : ""}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("overview");
  const navigateTo = (section: string) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="pageShell">
      <section className="dashboard">
        <aside className="sidebar" aria-label="主导航">
          <button className="brand" type="button" onClick={() => navigateTo("overview")} aria-label="Pulse 首页"><span>✦</span><b>Pulse</b></button>
          <nav>
            <Icon label="今日概览" active={activeSection === "overview"} onClick={() => navigateTo("overview")}>⌂</Icon>
            <Icon label="训练日历" active={activeSection === "calendar"} onClick={() => navigateTo("calendar")}>◔</Icon>
            <Icon label="目标进度" active={activeSection === "goals"} onClick={() => navigateTo("goals")}>⚑</Icon>
            <Icon label="习惯列表" active={activeSection === "habits"} onClick={() => navigateTo("habits")}>□</Icon>
          </nav>
          <div className="sideBottom"><Icon label="通知" onClick={() => navigateTo("habits")}>♢</Icon><Icon label="设置" onClick={() => navigateTo("goals")}>⚙</Icon><span className="avatar">AM</span></div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div><p className="eyebrow">星期三 · 7月22日</p><h1>早上好，Amanda!</h1><p className="subtitle">来看看你今天的活动进度吧</p></div>
            <div className="actions"><label className="search"><span>⌕</span><input aria-label="搜索健康数据" placeholder="搜索健康数据" /></label><button>升级计划</button></div>
          </header>

          <div className="grid">
            <article id="overview" className={`card activity${activeSection === "overview" ? " sectionActive" : ""}`}>
              <div className="cardHead"><div><p className="eyebrow">今日概览</p><h2>训练成果</h2></div><span className="roundBadge">◫</span></div>
              <div className="bubbleStage" aria-label="今日消耗1875千卡，运动2.3小时">
                <div className="bubble yellow"><strong>1,875</strong><small>千卡消耗</small></div>
                <div className="bubble coral"><strong>850</strong><small>活动千卡</small></div>
                <div className="bubble dark"><strong>2.3</strong><small>小时</small></div>
              </div>
              <div className="legend"><span><i className="dot yellowDot" />总消耗</span><span><i className="dot coralDot" />活动消耗</span><span><i className="dot darkDot" />运动时长</span></div>
            </article>

            <article id="calendar" className={`card calendar${activeSection === "calendar" ? " sectionActive" : ""}`}>
              <div className="cardHead"><div><p className="eyebrow light">连续训练 4 周</p><h2>训练日历</h2></div><button className="month">七月⌄</button></div>
              <div className="week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
              <div className="days">{days.map(day => <span key={day} className={day === 22 ? "today" : [1,5,14,17,19,23,28].includes(day) ? "trained" : ""}>{day}</span>)}</div>
              <div className="calendarLegend"><span>◉ 今天</span><span className="limeText">● 已完成</span><span>● 已计划</span></div>
            </article>

            <div id="goals" className={`statsColumn${activeSection === "goals" ? " sectionActive" : ""}`}>
              <article className="card steps">
                <div><p className="eyebrow">每日目标</p><h2>今日步数</h2><strong>5,201</strong><span> / 8,500 步</span><button className="textButton">调整目标 →</button></div>
                <div className="progressRing"><div><b>61%</b><small>已完成</small></div></div>
              </article>
              <article className="card weight">
                <div className="cardHead"><div><p className="eyebrow">12 周计划</p><h2>减重目标</h2></div><strong>68%<small> 已完成</small></strong></div>
                <div className="weightTrack"><span /><i>53.2 kg</i></div><div className="weightLabels"><b>58 kg</b><b>50 kg</b></div>
              </article>
            </div>

            <article id="habits" className={`card habits${activeSection === "habits" ? " sectionActive" : ""}`}>
              <div className="cardHead"><div><p className="eyebrow">保持节奏</p><h2>我的习惯</h2></div><button className="addButton">＋ 添加习惯</button></div>
              <div className="habitList">{habits.map(habit => (
                <div className="habit" key={habit.name}>
                  <span className="habitIcon">{habit.icon}</span><div className="habitName"><b>{habit.name}</b><small>{habit.coach}</small></div>
                  <span className="sessions">完成 {habit.done}/{habit.total}</span>
                  <div className="ticks" aria-label={`${habit.done}/${habit.total}次完成`}>{Array.from({ length: habit.total }, (_, i) => <i className={i < habit.done ? "done" : ""} key={i} />)}</div><button className="more" aria-label={`${habit.name}更多选项`}>•••</button>
                </div>
              ))}</div>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
"use client";

import { useState } from "react";
