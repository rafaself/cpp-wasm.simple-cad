import React from 'react';
import { AlignCenterHorizontal, AlignLeft, AlignRight, Bold, Italic, Underline, Strikethrough } from 'lucide-react';
import CustomSelect from '../../../../components/CustomSelect';
import NumberSpinner from '../../../../components/NumberSpinner';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { BUTTON_STYLES, INPUT_STYLES, TEXT_STYLES } from '../../../../design/tokens';
import { TextControlProps, TextUpdateDiff } from '../../../types/ribbon';

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
];

const InputWrapper: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`flex flex-col justify-center w-full ${className || ''}`}>{children}</div>
);

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
  const setters = useSettingsStore((s) => ({
    setBold: s.setTextBold,
    setItalic: s.setTextItalic,
    setUnderline: s.setTextUnderline,
    setStrike: s.setTextStrike,
  }));

  const options: Array<{ key: StyleKey; icon: React.ReactNode; active: boolean; setter: (v: boolean) => void; recalc: boolean }> = [
    { key: 'bold', icon: <Bold size={16} />, active: textBold, setter: setters.setBold, recalc: true },
    { key: 'italic', icon: <Italic size={16} />, active: textItalic, setter: setters.setItalic, recalc: true },
    { key: 'underline', icon: <Underline size={16} />, active: textUnderline, setter: setters.setUnderline, recalc: false },
    { key: 'strike', icon: <Strikethrough size={16} />, active: textStrike, setter: setters.setStrike, recalc: false },
  ];

  const handleClick = (option: typeof options[number]) => {
    const next = !option.active;
    option.setter(next);
    if (selectedTextIds.length > 0) {
      const diff: TextUpdateDiff = { [option.key]: next };
      applyTextUpdate(diff, option.recalc);
    }
  };

  return (
    <InputWrapper className="items-center">
      <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-7 gap-0.5">
        {options.map((option) => (
          <button
            key={option.key}
            onClick={() => handleClick(option)}
            className={`w-8 h-full ${BUTTON_STYLES.centered} ${option.active ? 'bg-blue-600/30 text-blue-400' : ''}`}
            title={option.key}
          >
            {option.icon}
          </button>
        ))}
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
