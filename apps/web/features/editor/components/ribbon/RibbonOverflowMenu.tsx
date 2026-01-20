import { MoreHorizontal } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Popover } from '@/components/ui/Popover';
import { getShortcutLabel } from '@/config/keybindings';

import { RibbonItem } from '../../ui/ribbonConfig';
import { RibbonOverflowEntry } from '../../ui/ribbonLayoutV2';

import { getBindingId } from './ribbonUtils';

interface RibbonOverflowMenuProps {
  items: RibbonOverflowEntry[];
  tabId: string;
  onItemSelect: (item: RibbonItem) => void;
}

export const RibbonOverflowMenu: React.FC<RibbonOverflowMenuProps> = ({
  items,
  tabId,
  onItemSelect,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const scrollPositionsRef = React.useRef<Record<string, number>>({});

  const showSearch = items.length > 10;
  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = React.useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter((entry) => entry.item.label.toLowerCase().includes(normalizedQuery));
  }, [items, normalizedQuery]);

  const groupedItems = React.useMemo(() => {
    const groups = new Map<string, RibbonOverflowEntry[]>();
    filteredItems.forEach((entry) => {
      const group = groups.get(entry.groupLabel) ?? [];
      group.push(entry);
      groups.set(entry.groupLabel, group);
    });
    return Array.from(groups.entries());
  }, [filteredItems]);

  React.useEffect(() => {
    if (!isOpen) {
      if (scrollRef.current) {
        scrollPositionsRef.current[tabId] = scrollRef.current.scrollTop;
      }
      setQuery('');
      return;
    }

    const rememberedScroll = scrollPositionsRef.current[tabId] ?? 0;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = rememberedScroll;
    }
    if (showSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen, showSearch, tabId]);

  const handleSelect = (item: RibbonItem) => {
    if (item.status === 'stub') return;
    onItemSelect(item);
    setIsOpen(false);
  };

  return (
    <div className="ribbon-overflow">
      <Popover
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        placement="bottom-end"
        offset={8}
        className="ribbon-overflow-panel"
        zIndex="z-dropdown"
        content={
          <div role="menu" aria-label="Mais comandos">
            {showSearch && (
              <div className="ribbon-overflow-search">
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar comando"
                  inputSize="sm"
                  variant="filled"
                  aria-label="Buscar comando"
                  className="ribbon-overflow-search-input"
                />
              </div>
            )}

            <div className="ribbon-overflow-scroll" ref={scrollRef}>
              {groupedItems.length === 0 ? (
                <div className="ribbon-overflow-empty">Nenhum comando encontrado</div>
              ) : (
                groupedItems.map(([groupLabel, entries]) => (
                  <div key={groupLabel} className="ribbon-overflow-group">
                    <div className="ribbon-overflow-group-title">{groupLabel}</div>
                    {entries.map(({ item }) => {
                      const isStub = item.status === 'stub';
                      const bindingId = getBindingId(item);
                      const shortcut = bindingId ? getShortcutLabel(bindingId) : '';
                      const Icon = item.icon;

                      return (
                      <Button
                        key={item.id}
                        role="menuitem"
                        variant="ghost"
                        size="sm"
                        className="ribbon-overflow-item"
                        title={isStub ? `${item.label} — Em breve` : item.label}
                        aria-disabled={isStub}
                        disabled={isStub}
                        onClick={() => handleSelect(item)}
                      >
                          <span className="ribbon-overflow-item-main">
                            {Icon ? <Icon size={14} /> : null}
                            <span className="ribbon-overflow-item-label">{item.label}</span>
                          </span>
                          {shortcut ? (
                            <span className="ribbon-overflow-shortcut">{shortcut}</span>
                          ) : null}
                        </Button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        }
      >
        <Button
          variant="secondary"
          size="md"
          className="ribbon-overflow-trigger"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <MoreHorizontal size={16} />
          <span className="ribbon-overflow-trigger-label">Mais</span>
        </Button>
      </Popover>
    </div>
  );
};
