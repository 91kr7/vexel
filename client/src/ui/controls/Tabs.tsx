import './controls.css';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Single-select row of tabs switching which content panel is shown. */
export function Tabs({ tabs, activeId, onSelect }: TabsProps) {
  return (
    <div className="ui-tabs" role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'ui-tabs__tab ui-tabs__tab--active' : 'ui-tabs__tab'}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
