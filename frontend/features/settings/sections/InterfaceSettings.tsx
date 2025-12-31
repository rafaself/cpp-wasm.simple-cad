import React from 'react';

import { Section } from '../../../components/ui/Section';
import { Toggle } from '../../../components/ui/Toggle';
import { useSettingsStore } from '../../../stores/useSettingsStore';

const InterfaceSettings: React.FC = () => {
  const settings = useSettingsStore();

  return (
    <div className="flex flex-col">
      <Section title="Barra Lateral">
        <Toggle
          label="Mostrar indicadores de rolagem"
          checked={settings.display.showSidebarScrollIndicators}
          onChange={settings.setShowSidebarScrollIndicators}
        />
      </Section>

      <Section title="Ferramentas">
        <Toggle
          label="Barra de Acesso Rápido"
          checked={settings.display.showQuickAccess}
          onChange={settings.setShowQuickAccess}
        />
      </Section>
    </div>
  );
};

export default InterfaceSettings;
