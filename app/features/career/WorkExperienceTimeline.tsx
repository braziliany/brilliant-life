import type { WorkExperience, WorkExperienceDraft } from "../../page-view.types";

type Props = {
  active: boolean;
  formOpen: boolean;
  editingId: number | null;
  status: "idle" | "loading" | "saving" | "error";
  draft: WorkExperienceDraft;
  experiences: WorkExperience[];
  currentExperience: WorkExperience | null;
  expandedId: number | null;
  onOpenForm: (experience?: WorkExperience) => void;
  onCloseForm: () => void;
  onDraftChange: <K extends keyof WorkExperienceDraft>(field: K, value: WorkExperienceDraft[K]) => void;
  onSave: (event: React.FormEvent) => void;
  onReload: () => void;
  onToggleExpanded: (id: number | null) => void;
  onDelete: (experience: WorkExperience) => void;
  formatDuration: (startDate: string, endDate: string | null) => string;
};

export function WorkExperienceTimeline({ active, formOpen, editingId, status, draft, experiences, currentExperience, expandedId, onOpenForm, onCloseForm, onDraftChange, onSave, onReload, onToggleExpanded, onDelete, formatDuration }: Props) {
  return (
    <article id="career" className={`card habits${active ? " sectionActive" : ""}`}>
      <div className="cardHead">
        <div><p className="eyebrow">CAREER · 职业档案</p><h2>职业经历</h2></div>
        <button type="button" className="addButton secondaryAction" onClick={() => onOpenForm()}>＋ 新增</button>
      </div>
      {!formOpen && currentExperience && <div className="careerCurrent"><span>当前 / 最近职业阶段</span><strong>{currentExperience.role}</strong><b>{currentExperience.company}</b><small>{currentExperience.startDate} — {currentExperience.endDate ?? "至今"} · {formatDuration(currentExperience.startDate, currentExperience.endDate)}</small></div>}
      {formOpen ? (
        <form className="experienceForm" onSubmit={onSave}>
          <div className="experienceFields">
            <label><span>单位</span><input required maxLength={80} value={draft.company} onChange={(event) => onDraftChange("company", event.target.value)} /></label>
            <label><span>职位</span><input required maxLength={80} value={draft.role} onChange={(event) => onDraftChange("role", event.target.value)} /></label>
            <label><span>开始</span><input required type="month" value={draft.startDate} onChange={(event) => onDraftChange("startDate", event.target.value)} /></label>
            <label><span>结束</span><input type="month" value={draft.endDate ?? ""} onChange={(event) => onDraftChange("endDate", event.target.value || null)} /></label>
          </div>
          <label className="experienceSummary"><span>工作内容</span><textarea maxLength={300} rows={2} value={draft.summary} onChange={(event) => onDraftChange("summary", event.target.value)} /></label>
          {status === "error" && <p className="experienceError" role="alert">保存失败，请稍后重试。</p>}
          <div className="experienceFormActions"><button type="button" onClick={onCloseForm}>取消</button><button type="submit" disabled={status === "saving"}>{status === "saving" ? "保存中…" : editingId ? "保存修改" : "添加经历"}</button></div>
        </form>
      ) : (
        <div className="experienceList timeline">
          {status === "loading" && <p className="experienceEmpty">正在读取工作经历…</p>}
          {status === "error" && <div className="moduleState" role="alert"><p>工作经历读取失败。</p><button type="button" onClick={onReload}>重新加载</button></div>}
          {status === "idle" && experiences.length === 0 && <button type="button" className="experienceEmpty addExperienceEmpty" onClick={() => onOpenForm()}>还没有工作经历，点击添加第一条</button>}
          {experiences.map((experience) => {
            const expanded = expandedId === experience.id;
            return (
              <div className={`experienceItem${expanded ? " expanded" : ""}`} key={experience.id}>
                <span className="experienceMark" aria-hidden="true" />
                <div className="experienceContent">
                  <b>{experience.role}</b><strong>{experience.company}</strong>
                  <small>{experience.startDate} — {experience.endDate ?? "至今"} · {formatDuration(experience.startDate, experience.endDate)}</small>
                  {experience.summary && <p>{experience.summary}</p>}
                </div>
                <div className="experienceActions">
                  <button type="button" onClick={() => onToggleExpanded(expanded ? null : experience.id)}>{expanded ? "收起" : "详情"}</button>
                  <button type="button" onClick={() => onOpenForm(experience)}>编辑</button>
                  <button type="button" className="deleteExperience" onClick={() => onDelete(experience)}>删除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
