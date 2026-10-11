import type { AnnualSummaryDraft } from "./domain";

const porcelain = {
  bg: "#F7F2EB",
  text: "#081F5C",
  muted: "rgba(8,31,92,.72)",
  grid: "rgba(8,31,92,.16)",
  data: "#334EAC",
  data2: "#7096D1",
  faint: "#BAD6EB",
  quiet: "#D0E3FF",
};

const monthLabel = (month: string) => `${Number(month.slice(5))}月`;
const money = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Lieflat porcelain: period sections, not unrelated categorical hues.
const periodInk = (index: number, count: number) => [porcelain.data2, porcelain.data, porcelain.text][Math.min(2, Math.floor(index * 3 / Math.max(1, count)))];
const monthOrdinal = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5));

type ChartFrameProps = {
  title: string;
  subtitle: string;
  wide?: boolean;
  source?: string;
  children: React.ReactNode;
};

function ChartFrame({ title, subtitle, wide, source, children }: ChartFrameProps) {
  return (
    <article className={`annualChartCard${wide ? " wide" : ""}`} data-color-system="porcelain">
      <h3>{title}</h3>
      <p>{subtitle}</p>
      <div className="annualChartCanvas">{children}</div>
      {source && <small className="annualChartSource">{source}</small>}
    </article>
  );
}

export function HealthBarcodeChart({ summary }: { summary: AnnualSummaryDraft }) {
  const months = summary.health.facts.months;
  const available = months.filter((month) => month.trustedMetricAvailableDays.steps > 0 && month.metricAvailableDays.steps === month.trustedMetricAvailableDays.steps);
  const max = Math.max(1, ...available.map((month) => month.totalSteps));
  const width = Math.max(640, months.length * 58);

  return (
    <ChartFrame
      wide
      source="来源：健康已保存记录 · 月度总量与有效记录天数"
      title={available.length ? "每月步数与记录天数" : "暂无可确认的月度步数"}
      subtitle="月度总步数受记录天数影响，不能直接比较运动多少 · 蓝阶区分年内时段 · 空月份不补零"
    >
      {available.length > 0 ? <>
      <div className="annualPlotScroll" tabIndex={0} aria-label="横向查看月度步数">
      <svg viewBox={`0 0 ${width} 250`} style={{ minWidth: width }} role="img" aria-label="年度每月步数与健康记录覆盖" data-lieflat-template="L3">
        {months.map((month, index) => {
          const x = 32 + index * (width - 64) / Math.max(1, months.length - 1);
          const hasData = month.metricAvailableDays.steps > 0 && month.metricAvailableDays.steps === month.trustedMetricAvailableDays.steps;
          const y = hasData ? 200 - (month.totalSteps / max) * 145 : 200;
          const ink = periodInk(index, months.length);
          return (
            <g key={month.month} className="lieflatReveal" style={{ animationDelay: `${index * 45}ms` }}>
              <line x1={x} y1="26" x2={x} y2="200" stroke={porcelain.grid} strokeWidth="1.25" />
              {hasData && <>
                <line x1={x} y1={y} x2={x} y2={Math.min(200, y + 30)} stroke={ink} strokeWidth="2" />
                <circle cx={x} cy={y} r="4" fill={ink} stroke={porcelain.text} strokeWidth="1">
                  <title>{`${month.month}：${month.totalSteps.toLocaleString("zh-CN")} 步，有效记录 ${month.trustedMetricAvailableDays.steps} 天`}</title>
                </circle>
              </>}
              <text x={x} y="225" textAnchor="middle" fill={porcelain.muted} fontSize="12" fontWeight="700">
                {monthLabel(month.month)}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <dl className="annualMonthReadings" aria-label="月度步数及有效记录天数">
        {months.map(month => {
          const count = month.trustedMetricAvailableDays.steps;
          const known = count > 0 && count === month.metricAvailableDays.steps;
          return <div key={month.month}><dt>{monthLabel(month.month)}</dt><dd>{known ? `${month.totalSteps.toLocaleString("zh-CN")} 步` : "—"}<small>{known ? `${count} 天有效记录` : month.metricAvailableDays.steps > 0 ? "含早期记录，覆盖未知" : "无有效步数记录"}</small></dd></div>;
        })}
      </dl>
      </> : <div className="annualChartEmpty">没有有效步数记录，不绘制零值。</div>}
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
      subtitle={summary.time.coverage.includesFutureDates ? "全年日历已配置，包含截至日期之后的日期 · 假日与调休分别列出" : "全年日历已结束 · 工作与休息分别统计 · 假日与调休分别列出"}
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
        <div className="annualChartFacts" aria-label="年度工作时间">
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
  const months = [...summary.finance.salary.facts.months].sort((a, b) => a.month.localeCompare(b.month));
  const columnWidth = Math.max(100, ...months.map(month => money(month.netSalary).length * 8 + 24));
  const width = Math.max(340, months.length * columnWidth);
  const min = Math.min(0, ...months.map((month) => month.netSalary));
  const max = Math.max(1, ...months.map((month) => month.netSalary));
  const points = months.map((record, index) => ({
    record, x: months.length === 1 ? width / 2 : columnWidth / 2 + index * (width - columnWidth) / Math.max(1, months.length - 1),
    y: months.length === 1 ? 115 : 185 - (record.netSalary - min) / (max - min) * 125,
  }));
  const segments: Array<Array<NonNullable<(typeof points)[number]>>> = [];
  let segment: Array<NonNullable<(typeof points)[number]>> = [];
  points.forEach((point) => {
    if (segment.length && monthOrdinal(point.record.month) !== monthOrdinal(segment.at(-1)!.record.month) + 1) {
      segments.push(segment); segment = [];
    }
    segment.push(point);
  });
  if (segment.length) segments.push(segment);

  return (
    <ChartFrame
      title={months.length ? "工资只沿已保存月份延伸" : "这一年尚无已保存工资月份"}
      source="来源：已保存工资快照 · 不按当前规则重算"
      subtitle="每个点是一份已保存月度快照 · 缺失月份断开且不补 ¥0 · 蓝阶区分已保存记录的先后时段"
    >
      {months.length > 0 ? <div className="annualPlotScroll" tabIndex={0} aria-label="横向查看已保存工资月份">
      <svg viewBox={`0 0 ${width} 250`} style={{ minWidth: width }} role="img" aria-label="年度已保存月度工资" data-lieflat-template="F2">
        <line x1="28" y1="200" x2={width - 28} y2="200" stroke={porcelain.grid} strokeWidth="1.4" />
        {points.map((point, index) => {
          const { x, record } = point;
          const yearLabel = index === 0 || record.month.slice(0, 4) !== months[index - 1].month.slice(0, 4);
          return <g key={record.month}><line x1={x} y1="200" x2={x} y2="192" stroke={porcelain.grid} /><text x={x} y="221" textAnchor="middle" fill={porcelain.muted} fontSize="12" fontWeight="700">{monthLabel(record.month)}</text>{yearLabel && <text x={x} y="240" textAnchor="middle" fill={porcelain.muted} fontSize="11">{record.month.slice(0, 4)}年</text>}</g>;
        })}
        {segments.filter((item) => item.length > 1).map((item, index) => (
          <path key={index} className="lieflatDraw" d={`M${item.map((point) => `${point.x} ${point.y}`).join(" L ")}`} fill="none" stroke={porcelain.data} strokeWidth="2" pathLength="1" />
        ))}
        {points.map((point, index) => (
          <g key={point.record.month} className="lieflatReveal">
            <circle cx={point.x} cy={point.y} r="4" fill={periodInk(index, points.length)} stroke={porcelain.text} strokeWidth="1"><title>{`${point.record.month}：工资 ${money(point.record.netSalary)}`}</title></circle>
            <text x={point.x} y={point.y - 14} textAnchor="middle" fill={porcelain.text} fontSize="12" fontWeight="800">{money(point.record.netSalary)}</text>
          </g>
        ))}
      </svg>
      </div> : <div className="annualChartEmpty">暂无已保存工资记录</div>}
      <div className="annualChartFacts" aria-label="年度工资记录">
        <span>应发合计 <b>{months.length ? `¥${summary.finance.salary.facts.totalGrossSalary.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</b></span>
        <span>个税合计 <b>{months.length ? `¥${summary.finance.salary.facts.totalIncomeTax.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</b></span>
        <span>已保存月份 <b>{summary.finance.salary.coverage.availableMonths} / {summary.finance.salary.coverage.expectedMonths} 月</b></span>
        <span>全年范围 <b>{summary.finance.salary.coverage.fullYearExpectedMonths} 月</b></span>
      </div>
    </ChartFrame>
  );
}

export function LifeFinanceMonthlyChart({ summary }: { summary: AnnualSummaryDraft }) {
  const lifeFinance = summary.finance.lifeFinance;
  const months = lifeFinance.facts.monthlyNetExpense;
  const rungCents = 50_000;
  const maxRungs = Math.max(1, ...months.map((item) => Math.ceil(Math.max(0, item.netExpenseCents) / rungCents)));
  const width = Math.max(100, ...months.map(item => money(item.netExpenseCents / 100).length * 8 + 24));
  const canvasWidth = Math.max(800, months.length * width);
  const startX = (canvasWidth - Math.max(1, months.length) * width) / 2 + width / 2;
  const base = 270;
  const step = Math.min(11, 190 / maxRungs);
  const cutoff = lifeFinance.coverage.sourceCutoffDate;
  const partialMonth = cutoff?.slice(0, 7);

  if (months.some((item) => item.netExpenseCents < 0)) {
    return <ChartFrame wide source="来源：财务记录 · 净消费 = 支出 − 退款" title="每月净消费，按实际账单延伸" subtitle="支出减去退款；负数表示该月退款多于支出，不绘制正数阶梯">
      <div className="financeSignedNet" aria-label="年度每月净消费（含负数）"><ol>{months.map((item) => <li key={item.month}><span>{monthLabel(item.month)}</span><strong>¥{(item.netExpenseCents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></li>)}</ol></div>
    </ChartFrame>;
  }

  return (
    <ChartFrame
      wide
      source="来源：财务记录 · 净消费 = 支出 − 退款"
      title={months.length ? "每月净消费，按实际账单延伸" : "这一年暂无每月消费记录"}
      subtitle={cutoff ? `一档 = ¥500，末档按金额比例缩短 · 蓝阶区分年内时段 · ${Number(cutoff.slice(5, 7))} 月截至 ${Number(cutoff.slice(5, 7))} 月 ${Number(cutoff.slice(8, 10))} 日` : "一档 = ¥500，末档按金额比例缩短 · 缺失月份不补 ¥0 · 蓝阶区分年内时段"}
    >
      {months.length ? <div className="annualPlotScroll" tabIndex={0} aria-label="横向查看月度净消费"><svg viewBox={`0 0 ${canvasWidth} 320`} style={{ minWidth: canvasWidth }} role="img" aria-label="年度每月净消费" data-lieflat-template="F1">
        <line x1="24" y1={base + 4} x2={canvasWidth - 24} y2={base + 4} stroke={porcelain.grid} strokeWidth="1.2" />
        {months.map((item, index) => {
          const x = startX + index * width;
          const rungCount = Math.ceil(Math.max(0, item.netExpenseCents) / rungCents);
          const amount = item.netExpenseCents / 100;
          return <g key={item.month}>
            {Array.from({ length: rungCount }, (_, rung) => {
              const y = base - rung * step;
              const halfWidth = 13 + ((rung * 7 + index * 3) % 4);
              const fraction = Math.min(1, item.netExpenseCents / rungCents - rung);
              return <line key={rung} className="lieflatReveal" x1={x - halfWidth * fraction} y1={y} x2={x + halfWidth * fraction} y2={y} stroke={periodInk(index, months.length)} strokeWidth="2.9" style={{ animationDelay: `${index * 70 + rung * 12}ms` }} />;
            })}
            <text x={x} y={Math.max(28, base - Math.max(1, rungCount) * step - 13)} textAnchor="middle" fill={porcelain.text} fontSize="12" fontWeight="800">{money(amount)}</text>
            <text x={x} y="296" textAnchor="middle" fill={item.month === partialMonth ? porcelain.data : porcelain.muted} fontSize="10" fontWeight="800">{Number(item.month.slice(5))}月</text>
            <title>{`${item.month}：净消费 ${money(amount)}`}</title>
          </g>;
        })}
      </svg></div> : <div className="annualChartEmpty">暂无财务记录</div>}
    </ChartFrame>
  );
}

export function LifeFinanceDomainChart({ summary }: { summary: AnnualSummaryDraft }) {
  const domains = summary.finance.lifeFinance.facts.domainDistribution;
  const tickCents = 50_000;
  const maxTicks = Math.max(1, ...domains.map((item) => Math.ceil(item.amountCents / tickCents)));
  const tickStep = Math.min(14, 430 / maxTicks);

  if (domains.some((item) => item.amountCents < 0)) {
    return <ChartFrame wide source="来源：财务记录 · 分类沿用当前生效分类" title="各类消费的净额" subtitle="分类净额包含退款，按带符号金额显示，不计算占比">
      <div className="financeSignedNet" aria-label="年度分类净消费（含负数）"><ol>{domains.map((item) => <li key={item.domain}><span>{item.label}</span><strong>¥{(item.amountCents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></li>)}</ol></div>
    </ChartFrame>;
  }

  return (
    <ChartFrame
      wide
      source="来源：财务记录 · 分类沿用当前生效分类"
      title={domains.length ? "这一年的消费分类" : "支出分类尚未形成记录"}
      subtitle="一档 = ¥500，末档按金额比例缩短 · 按净消费金额排序 · 蓝阶区分每行队列的前、中、后段"
    >
      {domains.length ? <div className="annualPlotScroll" tabIndex={0} aria-label="横向查看消费分类"><svg viewBox={`0 0 800 ${Math.max(120, domains.length * 42 + 60)}`} role="img" aria-label="年度净消费分类分布" data-lieflat-template="F5">
        {domains.map((item, index) => {
          const y = 40 + index * 42;
          const count = Math.ceil(item.amountCents / tickCents);
          return <g key={item.domain}>
            <text x="128" y={y + 4} textAnchor="end" fill={porcelain.muted} fontSize="11" fontWeight="800">{item.label}</text>
            <line x1="150" y1={y + 10} x2={150 + maxTicks * tickStep} y2={y + 10} stroke={porcelain.grid} strokeWidth="1" />
            {Array.from({ length: count }, (_, tick) => {
              const x = 150 + tick * tickStep + tickStep / 2;
              const height = 11 + ((tick * 5 + index * 3) % 5);
              const fraction = Math.min(1, item.amountCents / tickCents - tick);
              const ink = tick < count / 3 ? porcelain.text : tick < count * 2 / 3 ? porcelain.data : porcelain.data2;
              return <line key={tick} className="lieflatReveal" x1={x} y1={y + 10} x2={x} y2={y + 10 - height * fraction} stroke={ink} strokeWidth="2.7" style={{ animationDelay: `${index * 55 + tick * 9}ms` }} />;
            })}
            <text x={170 + maxTicks * tickStep} y={y + 4} fill={porcelain.text} fontSize="11" fontWeight="800">¥{(item.amountCents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</text>
            {summary.finance.lifeFinance.facts.netExpenseCents > 0 && <text x="745" y={y + 4} textAnchor="end" fill={porcelain.muted} fontSize="9" fontWeight="700">{(item.ratio * 100).toFixed(1)}%</text>}
          </g>;
        })}
      </svg></div> : <div className="annualChartEmpty">暂无财务记录</div>}
    </ChartFrame>
  );
}

export function CompletenessBallotChart({ summary }: { summary: AnnualSummaryDraft }) {
  const rows = [
    ["健康", summary.completeness.healthDaysRatio],
    ["时间", summary.completeness.calendarDaysRatio],
    ["工资", summary.completeness.salaryMonthsRatio],
    ["财务", summary.completeness.lifeFinanceMonthsRatio],
    ["职业", summary.completeness.careerMonthsRatio],
  ] as const;
  return (
    <ChartFrame
      title="五类记录的覆盖情况"
      subtitle="每一刻度代表 1 个百分点 · 深蓝为已有覆盖 · 各领域独立计算"
    >
      <svg viewBox="0 0 400 320" role="img" aria-label="健康时间工资财务职业五类记录覆盖情况">
        {rows.map(([label, ratio], rowIndex) => {
          const value = Math.round(ratio * 100);
          const base = 50 + rowIndex * 54;
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
