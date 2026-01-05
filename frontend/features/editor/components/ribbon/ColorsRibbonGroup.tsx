import React from 'react';

import { useSelectionStyle } from '@/features/editor/hooks/useSelectionStyle';

import { ColorPickerButton } from './ColorPickerButton';
import { RibbonDivider } from './RibbonDivider';

export const ColorsRibbonGroup: React.FC = () => {
  const { state, setStrokeColor, setFillColor, setFillEnabled } = useSelectionStyle();

  return (
    <div className="flex items-center gap-2 px-2 h-full">
      <ColorPickerButton
        label="Traço"
        source={state.strokeSource}
        r={state.commonStrokeR}
        g={state.commonStrokeG}
        b={state.commonStrokeB}
        a={state.commonStrokeA}
        hasMixedColor={state.hasMixedStrokeColor}
        onChange={setStrokeColor}
        canBeNone={false}
      />

      <RibbonDivider />

      <ColorPickerButton
        label="Preenchimento"
        source={state.fillSource}
        r={state.commonFillR}
        g={state.commonFillG}
        b={state.commonFillB}
        a={state.commonFillA}
        hasMixedColor={state.hasMixedFillColor}
        onChange={setFillColor}
        onSetNone={() => setFillEnabled(false)}
        canBeNone={true}
      />
    </div>
  );
};
