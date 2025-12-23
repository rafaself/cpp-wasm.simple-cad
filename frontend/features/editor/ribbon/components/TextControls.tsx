import React from 'react';
import { AlignCenterHorizontal, AlignLeft, AlignRight, Bold, Italic, Underline, Strikethrough } from 'lucide-react';
import CustomSelect from '../../../../components/CustomSelect';
import NumberSpinner from '../../../../components/NumberSpinner';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { BUTTON_STYLES, INPUT_STYLES } from '../../../../design/tokens';
import { TextControlProps, TextUpdateDiff } from '../../types/ribbon';
import { useUIStore } from '../../../../stores/useUIStore';
import { getTextTool } from '../../../../engine/runtime/textEngineSync';
import { TextStyleFlags } from '../../../../types/text';

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times', label: 'Times' },
  { value: 'Roboto', label: 'Roboto' },
];

const InputWrapper: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`flex flex-col justify-center w-full ${className || ''}`}>{children}</div>
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
      <CustomSelect value={textFontFamily} onChange={handleChange} options={FONT_OPTIONS} className={INPUT_STYLES.ribbon} />
    </InputWrapper>
  );
};

export const FontSizeControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
  const textFontSize = useSettingsStore((s) => s.toolDefaults.text.fontSize);
  const setTextFontSize = useSettingsStore((s) => s.setTextFontSize);
  const handleChange = (val: number) => {
    setTextFontSize(val);
    if (selectedTextIds.length > 0) applyTextUpdate({ fontSize: val }, true);
  };
  return (
    <InputWrapper className="items-center">
      <NumberSpinner value={textFontSize} onChange={handleChange} min={8} max={256} className="w-full h-6" />
    </InputWrapper>
  );
};

const alignOptions = [
  { align: 'left' as const, icon: <AlignLeft size={16} /> },
  { align: 'center' as const, icon: <AlignCenterHorizontal size={16} /> },
  { align: 'right' as const, icon: <AlignRight size={16} /> },
];

export const TextAlignControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
  const textAlign = useSettingsStore((s) => s.toolDefaults.text.align);
  const setTextAlign = useSettingsStore((s) => s.setTextAlign);
  const handleClick = (align: 'left' | 'center' | 'right') => {
    setTextAlign(align);
    if (selectedTextIds.length > 0) applyTextUpdate({ align }, false);
  };
  return (
    <InputWrapper className="items-center">
      <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-7 gap-0.5">
        {alignOptions.map(({ align, icon }) => (
          <button
            key={align}
            onClick={() => handleClick(align)}
            className={`w-8 h-full ${BUTTON_STYLES.centered} ${textAlign === align ? 'bg-blue-600/30 text-blue-400' : ''}`}
            title={align}
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

  const options: Array<{ key: StyleKey; icon: React.ReactNode; state: StyleState; setter: (v: boolean) => void; recalc: boolean; mask: TextStyleFlags }> = [
    { key: 'bold', icon: <Bold size={16} />, state: styleStates.bold, setter: setBold, recalc: true, mask: TextStyleFlags.Bold },
    { key: 'italic', icon: <Italic size={16} />, state: styleStates.italic, setter: setItalic, recalc: true, mask: TextStyleFlags.Italic },
    { key: 'underline', icon: <Underline size={16} />, state: styleStates.underline, setter: setUnderline, recalc: false, mask: TextStyleFlags.Underline },
    { key: 'strike', icon: <Strikethrough size={16} />, state: styleStates.strike, setter: setStrike, recalc: false, mask: TextStyleFlags.Strikethrough },
  ];

  const handleClick = (option: typeof options[number]) => {
    const nextIntent: 'set' | 'clear' = option.state === 'on' ? 'clear' : 'set';
    option.setter(nextIntent === 'set');

    if (applyViaEngine) {
      const tool = getTextTool();
      if (tool) {
        tool.applyStyle(option.mask, nextIntent);
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
      <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-7 gap-0.5">
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
            className={`w-8 h-full ${BUTTON_STYLES.centered} ${stateClass}`}
            title={option.key}
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
  <div className="flex h-full py-1 gap-1.5 px-0.5">
    <div className="flex flex-col justify-center gap-1 w-[140px]">
      <FontFamilyControl {...props} />
      <TextStyleControl {...props} />
    </div>
    <div className="flex flex-col justify-center gap-1 w-[106px]">
      <FontSizeControl {...props} />
      <TextAlignControl {...props} />
    </div>
  </div>
);
