import type { AnnualSummaryDraft } from "./domain";

const porcelain = {
  bg: "#F7F2EB",
  text: "#081F5C",
  muted: "rgba(8,31,92,.60)",
  grid: "rgba(8,31,92,.16)",
  data: "#334EAC",
  data2: "#7096D1",
  faint: "#BAD6EB",
  quiet: "#D0E3FF",
};

const monthLabel = (month: string) => `${Number(month.slice(5))}月`;

type ChartFrameProps = {
  title: string;
  subtitle: string;
  source: string;
  template: string;
  wide?: boolean;
  children: React.ReactNode;
};

function ChartFrame({ title, subtitle, source, template, wide, children }: ChartFrameProps) {
  return (
    <article className={`annualChartCard${wide ? " wide" : ""}`}>
      <h3>{title}</h3>
      <p>{subtitle}</p>
      <div className="annualChartCanvas">{children}</div>
      <small>{template} · PORCELAIN · {source}</small>
    </article>
  );
}

export function HealthBarcodeChart({ summary }: { summary: AnnualSummaryDraft }) {
  const months = summary.health.facts.months;
  const available = months.filter((month) => month.availableDays > 0);
  const max = Math.max(1, ...available.map((month) => month.totalSteps));
  const top = [...available]
    .sort((a, b) => b.totalSteps - a.totalSteps)
    .slice(0, 3)
    .map((month) => month.month);

  return (
    <ChartFrame
      wide
      title={available.length ? "有记录的月份，活动留下了年度纹理" : "健康月份尚未形成可读纹理"}
      subtitle="每根发丝代表一个月份 · 实心点为已有记录 · 空月份不补零"
      source="HEALTH DAILY"
      template="L3 BARCODE LOLLIPOP"
    >
      <svg viewBox="0 0 800 300" role="img" aria-label="年度每月步数与健康记录覆盖">
        {months.map((month, index) => {
          const x = 35 + index * 65;
          const hasData = month.availableDays > 0;
          const y = hasData ? 245 - (month.totalSteps / max) * 180 : 245;
          return (
            <g key={month.month} className="lieflatReveal" style={{ animationDelay: `${index * 45}ms` }}>
              <line x1={x} y1="26" x2={x} y2="245" stroke={porcelain.grid} strokeWidth="1.25" />
              {hasData && <>
                <line x1={x} y1={y} x2={x} y2={Math.min(245, y + 36)} stroke={porcelain.data} strokeWidth="2" />
                <circle cx={x} cy={y} r={top.includes(month.month) ? 6 : 4} fill={porcelain.data}>
                  <title>{monthLabel(month.month)}：{month.totalSteps.toLocaleString("zh-CN")} 步，记录 {month.availableDays} 天</title>
                </circle>
                {top.includes(month.month) && (
                  <text x={x} y={Math.max(16, y - 12)} textAnchor="middle" fill={porcelain.text} fontSize="12" fontWeight="800">
                    {Math.round(month.totalSteps / 1000)}k
                  </text>
                )}
              </>}
              <text x={x} y="270" textAnchor="middle" fill={hasData ? porcelain.muted : porcelain.faint} fontSize="10" fontWeight="700">
                {index + 1}月
              </text>
            </g>
          );
        })}
      </svg>
      <div className="annualChartFacts" aria-label="年度健康事实">
        <span>活动能量 <b>{available.length ? `${Math.round(summary.health.facts.totalActiveEnergyKcal).toLocaleString("zh-CN")} kcal` : "—"}</b></span>
        <span>锻炼 <b>{available.length ? `${Math.round(summary.health.facts.totalExerciseMinutes).toLocaleString("zh-CN")} 分钟` : "—"}</b></span>
        <span>睡眠覆盖 <b>{summary.health.facts.sleep.availableDays} 天</b></span>
      </div>
    </ChartFrame>
  );
}

export function TimeTickDonutChart({ summary }: { summary: AnnualSummaryDraft }) {
  const expected = summary.time.coverage.expectedDays;
  const workdays = summary.time.facts.actualWorkdays;
  const workTicks = expected ? Math.round((workdays / expected) * 100) : 0;
  const segments = [
    { label: "工作", ticks: workTicks, value: workdays, color: porcelain.data },
    { label: "休息", ticks: 100 - workTicks, value: expected - workdays, color: porcelain.faint },
  ];
  let cursor = 0;

  return (
    <ChartFrame
      title={summary.time.coverage.officialCalendarConfigured ? "工作与休息构成全年时间表盘" : "官方日历未配置，暂不绘制结构"}
      subtitle="一格约为全年 1% · 工作与休息互斥 · 假日与调休另列事实"
      source={`HOLIDAY CALENDAR ${summary.year}`}
      template="F4 TICK DONUT"
    >
      {summary.time.coverage.officialCalendarConfigured ? (
        <>
        <svg viewBox="0 0 400 320" role="img" aria-label="年度工作日和休息日构成">
          {segments.flatMap((segment, segmentIndex) => {
            const start = cursor;
            cursor += segment.ticks;
            return Array.from({ length: segment.ticks }, (_, index) => {
              const tick = start + index;
              const angle = (tick * 3.6 - 90) * Math.PI / 180;
              const length = 13 + ((tick * 7 + segmentIndex * 3) % 5);
              const x1 = 200 + 74 * Math.cos(angle);
              const y1 = 146 + 74 * Math.sin(angle);
              const x2 = 200 + (74 + length) * Math.cos(angle);
              const y2 = 146 + (74 + length) * Math.sin(angle);
              return <line key={`${segment.label}-${tick}`} className="lieflatReveal" x1={x1} y1={y1} x2={x2} y2={y2} stroke={segment.color} strokeWidth="2" style={{ animationDelay: `${tick * 8}ms` }} />;
            });
          })}
          <text x="200" y="142" textAnchor="middle" fill={porcelain.text} fontSize="30" fontWeight="800">{expected}</text>
          <text x="200" y="162" textAnchor="middle" fill={porcelain.muted} fontSize="9" fontWeight="700">自然日</text>
          <text x="45" y="285" fill={porcelain.data} fontSize="13" fontWeight="800">工作 {workdays} 天</text>
          <text x="355" y="285" textAnchor="end" fill={porcelain.data2} fontSize="13" fontWeight="800">休息 {expected - workdays} 天</text>
        </svg>
        <div className="annualChartFacts" aria-label="年度日历事实">
          <span>法定假日 <b>{summary.time.facts.holidayDays} 天</b></span>
          <span>调休上班 <b>{summary.time.facts.makeupWorkdays} 天</b></span>
          <span>个人调整 <b>{summary.time.facts.personalAdjustments} 天</b></span>
        </div>
        </>
      ) : <div className="annualChartEmpty">{summary.time.warnings.map((warning) => warning).join(" · ")}</div>}
    </ChartFrame>
  );
}

export function FinanceHairlineChart({ summary }: { summary: AnnualSummaryDraft }) {
  const months = summary.finance.facts.months;
  const byMonth = new Map(months.map((month) => [Number(month.month.slice(5)) - 1, month]));
  const max = Math.max(1, ...months.map((month) => month.netSalary));
  const points = Array.from({ length: 12 }, (_, index) => {
    const record = byMonth.get(index);
    return record ? { index, record, x: 32 + index * 30.5, y: 245 - (record.netSalary / max) * 170 } : null;
  });
  const segments: Array<Array<NonNullable<(typeof points)[number]>>> = [];
  let segment: Array<NonNullable<(typeof points)[number]>> = [];
  points.forEach((point) => {
    if (point) segment.push(point);
    else if (segment.length) { segments.push(segment); segment = []; }
  });
  if (segment.length) segments.push(segment);

  return (
    <ChartFrame
      title={months.length ? "实发工资只沿已保存月份延伸" : "这一年尚无已保存工资月份"}
      subtitle="每个点是一份已保存月度快照 · 缺失月份断开且不补 ¥0"
      source="SALARY RECORDS"
      template="F2 HAIRLINE LINE"
    >
      <svg viewBox="0 0 400 320" role="img" aria-label="年度已保存月度实发工资">
        <line x1="24" y1="245" x2="376" y2="245" stroke={porcelain.grid} strokeWidth="1.4" />
        {Array.from({ length: 12 }, (_, index) => {
          const x = 32 + index * 30.5;
          return <g key={index}><line x1={x} y1="245" x2={x} y2="237" stroke={porcelain.grid} /><text x={x} y="268" textAnchor="middle" fill={porcelain.muted} fontSize="9" fontWeight="700">{index + 1}</text></g>;
        })}
        {segments.filter((item) => item.length > 1).map((item, index) => (
          <path key={index} className="lieflatDraw" d={`M${item.map((point) => `${point.x} ${point.y}`).join(" L ")}`} fill="none" stroke={porcelain.data} strokeWidth="2" pathLength="1" />
        ))}
        {points.map((point) => point && (
          <g key={point.record.month} className="lieflatReveal">
            <circle cx={point.x} cy={point.y} r="5" fill={porcelain.data}><title>{monthLabel(point.record.month)}：实发 ¥{point.record.netSalary.toFixed(2)}</title></circle>
            <text x={point.x} y={Math.max(18, point.y - 12)} textAnchor="middle" fill={porcelain.text} fontSize="10" fontWeight="800">¥{Math.round(point.record.netSalary)}</text>
          </g>
        ))}
      </svg>
      <div className="annualChartFacts" aria-label="年度工资事实">
        <span>应发合计 <b>{months.length ? `¥${summary.finance.facts.totalGrossSalary.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</b></span>
        <span>个税合计 <b>{months.length ? `¥${summary.finance.facts.totalIncomeTax.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</b></span>
        <span>覆盖 <b>{summary.finance.coverage.availableMonths} / 12 月</b></span>
      </div>
    </ChartFrame>
  );
}

export function CompletenessBallotChart({ summary }: { summary: AnnualSummaryDraft }) {
  const rows = [
    ["健康", summary.completeness.healthDaysRatio],
    ["时间", summary.completeness.calendarDaysRatio],
    ["财务", summary.completeness.salaryMonthsRatio],
    ["职业", summary.completeness.careerMonthsRatio],
  ] as const;
  return (
    <ChartFrame
      title="四个领域的资料完整度各自有据可查"
      subtitle="每一刻度代表 1 个百分点 · 深蓝为已有覆盖 · 各领域独立计算"
      source="ANNUAL SUMMARY COVERAGE"
      template="L15 BALLOT TALLY"
    >
      <svg viewBox="0 0 400 320" role="img" aria-label="健康时间财务职业四领域完整度">
        {rows.map(([label, ratio], rowIndex) => {
          const value = Math.round(ratio * 100);
          const base = 64 + rowIndex * 68;
          return <g key={label}>
            <text x="24" y={base - 22} fill={porcelain.text} fontSize="11" fontWeight="800">{label} · {value}%</text>
            <line x1="24" y1={base} x2="376" y2={base} stroke={porcelain.grid} />
            {Array.from({ length: 100 }, (_, tick) => {
              const x = 24 + tick * 3.52;
              const filled = tick < value;
              return <line key={tick} className="lieflatReveal" x1={x} y1={base} x2={x} y2={base - (filled ? 14 + ((tick * 5 + rowIndex) % 4) : 5)} stroke={filled ? porcelain.data : porcelain.quiet} strokeWidth={filled ? 1.4 : 1} style={{ animationDelay: `${rowIndex * 90 + tick * 4}ms` }} />;
            })}
          </g>;
        })}
      </svg>
    </ChartFrame>
  );
}
