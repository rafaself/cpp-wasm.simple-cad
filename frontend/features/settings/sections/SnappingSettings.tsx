import React from 'react';
import { SnapOptions } from '../../../types';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { Section } from '../../../components/ui/Section';
import { Toggle } from '../../../components/ui/Toggle';

const SnappingSettings: React.FC = () => {
  const snapOptions = useSettingsStore(s => s.snap);
  const setSnapOption = useSettingsStore(s => s.setSnapOption);
  const setSnapEnabled = useSettingsStore(s => s.setSnapEnabled);

  const updateOption = (key: keyof SnapOptions, value: boolean) => {
    setSnapOption(key, value);
  };

  return (
    <div className="flex flex-col">
      <Section title="Geral">
        <Toggle
          label="Snap Ativo"
          checked={snapOptions.enabled}
          onChange={(v) => setSnapEnabled(v)}
        />
      </Section>

      <Section title="Modos de Snap">
        <Toggle
          label="Extremidades (Endpoints)"
          checked={snapOptions.endpoint}
          onChange={(v) => updateOption('endpoint', v)}
        />
        <Toggle
          label="Pontos Médios (Midpoints)"
          checked={snapOptions.midpoint}
          onChange={(v) => updateOption('midpoint', v)}
        />
        <Toggle
          label="Centros"
          checked={snapOptions.center}
          onChange={(v) => updateOption('center', v)}
        />
        <Toggle
          label="Grade (Grid)"
          checked={snapOptions.grid}
          onChange={(v) => updateOption('grid', v)}
        />
        <Toggle
          label="Mais Próximo (Nearest)"
          checked={snapOptions.nearest}
          onChange={(v) => updateOption('nearest', v)}
        />
      </Section>
    </div>
  );
};

export default SnappingSettings;
