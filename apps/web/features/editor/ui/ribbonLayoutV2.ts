import { RibbonGroup, RibbonItem, RibbonTab } from './ribbonConfig';

export type RibbonLayoutTier = 'full' | 'tier1' | 'tier2' | 'tier3' | 'tier4';

export type RibbonOverflowEntry = {
  item: RibbonItem;
  groupId: string;
  groupLabel: string;
};

export const RIBBON_TIER_BREAKPOINTS = {
  full: 1400,
  tier1: 1200,
  tier2: 1000,
  tier3: 800,
} as const;

const TIER_ORDER: RibbonLayoutTier[] = ['full', 'tier1', 'tier2', 'tier3', 'tier4'];

export const isTierAtLeast = (tier: RibbonLayoutTier, minTier: RibbonLayoutTier): boolean =>
  TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minTier);

export const getRibbonLayoutTier = (width: number): RibbonLayoutTier => {
  if (width >= RIBBON_TIER_BREAKPOINTS.full) return 'full';
  if (width >= RIBBON_TIER_BREAKPOINTS.tier1) return 'tier1';
  if (width >= RIBBON_TIER_BREAKPOINTS.tier2) return 'tier2';
  if (width >= RIBBON_TIER_BREAKPOINTS.tier3) return 'tier3';
  return 'tier4';
};

const NEVER_HIDE_IDS = new Set<string>([
  // Home
  'open-file',
  'save-file',
  // Draw
  'select',
  'line',
  'rect',
  'circle',
  'undo',
  // Annotate
  'text',
  // View
  'pan',
  'zoom-to-fit',
]);

const COLLAPSE_TIER2_IDS = new Set<string>(['polygon', 'export-json']);
const COLLAPSE_TIER3_IDS = new Set<string>(['arrow', 'export-project']);

const SHORT_LABELS: Record<string, string> = {
  'zoom-to-fit': 'Ajustar',
  'export-project': 'Projeto',
  'export-json': 'JSON',
};

const shouldOverflow = (item: RibbonItem, tier: RibbonLayoutTier): boolean => {
  if (item.kind === 'custom') return false;
  if (NEVER_HIDE_IDS.has(item.id)) return false;
  if (tier === 'tier4') return true;
  if (tier === 'tier3') return COLLAPSE_TIER2_IDS.has(item.id) || COLLAPSE_TIER3_IDS.has(item.id);
  if (tier === 'tier2') return COLLAPSE_TIER2_IDS.has(item.id);
  return false;
};

const applyLabelShortening = (item: RibbonItem, tier: RibbonLayoutTier): RibbonItem => {
  if (tier !== 'tier1') return item;
  const shortLabel = SHORT_LABELS[item.id];
  if (!shortLabel || shortLabel === item.label) return item;
  return { ...item, label: shortLabel };
};

export const computeRibbonLayoutV2 = (
  tab: RibbonTab,
  tier: RibbonLayoutTier,
): { groups: RibbonGroup[]; overflow: RibbonOverflowEntry[] } => {
  const overflow: RibbonOverflowEntry[] = [];
  const groups = tab.groups.map((group) => {
    const groupLabel = group.label ?? group.id;
    const items = group.items.flatMap((item) => {
      if (shouldOverflow(item, tier)) {
        overflow.push({ item, groupId: group.id, groupLabel });
        return [];
      }
      return [applyLabelShortening(item, tier)];
    });
    return { ...group, items };
  });

  return { groups, overflow };
};

export const RIBBON_V2_NEVER_HIDE_IDS = NEVER_HIDE_IDS;
