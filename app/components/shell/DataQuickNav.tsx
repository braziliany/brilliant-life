type Props = {
  activeSection: string;
  onOpen: (section: string) => void;
};

export function DataQuickNav({ activeSection, onOpen }: Props) {
  return (
    <nav className="dataQuickNav" aria-label="数据中心模块快捷导航">
      {[
        ["overview", "健康"],
        ["calendar", "工作日历"],
        ["goals", "每日目标"],
        ["habits", "工作经历"],
        ["salary", "工资"],
      ].map(([section, label]) => (
        <button
          type="button"
          key={section}
          className={activeSection === section ? "active" : ""}
          aria-current={activeSection === section ? "location" : undefined}
          onClick={() => onOpen(section)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
