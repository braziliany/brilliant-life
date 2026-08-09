import type { HealthDaily, HealthLoadStatus, HealthMetric } from "../../page-view.types";

type MetricConfig = { label: string; unit: string; color: string };

type Props = {
  active: boolean;
  showHealthGuide: boolean;
  showHealthTrend: boolean;
  healthHistoryLength: number;
  health: HealthDaily | null;
  healthLoadStatus: HealthLoadStatus;
  healthFreshness: string;
  latestSyncedHealth: HealthDaily | null;
  latestUploadLabel: string;
  ingestionContinuityLabel: string;
  todayUploadSummary: string;
  missingTodayMetrics: string[];
  healthMetric: HealthMetric;
  healthPeriod: 7 | 30;
  healthMetricAverageLabel: string;
  healthMetricConfig: MetricConfig;
  healthMetricHistory: HealthDaily[];
  healthMetricMax: number;
  totalEnergy: number | null;
  activeEnergy: number;
  exerciseHours: string;
  healthMetricValue: (item: HealthDaily) => number;
  onExport: () => void;
  onToggleTrend: () => void;
  onToggleGuide: () => void;
  onReload: () => void;
  onMetricChange: (metric: HealthMetric) => void;
  onPeriodChange: (period: 7 | 30) => void;
};

export function HealthOverviewCard({ active, showHealthGuide, showHealthTrend, healthHistoryLength, health, healthLoadStatus, healthFreshness, latestSyncedHealth, latestUploadLabel, ingestionContinuityLabel, todayUploadSummary, missingTodayMetrics, healthMetric, healthPeriod, healthMetricAverageLabel, healthMetricConfig, healthMetricHistory, healthMetricMax, totalEnergy, activeEnergy, exerciseHours, healthMetricValue, onExport, onToggleTrend, onToggleGuide, onReload, onMetricChange, onPeriodChange }: Props) {
  return (
    <article id="overview" className={`card activity${active ? " sectionActive" : ""}`}>
      <div className="cardHead">
        <div><p className="eyebrow">Apple 健康</p><h2>{showHealthGuide ? "同步指南" : showHealthTrend ? "健康趋势" : "训练成果"}</h2></div>
        <div className="healthViewActions">
          <button type="button" className="healthTrendToggle" onClick={onExport} disabled={healthHistoryLength === 0} aria-label="导出最近30天健康数据">CSV</button>
          <button type="button" className={`healthTrendToggle${showHealthTrend && !showHealthGuide ? " active" : ""}`} onClick={onToggleTrend}>{showHealthTrend && !showHealthGuide ? "今日" : "趋势"}</button>
          <button type="button" className={`healthTrendToggle${showHealthGuide ? " active" : ""}`} onClick={onToggleGuide}>{showHealthGuide ? "返回" : "同步"}</button>
        </div>
      </div>
      {showHealthGuide ? (
        <div className="healthGuide">
          <div className="healthSyncCenter">
            <div className="healthSyncCenterHead">
              <div><span className={`healthSyncDot ${health ? "online" : healthLoadStatus === "error" ? "error" : ""}`} /><div><small>同步状态</small><strong>{healthFreshness}</strong></div></div>
              <button type="button" onClick={onReload} disabled={healthLoadStatus === "loading"}>{healthLoadStatus === "loading" ? "刷新中…" : "立即刷新"}</button>
            </div>
            <div className="healthSyncFacts">
              <div><span>最近上传</span><b>{latestUploadLabel}</b></div>
              <div><span>数据日期</span><b>{latestSyncedHealth?.date ?? "尚无记录"}</b></div>
              <div><span>今日指标</span><b>{!health ? "等待上传" : missingTodayMetrics.length ? `缺少 ${missingTodayMetrics.join("、")}` : "主要指标完整"}</b></div>
            </div>
            <p>{ingestionContinuityLabel}；{todayUploadSummary}</p>
            {!health && latestSyncedHealth && <p>服务器最后收到的是 {latestSyncedHealth.date} 的数据；请在 Health Auto Export 中手动运行一次“今天”导出。</p>}
            {health && missingTodayMetrics.length > 0 && <p>今天的数据已收到，但 {missingTodayMetrics.join("、")} 尚未包含在上传内容中，请检查读取权限后重新导出。</p>}
          </div>
          <ol>
            <li><b>选择指标</b><span>步数、活动能量、静息能量、Apple 锻炼时间、睡眠分析、静息心率；有体重秤后再启用体重。</span></li>
            <li><b>设置来源</b><span>手表指标选择当前 Apple Watch，体重选择“健康”；旧名称的同一块手表可不选。</span></li>
            <li><b>设置导出</b><span>JSON v2、日期范围“今天”、汇总数据开启、时间分组“天”、批量请求关闭。</span></li>
            <li><b>检查结果</b><span>成功响应应包含 imported 和最新日期；HTTP 401 检查密钥，HTTP 400 检查所选指标。</span></li>
          </ol>
          <p>修改指标、来源或健康权限后，需要重新运行导出；仅勾选指标不会立即上传数据。</p>
        </div>
      ) : showHealthTrend ? (
        <div className="healthTrend">
          <div className="healthTrendControls">
            <div className="healthMetricTabs">
              <button type="button" className={healthMetric === "steps" ? "active" : ""} onClick={() => onMetricChange("steps")}>步数</button>
              <button type="button" className={healthMetric === "activeEnergyKcal" ? "active" : ""} onClick={() => onMetricChange("activeEnergyKcal")}>能量</button>
              <button type="button" className={healthMetric === "exerciseMinutes" ? "active" : ""} onClick={() => onMetricChange("exerciseMinutes")}>锻炼</button>
              <button type="button" className={healthMetric === "weightKg" ? "active" : ""} onClick={() => onMetricChange("weightKg")}>体重</button>
              <button type="button" className={healthMetric === "sleepMinutes" ? "active" : ""} onClick={() => onMetricChange("sleepMinutes")}>睡眠</button>
              <button type="button" className={healthMetric === "restingHeartRateBpm" ? "active" : ""} onClick={() => onMetricChange("restingHeartRateBpm")}>心率</button>
            </div>
            <div className="healthPeriodTabs"><button type="button" className={healthPeriod === 7 ? "active" : ""} onClick={() => onPeriodChange(7)}>7天</button><button type="button" className={healthPeriod === 30 ? "active" : ""} onClick={() => onPeriodChange(30)}>30天</button></div>
          </div>
          <div className="healthTrendSummary"><span>{healthMetric === "weightKg" || healthMetric === "sleepMinutes" ? "平均" : "日均"}</span><strong>{healthMetricAverageLabel}</strong><small>{healthMetricConfig.unit}</small>{health && <span className="healthSyncStatus">最近同步 {health.date} · {health.source === "health-auto-export" ? "Apple 健康" : health.source}</span>}</div>
          {healthMetricHistory.length ? (
            <div className={`healthBars${healthPeriod === 30 ? " compact" : ""}`} aria-label={`最近${healthPeriod}天${healthMetricConfig.label}趋势`}>
              {healthMetricHistory.map((item) => (
                <div className="healthBarDay" key={item.date} title={`${item.date}：${healthMetric === "weightKg" || healthMetric === "sleepMinutes" ? healthMetricValue(item).toFixed(1) : Math.round(healthMetricValue(item)).toLocaleString("zh-CN")} ${healthMetricConfig.unit}`}>
                  <i style={{ height: `${Math.max(4, Math.round(healthMetricValue(item) / healthMetricMax * 100))}%`, background: healthMetricConfig.color }} />
                  {(healthPeriod === 7 || item.date.endsWith("-01") || item.date.endsWith("-10") || item.date.endsWith("-20")) && <small>{Number(item.date.slice(-2))}</small>}
                </div>
              ))}
            </div>
          ) : <div className="healthTrendEmpty"><p>{healthLoadStatus === "loading" ? "正在读取健康数据…" : healthLoadStatus === "error" ? "健康数据读取失败" : "还没有可用于绘制趋势的健康数据"}</p>{healthLoadStatus === "error" && <button type="button" onClick={onReload}>重新加载</button>}</div>}
        </div>
      ) : <>
        <div className="bubbleStage" aria-label={`今日总消耗${totalEnergy ?? "暂无"}千卡，活动消耗${activeEnergy}千卡，运动${exerciseHours}小时`}>
          <div className="bubble yellow"><strong>{totalEnergy?.toLocaleString("zh-CN") ?? "—"}</strong><small>{totalEnergy === null ? "等待静息能量" : "总千卡消耗"}</small></div>
          <div className="bubble coral"><strong>{activeEnergy.toLocaleString("zh-CN")}</strong><small>活动千卡</small></div>
          <div className="bubble dark"><strong>{exerciseHours}</strong><small>小时</small></div>
        </div>
        <div className="legend"><span><i className="dot yellowDot" />总消耗</span><span><i className="dot coralDot" />活动消耗</span><span><i className="dot darkDot" />运动时长</span></div>
      </>}
    </article>
  );
}
