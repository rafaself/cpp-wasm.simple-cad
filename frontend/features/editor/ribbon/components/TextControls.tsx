import React from 'react';
import { AlignCenterHorizontal, AlignLeft, AlignRight, Bold, Italic, Underline, Strikethrough } from 'lucide-react';
import CustomSelect from '../../../../components/CustomSelect';
import NumberSpinner from '../../../../components/NumberSpinner';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { BUTTON_STYLES, INPUT_STYLES } from '../../../../design/tokens';
import { TextControlProps, TextUpdateDiff } from '../../types/ribbon';
import { useUIStore } from '../../../../stores/useUIStore';
// import { getTextTool } from '../../../../engine/core/textEngineSync';
import { TextStyleFlags } from '../../../../types/text';

// Stub for now, as textEngineSync is deprecated
// TODO: Refactor to use EngineRuntime directly if this component is revived.
const getTextTool = () => null as any;
import { LABELS } from '@/i18n/labels';

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times', label: 'Times' },
  { value: 'Roboto', label: 'Roboto' },
];


const InputWrapper: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`flex flex-col justify-center w-full h-full ${className || ''}`}>{children}</div>
);

type StyleState = 'off' | 'on' | 'mixed';

const triStateFor = (flags: number, shift: number): StyleState => {
  const v = (flags >> shift) & 0b11;
  if (v === 1) return 'on';
  if (v === 2) return 'mixed';
  return 'off';
};

export const FontFamilyControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
  const textFontFamily = useSettingsStore((s) => s.toolDefaults.text.fontFamily);
  const setTextFontFamily = useSettingsStore((s) => s.setTextFontFamily);
  const handleChange = (val: string) => {
    setTextFontFamily(val);
    if (selectedTextIds.length > 0) applyTextUpdate({ fontFamily: val }, true);
  };
  return (
    <InputWrapper>
      <CustomSelect value={textFontFamily} onChange={handleChange} options={FONT_OPTIONS} className={`${INPUT_STYLES.ribbon} ribbon-fill-h text-xs`} />
    </InputWrapper>
  );
};

export const FontSizeControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
  const textFontSize = useSettingsStore((s) => s.toolDefaults.text.fontSize);
  const setTextFontSize = useSettingsStore((s) => s.setTextFontSize);
  const engineEditState = useUIStore((s) => s.engineTextEditState);
  const applyViaEngine = engineEditState.active && engineEditState.textId !== null;

  const handleChange = (val: number) => {
    setTextFontSize(val);

    if (applyViaEngine) {
      const tool = getTextTool();
      if (tool && tool.isReady()) {
         tool.applyFontSize(val);
         // Don't return, allow applying to selection too if needed?
         return; 
      }
    }
    
    if (selectedTextIds.length > 0) applyTextUpdate({ fontSize: val }, true);
  };
  return (
    <InputWrapper className="items-center">
      <NumberSpinner value={textFontSize} onChange={handleChange} min={8} max={256} className="w-full ribbon-fill-h" />
    </InputWrapper>
  );
};

const alignOptions = [
  { align: 'left' as const, icon: <AlignLeft size={16} />, label: LABELS.text.alignLeft },
  { align: 'center' as const, icon: <AlignCenterHorizontal size={16} />, label: LABELS.text.alignCenter },
  { align: 'right' as const, icon: <AlignRight size={16} />, label: LABELS.text.alignRight },
];

export const TextAlignControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
  const textAlign = useSettingsStore((s) => s.toolDefaults.text.align);
  const setTextAlignShortcut = useSettingsStore((s) => s.setTextAlign);
  const engineEditState = useUIStore((s) => s.engineTextEditState);
  const engineStyleSnapshot = useUIStore((s) => s.engineTextStyleSnapshot);

  const engineAlign: 'left' | 'center' | 'right' | null =
    engineEditState.active && engineStyleSnapshot && engineEditState.textId === engineStyleSnapshot.textId
      ? (['left', 'center', 'right'] as const)[engineStyleSnapshot.snapshot.align]
      : null;

  const activeAlign = engineAlign ?? textAlign;

  const handleClick = (align: 'left' | 'center' | 'right') => {
    setTextAlignShortcut(align);

    if (engineEditState.active && engineEditState.textId !== null) {
      const tool = getTextTool();
      if (tool) {
        const alignMap: Record<string, number> = { left: 0, center: 1, right: 2 };
        tool.applyTextAlign(alignMap[align]);
      }
      return;
    }

    if (selectedTextIds.length > 0) applyTextUpdate({ align }, false);
  };
  return (
    <InputWrapper className="items-center">
      <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 ribbon-fill-h gap-0.5">
        {alignOptions.map(({ align, icon, label }) => (
          <button
            key={align}
            onClick={() => handleClick(align)}
            onMouseDown={(e) => e.preventDefault()}
            className={`w-8 h-full ${BUTTON_STYLES.centered} ${activeAlign === align ? 'bg-blue-600/30 text-blue-400' : ''}`}
            title={label}
          >
            {icon}
          </button>
        ))}
      </div>
    </InputWrapper>
  );
};

type StyleKey = 'bold' | 'italic' | 'underline' | 'strike';

export const TextStyleControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
  const {
    bold: textBold,
    italic: textItalic,
    underline: textUnderline,
    strike: textStrike,
  } = useSettingsStore((s) => s.toolDefaults.text);
  const setBold = useSettingsStore((s) => s.setTextBold);
  const setItalic = useSettingsStore((s) => s.setTextItalic);
  const setUnderline = useSettingsStore((s) => s.setTextUnderline);
  const setStrike = useSettingsStore((s) => s.setTextStrike);

  const engineEditState = useUIStore((s) => s.engineTextEditState);
  const engineStyleSnapshot = useUIStore((s) => s.engineTextStyleSnapshot);

  const engineStyles: Record<StyleKey, StyleState> | null =
    engineEditState.active && engineStyleSnapshot && engineEditState.textId === engineStyleSnapshot.textId
      ? {
          bold: triStateFor(engineStyleSnapshot.snapshot.styleTriStateFlags, 0),
          italic: triStateFor(engineStyleSnapshot.snapshot.styleTriStateFlags, 2),
          underline: triStateFor(engineStyleSnapshot.snapshot.styleTriStateFlags, 4),
          strike: triStateFor(engineStyleSnapshot.snapshot.styleTriStateFlags, 6),
        }
      : null;

  const fallbackStyles: Record<StyleKey, StyleState> = {
    bold: textBold ? 'on' : 'off',
    italic: textItalic ? 'on' : 'off',
    underline: textUnderline ? 'on' : 'off',
    strike: textStrike ? 'on' : 'off',
  };

  const styleStates = engineStyles ?? fallbackStyles;
  const applyViaEngine = engineEditState.active && engineEditState.textId !== null;

  const options: Array<{ key: StyleKey; icon: React.ReactNode; state: StyleState; setter: (v: boolean) => void; recalc: boolean; mask: TextStyleFlags; label: string }> = [
    { key: 'bold', icon: <Bold size={16} />, state: styleStates.bold, setter: setBold, recalc: true, mask: TextStyleFlags.Bold, label: LABELS.text.bold },
    { key: 'italic', icon: <Italic size={16} />, state: styleStates.italic, setter: setItalic, recalc: true, mask: TextStyleFlags.Italic, label: LABELS.text.italic },
    { key: 'underline', icon: <Underline size={16} />, state: styleStates.underline, setter: setUnderline, recalc: false, mask: TextStyleFlags.Underline, label: LABELS.text.underline },
    { key: 'strike', icon: <Strikethrough size={16} />, state: styleStates.strike, setter: setStrike, recalc: false, mask: TextStyleFlags.Strikethrough, label: LABELS.text.strike },
  ];

  const handleClick = (option: typeof options[number]) => {
    const nextIntent: 'set' | 'clear' = option.state === 'on' ? 'clear' : 'set';
    option.setter(nextIntent === 'set');

    console.log('[TextControls] handleClick', { key: option.key, nextIntent, applyViaEngine, textId: engineEditState.textId });

    if (applyViaEngine) {
      const tool = getTextTool();
      if (tool) {
        tool.applyStyle(option.mask, nextIntent);
      } else {
        console.warn('[TextControls] Tool not found!');
      }
      return;
    }

    if (selectedTextIds.length > 0) {
      const diff: TextUpdateDiff = { [option.key]: nextIntent === 'set' };
      applyTextUpdate(diff, option.recalc);
    }
  };

  return (
    <InputWrapper className="items-center">
      <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 ribbon-fill-h gap-0.5">
        {options.map((option) => {
          const isOn = option.state === 'on';
          const isMixed = option.state === 'mixed';
          const stateClass = isOn
            ? 'bg-blue-600/30 text-blue-400'
            : isMixed
              ? 'bg-blue-600/15 text-blue-200 border border-blue-500/40'
              : '';

          return (
          <button
            key={option.key}
            onClick={() => handleClick(option)}
            onMouseDown={(e) => e.preventDefault()}
            className={`w-8 h-full ${BUTTON_STYLES.centered} ${stateClass}`}
            title={option.label}
          >
            {option.icon}
          </button>
          );
        })}
      </div>
    </InputWrapper>
  );
};

export const TextFormatGroup: React.FC<TextControlProps> = (props) => (
  <div className="ribbon-group-col px-1">
    {/* Row 1 */}
    <div className="ribbon-row">
      <div className="w-[140px] h-full">
        <FontFamilyControl {...props} />
      </div>
      <div className="w-[106px] h-full">
        <FontSizeControl {...props} />
      </div>
    </div>
    {/* Row 2 */}
    <div className="ribbon-row">
      <div className="w-[140px] h-full">
        <TextStyleControl {...props} />
      </div>
      <div className="w-[106px] h-full">
        <TextAlignControl {...props} />
      </div>
    </div>
  </div>
);
