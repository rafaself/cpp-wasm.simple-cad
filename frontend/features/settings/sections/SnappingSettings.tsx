import React from 'react';
import { SnapOptions } from '../../../types';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { Section } from '../../../components/ui/Section';
import { Toggle } from '../../../components/ui/Toggle';
import { LABELS } from '@/i18n/labels';

const SnappingSettings: React.FC = () => {
  const snapOptions = useSettingsStore(s => s.snap);
  const setSnapOption = useSettingsStore(s => s.setSnapOption);
  const setSnapEnabled = useSettingsStore(s => s.setSnapEnabled);

  const updateOption = (key: keyof SnapOptions, value: boolean) => {
    setSnapOption(key, value);
  };

  return (
    <div className="flex flex-col">
      <Section title={LABELS.settings.general}>
        <Toggle
          label={LABELS.settings.snapActive}
          checked={snapOptions.enabled}
          onChange={(v) => setSnapEnabled(v)}
        />
      </Section>

      <Section title={LABELS.settings.snapping}>
        <Toggle
          label={LABELS.settings.endpoints}
          checked={snapOptions.endpoint}
          onChange={(v) => updateOption('endpoint', v)}
        />
        <Toggle
          label={LABELS.settings.midpoints}
          checked={snapOptions.midpoint}
          onChange={(v) => updateOption('midpoint', v)}
        />
        <Toggle
          label={LABELS.settings.centers}
          checked={snapOptions.center}
          onChange={(v) => updateOption('center', v)}
        />
        <Toggle
          label={LABELS.settings.grid}
          checked={snapOptions.grid}
          onChange={(v) => updateOption('grid', v)}
        />
        <Toggle
          label={LABELS.settings.nearest}
          checked={snapOptions.nearest}
          onChange={(v) => updateOption('nearest', v)}
        />
      </Section>
    </div>
  );
};

export default SnappingSettings;
