import { Terminal } from 'lucide-react';
import React from 'react';

import { Section } from '../../../components/ui/Section';
import { Toggle } from '../../../components/ui/Toggle';
import { supportsEngineResize } from '../../../engine/core/capabilities';
import { useSettingsStore } from '../../../stores/useSettingsStore';

const DeveloperSettings: React.FC = () => {
  const settings = useSettingsStore();

  const engineResizeSupported = supportsEngineResize(settings.engineCapabilitiesMask);
  const engineResizeEnabled = settings.featureFlags.enableEngineResize && engineResizeSupported;

  return (
    <div className="flex flex-col">
      <Section title="Funcionalidades Experimentais">
        <div className="flex flex-col">
          <Toggle
            label={
              engineResizeSupported
                ? 'Habilitar Redimensionamento pela Engine'
                : 'Habilitar Redimensionamento pela Engine (Requer WASM rebuild)'
            }
            checked={engineResizeEnabled}
            onChange={settings.setEngineResizeEnabled}
          />
          <div className="text-xs text-text-muted px-1 pb-2">
            Permite que a engine C++ controle a lógica de redimensionamento e renderize as alças de seleção.
          </div>
        </div>
        
        <div className="text-xs text-text-muted mt-2 italic">
          Essas opções são destinadas ao desenvolvimento e debug da engine gráfica.
        </div>
      </Section>

      <Section title="Performance">
         <div className="flex flex-col">
          <Toggle
              label="Pick Profiling"
              checked={settings.featureFlags.enablePickProfiling}
              onChange={settings.setPickProfilingEnabled}
          />
          <div className="text-xs text-text-muted px-1">
            Loga o tempo de execução do picking no console.
          </div>
         </div>
      </Section>
    </div>
  );
};

export default DeveloperSettings;
