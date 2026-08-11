type Props = {
  activeSection: string;
  onOpen: (section: string) => void;
};

export function DataQuickNav({ activeSection, onOpen }: Props) {
  return (
    <nav className="dataQuickNav" aria-label="数据中心模块快捷导航">
      {[
        ["data-overview", "总览"],
        ["health", "健康"],
        ["time", "时间"],
        ["career", "职业"],
        ["finance", "财务"],
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
