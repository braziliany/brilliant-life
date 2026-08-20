import type { HealthDaily, HealthLoadStatus } from "../../page-view.types";

type Props = {
  active: boolean;
  steps: number | null;
  stepGoal: number;
  stepProgress: number | null;
  healthLoadStatus: HealthLoadStatus;
  hasTodayHealth: boolean;
  editingStepGoal: boolean;
  stepGoalDraft: string;
  latestWeight: number | null;
  recentWeightHistory: HealthDaily[];
  recentWeightMin: number;
  recentWeightRange: number;
  weightChange: number | null;
  onStartEditing: () => void;
  onDraftChange: (value: string) => void;
  onSave: (event: React.FormEvent) => void;
  onCancel: () => void;
};

export function DailyGoalsColumn({ active, steps, stepGoal, stepProgress, healthLoadStatus, hasTodayHealth, editingStepGoal, stepGoalDraft, latestWeight, recentWeightHistory, recentWeightMin, recentWeightRange, weightChange, onStartEditing, onDraftChange, onSave, onCancel }: Props) {
  return (
    <div id="health-goals" className={`statsColumn${active ? " sectionActive" : ""}`}>
      <article className="card steps">
        <div>
          <p className="eyebrow">HEALTH · 个人基线</p>
          <h2>今日步数</h2>
          <strong>{steps === null ? "—" : steps.toLocaleString("zh-CN")}</strong><span> / {stepGoal.toLocaleString("zh-CN")} 步</span>
          {healthLoadStatus === "ready" && !hasTodayHealth && <small className="todayHealthPending">今日尚未同步</small>}
          {healthLoadStatus === "ready" && hasTodayHealth && steps === null && <small className="todayHealthPending">暂无步数记录</small>}
          {editingStepGoal ? (
            <form className="stepGoalForm" onSubmit={onSave}>
              <input type="number" min="1000" max="100000" step="500" aria-label="每日步数目标" value={stepGoalDraft} onChange={(event) => onDraftChange(event.target.value)} autoFocus />
              <button type="submit">保存</button>
              <button type="button" onClick={onCancel}>取消</button>
            </form>
          ) : (
            <button type="button" className="textButton" onClick={onStartEditing}>调整目标 →</button>
          )}
        </div>
        <div className="progressRing" style={{ background: stepProgress === null ? "#eceae5" : `conic-gradient(var(--coral) 0 ${stepProgress}%, #eceae5 ${stepProgress}%)` }}><div><b>{stepProgress === null ? "—" : `${stepProgress}%`}</b><small>{stepProgress === null ? "等待记录" : "已完成"}</small></div></div>
      </article>
      <article className="card weight">
        <div className="cardHead"><div><p className="eyebrow">Apple 健康</p><h2>体重趋势</h2></div><strong>{latestWeight === null ? "—" : latestWeight.toFixed(1)}<small>{latestWeight === null ? "等待同步" : " kg"}</small></strong></div>
        {recentWeightHistory.length ? (
          <>
            <div className="weightSparkline" aria-label={`最近 ${recentWeightHistory.length} 次体重记录`}>
              {recentWeightHistory.map((item) => <i key={item.date} title={`${item.date}：${item.weightKg?.toFixed(1)} kg`} style={{ height: `${24 + ((item.weightKg ?? recentWeightMin) - recentWeightMin) / recentWeightRange * 76}%` }} />)}
            </div>
            <div className="weightLabels"><span>最近 {recentWeightHistory.length} 次记录</span><b className={weightChange !== null && weightChange > 0 ? "weightUp" : "weightDown"}>{weightChange === null ? "暂无变化" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} kg`}</b></div>
          </>
        ) : <div className="weightEmpty">在 Health Auto Export 中选择“体重”后即可显示趋势</div>}
      </article>
    </div>
  );
}
