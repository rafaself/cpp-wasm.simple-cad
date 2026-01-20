import {
  AlignCenterHorizontal,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  MoreHorizontal,
  Underline,
  Strikethrough,
} from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { Select } from '@/components/ui/Select';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { mapFontIdToFamily } from '@/features/editor/text/textToolController';
import { LABELS } from '@/i18n/labels';

import { NumericComboField } from '../../../../components/NumericComboField';
import { INPUT_STYLES } from '../../../../src/styles/recipes';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { TextStyleFlags } from '../../../../types/text';
import { RibbonControlWrapper } from '../../components/ribbon/RibbonControlWrapper';
import { RibbonIconButton } from '../../components/ribbon/RibbonIconButton';
import { RibbonToggleGroup } from '../../components/ribbon/RibbonToggleGroup';
import { useRibbonLayout } from '../../components/ribbon/ribbonLayout';
import { RIBBON_ICON_SIZES } from '../../components/ribbon/ribbonUtils';
import { TextControlProps, TextUpdateDiff } from '../../types/ribbon';
import { isTierAtLeast } from '../../ui/ribbonLayoutV2';

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
    <RibbonControlWrapper className="min-w-[140px]">
      <Select
        value={selectValue}
        onChange={handleChange}
        options={FONT_OPTIONS}
        placeholder={placeholder}
        className={`${INPUT_STYLES.ribbon} ribbon-control ribbon-fill-h text-xs !h-full`}
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
        className="w-full ribbon-control ribbon-fill-h"
        dropdownMaxHeight="auto"
        allowScrollWheel={true}
        allowArrowStep={true}
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
  const { tier } = useRibbonLayout();
  const [isAlignMenuOpen, setIsAlignMenuOpen] = React.useState(false);
  const textAlign = useSettingsStore((s) => s.toolDefaults.text.align);
  const setTextAlignShortcut = useSettingsStore((s) => s.setTextAlign);
  const snapshot = useResolvedTextStyleSnapshot(selectedTextIds);
  const engineAlign: 'left' | 'center' | 'right' | null = snapshot
    ? (['left', 'center', 'right'] as const)[snapshot.align]
    : null;

  const activeAlign = engineAlign ?? textAlign;
  const collapseAlign = isTierAtLeast(tier, 'tier3');
  const primaryAlignOptions = collapseAlign
    ? alignOptions.filter((option) => option.align !== 'right')
    : alignOptions;
  const overflowAlignOptions = collapseAlign
    ? alignOptions.filter((option) => option.align === 'right')
    : [];

  const handleClick = (align: 'left' | 'center' | 'right') => {
    setTextAlignShortcut(align);
    applyTextUpdate({ align }, false);
    setIsAlignMenuOpen(false);
  };
  return (
    <RibbonControlWrapper align="center" className="!w-fit">
      <RibbonToggleGroup className="w-fit h-full" width="fit">
        {primaryAlignOptions.map(({ align, icon, label }) => (
          <RibbonIconButton
            key={align}
            icon={icon}
            onClick={() => handleClick(align)}
            isActive={activeAlign === align}
            activeStyle="toggle"
            title={label}
          />
        ))}
        {overflowAlignOptions.length > 0 && (
          <Popover
            isOpen={isAlignMenuOpen}
            onOpenChange={setIsAlignMenuOpen}
            placement="bottom"
            offset={6}
            className="ribbon-inline-popover"
            zIndex="z-dropdown"
            content={
              <div className="ribbon-inline-menu">
                {overflowAlignOptions.map(({ align, icon, label }) => (
                  <Button
                    key={align}
                    variant="ghost"
                    size="sm"
                    className="ribbon-inline-menu-item"
                    onClick={() => handleClick(align)}
                    data-active={activeAlign === align}
                  >
                    {icon}
                    <span>{label}</span>
                  </Button>
                ))}
              </div>
            }
          >
            <RibbonIconButton
              icon={<MoreHorizontal size={RIBBON_ICON_SIZES.sm} />}
              onClick={() => undefined}
              title="Mais alinhamentos"
            />
          </Popover>
        )}
      </RibbonToggleGroup>
    </RibbonControlWrapper>
  );
};

type StyleKey = 'bold' | 'italic' | 'underline' | 'strike';

export const TextStyleControl: React.FC<TextControlProps> = ({
  selectedTextIds,
  applyTextUpdate,
}) => {
  const { tier } = useRibbonLayout();
  const [isStyleMenuOpen, setIsStyleMenuOpen] = React.useState(false);
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
  const collapseStyles = isTierAtLeast(tier, 'tier3');

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
    setIsStyleMenuOpen(false);
  };

  const primaryOptions = collapseStyles ? options.filter((option) => option.key === 'bold') : options;
  const overflowOptions = collapseStyles
    ? options.filter((option) => option.key !== 'bold')
    : [];

  return (
    <RibbonControlWrapper align="center" className="!w-fit">
      <RibbonToggleGroup className="w-fit h-full" width="fit">
        {primaryOptions.map((option) => {
          const isOn = option.state === 'on';
          const isMixed = option.state === 'mixed';

          return (
            <RibbonIconButton
              key={option.key}
              icon={option.icon}
              onClick={() => handleClick(option)}
              isActive={isOn}
              isMixed={isMixed}
              title={option.label}
            />
          );
        })}
        {overflowOptions.length > 0 && (
          <Popover
            isOpen={isStyleMenuOpen}
            onOpenChange={setIsStyleMenuOpen}
            placement="bottom"
            offset={6}
            className="ribbon-inline-popover"
            zIndex="z-dropdown"
            content={
              <div className="ribbon-inline-menu">
                {overflowOptions.map((option) => {
                  const isOn = option.state === 'on';
                  const isMixed = option.state === 'mixed';

                  return (
                    <Button
                      key={option.key}
                      variant="ghost"
                      size="sm"
                      className="ribbon-inline-menu-item"
                      onClick={() => handleClick(option)}
                      data-active={isOn}
                      data-mixed={isMixed}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                    </Button>
                  );
                })}
              </div>
            }
          >
            <RibbonIconButton
              icon={<MoreHorizontal size={RIBBON_ICON_SIZES.sm} />}
              onClick={() => undefined}
              title="Mais estilos"
            />
          </Popover>
        )}
      </RibbonToggleGroup>
    </RibbonControlWrapper>
  );
};

const useLinkedRowWidth = () => {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | undefined>();

  React.useEffect(() => {
    if (!node) {
      setWidth(undefined);
      return;
    }

    const updateWidth = () => {
      const rect = node.getBoundingClientRect();
      const next = Math.round(rect.width);
      setWidth((prev) => (prev === next ? prev : next));
    };

    updateWidth();

    if (typeof window === 'undefined') {
      return;
    }

    const { ResizeObserver } = window;
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [node]);

  const ref = React.useCallback((element: HTMLDivElement | null) => {
    setNode(element);
  }, []);

  return { width, ref };
};

const ResponsiveRibbonColumn: React.FC<{
  top: React.ReactNode;
  bottom: React.ReactNode;
}> = ({ top, bottom }) => {
  const { width, ref } = useLinkedRowWidth();

  return (
    <div className="ribbon-column">
      <div className="ribbon-row-top" style={width ? { width: `${width}px` } : undefined}>
        {top}
      </div>
      <div className="ribbon-row-bottom" ref={ref}>
        {bottom}
      </div>
    </div>
  );
};

export const TextFormatGroup: React.FC<TextControlProps> = (props) => (
  <div className="flex flex-row h-full gap-2 px-1 items-center">
    <ResponsiveRibbonColumn
      top={<FontFamilyControl {...props} />}
      bottom={<TextStyleControl {...props} />}
    />
    <ResponsiveRibbonColumn
      top={<FontSizeControl {...props} />}
      bottom={<TextAlignControl {...props} />}
    />
  </div>
);
