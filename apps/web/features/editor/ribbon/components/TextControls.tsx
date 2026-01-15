import {
  AlignCenterHorizontal,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Strikethrough,
} from 'lucide-react';
import React from 'react';

import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { mapFontIdToFamily } from '@/features/editor/text/textToolController';
import { LABELS } from '@/i18n/labels';

import CustomSelect from '../../../../components/CustomSelect';
import { NumericComboField } from '../../../../components/NumericComboField';
import { INPUT_STYLES } from '../../../../src/styles/recipes';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { TextStyleFlags } from '../../../../types/text';
import { RibbonControlWrapper } from '../../components/ribbon/RibbonControlWrapper';
import { RibbonIconButton } from '../../components/ribbon/RibbonIconButton';
import { RibbonToggleGroup } from '../../components/ribbon/RibbonToggleGroup';
import { TextControlProps, TextUpdateDiff } from '../../types/ribbon';

// Familiar font names users recognize
const FONT_OPTIONS = [
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Noto Serif', label: 'Noto Serif' },
];

type StyleState = 'off' | 'on' | 'mixed';

const triStateFor = (flags: number, shift: number): StyleState => {
  const v = (flags >> shift) & 0b11;
  if (v === 1) return 'on';
  if (v === 2) return 'mixed';
  return 'off';
};

const isUniformTriState = (state: number | null | undefined): boolean => state === 1;
const isMixedTriState = (state: number | null | undefined): boolean => state === 2;

const useResolvedTextStyleSnapshot = (selectedTextIds: number[]) => {
  const runtime = useEngineRuntime();
  const engineEditState = useUIStore((s) => s.engineTextEditState);
  const engineStyleSnapshot = useUIStore((s) => s.engineTextStyleSnapshot);
  const overlayTick = useUIStore((s) => s.overlayTick);

  return React.useMemo(() => {
    if (engineEditState.active) {
      if (engineStyleSnapshot && engineEditState.textId === engineStyleSnapshot.textId) {
        return engineStyleSnapshot.snapshot;
      }
      return null;
    }

    if (!runtime || selectedTextIds.length !== 1) return null;
    const textId = selectedTextIds[0];
    if (!runtime.getTextEntityMeta(textId)) return null;
    return runtime.text.getTextStyleSummary(textId);
  }, [
    engineEditState.active,
    engineEditState.textId,
    engineStyleSnapshot,
    runtime,
    selectedTextIds,
    overlayTick,
  ]);
};

export const FontFamilyControl: React.FC<TextControlProps> = ({
  selectedTextIds,
  applyTextUpdate,
}) => {
  const textFontFamily = useSettingsStore((s) => s.toolDefaults.text.fontFamily);
  const setTextFontFamily = useSettingsStore((s) => s.setTextFontFamily);
  const snapshot = useResolvedTextStyleSnapshot(selectedTextIds);
  const isMixed = snapshot ? isMixedTriState(snapshot.fontIdTriState) : false;
  const resolvedFamily =
    snapshot && isUniformTriState(snapshot.fontIdTriState)
      ? mapFontIdToFamily(snapshot.fontId)
      : null;
  const displayFamily = resolvedFamily ?? textFontFamily;
  const selectValue = isMixed ? '' : displayFamily;
  const placeholder = isMixed ? LABELS.text.mixed : undefined;
  const handleChange = (val: string) => {
    setTextFontFamily(val);
    applyTextUpdate({ fontFamily: val }, true);
  };
  return (
    <RibbonControlWrapper>
      <CustomSelect
        value={selectValue}
        onChange={handleChange}
        options={FONT_OPTIONS}
        placeholder={placeholder}
        className={`${INPUT_STYLES.ribbon} ribbon-fill-h text-xs`}
      />
    </RibbonControlWrapper>
  );
};

export const FontSizeControl: React.FC<TextControlProps> = ({
  selectedTextIds,
  applyTextUpdate,
}) => {
  const textFontSize = useSettingsStore((s) => s.toolDefaults.text.fontSize);
  const setTextFontSize = useSettingsStore((s) => s.setTextFontSize);
  const snapshot = useResolvedTextStyleSnapshot(selectedTextIds);
  const fontSizeValue = snapshot
    ? isMixedTriState(snapshot.fontSizeTriState)
      ? 'mixed'
      : isUniformTriState(snapshot.fontSizeTriState)
        ? snapshot.fontSize
        : textFontSize
    : textFontSize;

  // Font size presets (Figma-like)
  const fontSizePresets = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 32, 48, 64, 96, 128];

  const handleCommit = (val: number) => {
    setTextFontSize(val);
    applyTextUpdate({ fontSize: val }, true);
  };

  return (
    <RibbonControlWrapper align="center">
      <NumericComboField
        value={fontSizeValue}
        onCommit={handleCommit}
        presets={fontSizePresets}
        min={1}
        max={999}
        step={1}
        stepLarge={10}
        ariaLabel="Tamanho da Fonte"
        className="w-full ribbon-fill-h"
        dropdownMaxHeight="auto"
        allowScrollWheel={true}
      />
    </RibbonControlWrapper>
  );
};

const alignOptions = [
  { align: 'left' as const, icon: <AlignLeft size={16} />, label: LABELS.text.alignLeft },
  {
    align: 'center' as const,
    icon: <AlignCenterHorizontal size={16} />,
    label: LABELS.text.alignCenter,
  },
  { align: 'right' as const, icon: <AlignRight size={16} />, label: LABELS.text.alignRight },
];

export const TextAlignControl: React.FC<TextControlProps> = ({
  selectedTextIds,
  applyTextUpdate,
}) => {
  const textAlign = useSettingsStore((s) => s.toolDefaults.text.align);
  const setTextAlignShortcut = useSettingsStore((s) => s.setTextAlign);
  const snapshot = useResolvedTextStyleSnapshot(selectedTextIds);
  const engineAlign: 'left' | 'center' | 'right' | null = snapshot
    ? (['left', 'center', 'right'] as const)[snapshot.align]
    : null;

  const activeAlign = engineAlign ?? textAlign;

  const handleClick = (align: 'left' | 'center' | 'right') => {
    setTextAlignShortcut(align);
    applyTextUpdate({ align }, false);
  };
  return (
    <RibbonControlWrapper align="center">
      <RibbonToggleGroup>
        {alignOptions.map(({ align, icon, label }) => (
          <RibbonIconButton
            key={align}
            icon={icon}
            onClick={() => handleClick(align)}
            isActive={activeAlign === align}
            title={label}
          />
        ))}
      </RibbonToggleGroup>
    </RibbonControlWrapper>
  );
};

type StyleKey = 'bold' | 'italic' | 'underline' | 'strike';

export const TextStyleControl: React.FC<TextControlProps> = ({
  selectedTextIds,
  applyTextUpdate,
}) => {
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

  const snapshot = useResolvedTextStyleSnapshot(selectedTextIds);

  const engineStyles: Record<StyleKey, StyleState> | null = snapshot
    ? {
        bold: triStateFor(snapshot.styleTriStateFlags, 0),
        italic: triStateFor(snapshot.styleTriStateFlags, 2),
        underline: triStateFor(snapshot.styleTriStateFlags, 4),
        strike: triStateFor(snapshot.styleTriStateFlags, 6),
      }
    : null;

  const fallbackStyles: Record<StyleKey, StyleState> = {
    bold: textBold ? 'on' : 'off',
    italic: textItalic ? 'on' : 'off',
    underline: textUnderline ? 'on' : 'off',
    strike: textStrike ? 'on' : 'off',
  };

  const styleStates = engineStyles ?? fallbackStyles;

  const options: Array<{
    key: StyleKey;
    icon: React.ReactNode;
    state: StyleState;
    setter: (v: boolean) => void;
    recalc: boolean;
    mask: TextStyleFlags;
    label: string;
  }> = [
    {
      key: 'bold',
      icon: <Bold size={16} />,
      state: styleStates.bold,
      setter: setBold,
      recalc: true,
      mask: TextStyleFlags.Bold,
      label: LABELS.text.bold,
    },
    {
      key: 'italic',
      icon: <Italic size={16} />,
      state: styleStates.italic,
      setter: setItalic,
      recalc: true,
      mask: TextStyleFlags.Italic,
      label: LABELS.text.italic,
    },
    {
      key: 'underline',
      icon: <Underline size={16} />,
      state: styleStates.underline,
      setter: setUnderline,
      recalc: false,
      mask: TextStyleFlags.Underline,
      label: LABELS.text.underline,
    },
    {
      key: 'strike',
      icon: <Strikethrough size={16} />,
      state: styleStates.strike,
      setter: setStrike,
      recalc: false,
      mask: TextStyleFlags.Strikethrough,
      label: LABELS.text.strike,
    },
  ];

  const handleClick = (option: (typeof options)[number]) => {
    const nextIntent: 'set' | 'clear' = option.state === 'on' ? 'clear' : 'set';
    option.setter(nextIntent === 'set');

    const diff: TextUpdateDiff = { [option.key]: nextIntent === 'set' };
    applyTextUpdate(diff, option.recalc);
  };

  return (
    <RibbonControlWrapper align="center">
      <RibbonToggleGroup>
        {options.map((option) => {
          const isOn = option.state === 'on';
          const isMixed = option.state === 'mixed';
          // Mixed state uses custom class, active uses standard
          const mixedClass = isMixed ? 'bg-primary/10 text-primary border border-primary/20' : '';

          return (
            <RibbonIconButton
              key={option.key}
              icon={option.icon}
              onClick={() => handleClick(option)}
              isActive={isOn}
              title={option.label}
              className={mixedClass}
            />
          );
        })}
      </RibbonToggleGroup>
    </RibbonControlWrapper>
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
