import { LucideIcon } from 'lucide-react';
import React from 'react';

import { SettingsSection } from './SettingsModal';

interface SidebarItem {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
}

interface SettingsSidebarProps {
  sections: SidebarItem[];
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  sections,
  activeSection,
  onSectionChange,
}) => {
  return (
    <div className="w-48 border-r border-border bg-bg p-2 flex flex-col gap-1">
      {sections.map((section) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;

        return (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors text-left ${
              isActive
                ? 'bg-primary text-white'
                : 'text-text-muted hover:bg-surface2 hover:text-text'
            }`}
          >
            <Icon size={18} />
            {section.label}
          </button>
        );
      })}
    </div>
  );
};

export default SettingsSidebar;
