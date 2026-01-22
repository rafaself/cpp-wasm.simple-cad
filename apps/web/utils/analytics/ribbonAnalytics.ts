/**
 * Ribbon Analytics Event Tracking System
 *
 * Lightweight local analytics for tracking ribbon interactions during Phase 0 baseline measurement.
 * No external services - stores events locally for analysis.
 *
 * Usage:
 *   ribbonAnalytics.trackClick('line-tool', { tab: 'draw', group: 'shapes' })
 *   ribbonAnalytics.trackHover('save-button', { duration: 1500 })
 *   ribbonAnalytics.getReport()
 */

// ============================================================================
// Event Schema
// ============================================================================

export type RibbonEventType =
  | 'click' // Button/control clicked
  | 'hover' // Hover with duration
  | 'shortcut' // Keyboard shortcut used
  | 'tab_switch' // Tab changed
  | 'overflow_open' // Overflow menu opened
  | 'tooltip_show' // Tooltip displayed
  | 'misclick'; // Click followed immediately by undo

export interface RibbonEventBase {
  type: RibbonEventType;
  timestamp: number;
  sessionId: string;
  tabId: string;
  groupId?: string;
  itemId?: string;
}

export interface RibbonClickEvent extends RibbonEventBase {
  type: 'click';
  itemId: string;
  itemType: 'tool' | 'action' | 'custom';
  executionTime?: number; // Time from click to action completion (ms)
}

export interface RibbonHoverEvent extends RibbonEventBase {
  type: 'hover';
  itemId: string;
  duration: number; // Hover duration in ms
}

export interface RibbonShortcutEvent extends RibbonEventBase {
  type: 'shortcut';
  itemId: string;
  shortcutKey: string;
}

export interface RibbonTabSwitchEvent extends RibbonEventBase {
  type: 'tab_switch';
  fromTabId: string;
  toTabId: string;
  method: 'click' | 'keyboard'; // How tab was switched
}

export interface RibbonOverflowEvent extends RibbonEventBase {
  type: 'overflow_open';
  itemCount: number; // Number of items in overflow
}

export interface RibbonTooltipEvent extends RibbonEventBase {
  type: 'tooltip_show';
  itemId: string;
  showDelay: number; // Time from hover to tooltip show
}

export interface RibbonMisclickEvent extends RibbonEventBase {
  type: 'misclick';
  itemId: string;
  undoDelay: number; // Time from click to undo (ms)
}

export type RibbonEvent =
  | RibbonClickEvent
  | RibbonHoverEvent
  | RibbonShortcutEvent
  | RibbonTabSwitchEvent
  | RibbonOverflowEvent
  | RibbonTooltipEvent
  | RibbonMisclickEvent;

// ============================================================================
// Analytics Store
// ============================================================================

interface RibbonAnalyticsConfig {
  enabled: boolean;
  persistToLocalStorage: boolean;
  maxEvents: number;
  sessionDuration: number; // Minutes before new session
}

class RibbonAnalytics {
  private events: RibbonEvent[] = [];
  private sessionId: string;
  private sessionStartTime: number;
  private lastActivityTime: number;
  private config: RibbonAnalyticsConfig;

  private readonly STORAGE_KEY = 'ribbon_analytics_events';
  private readonly SESSION_KEY = 'ribbon_analytics_session';

  constructor(config: Partial<RibbonAnalyticsConfig> = {}) {
    this.config = {
      enabled: import.meta.env.DEV, // Only in development by default
      persistToLocalStorage: true,
      maxEvents: 10000,
      sessionDuration: 30, // 30 minutes
      ...config,
    };

    this.sessionId = this.initSession();
    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();

    if (this.config.persistToLocalStorage) {
      this.loadPersistedEvents();
    }

    // Auto-save on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.persistEvents());
    }
  }

  private initSession(): string {
    if (!this.config.persistToLocalStorage) {
      return this.generateSessionId();
    }

    try {
      const stored = localStorage.getItem(this.SESSION_KEY);
      if (stored) {
        const { sessionId, timestamp } = JSON.parse(stored);
        const elapsed = (Date.now() - timestamp) / 1000 / 60; // Minutes

        if (elapsed < this.config.sessionDuration) {
          return sessionId; // Continue existing session
        }
      }
    } catch (e) {
      console.warn('Failed to load session:', e);
    }

    return this.generateSessionId();
  }

  private generateSessionId(): string {
    return `ribbon_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private updateSession(): void {
    this.lastActivityTime = Date.now();

    if (this.config.persistToLocalStorage) {
      try {
        localStorage.setItem(
          this.SESSION_KEY,
          JSON.stringify({
            sessionId: this.sessionId,
            timestamp: this.lastActivityTime,
          }),
        );
      } catch (e) {
        console.warn('Failed to update session:', e);
      }
    }
  }

  private loadPersistedEvents(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.events = JSON.parse(stored);
        console.log(`[RibbonAnalytics] Loaded ${this.events.length} persisted events`);
      }
    } catch (e) {
      console.warn('Failed to load persisted events:', e);
      this.events = [];
    }
  }

  private persistEvents(): void {
    if (!this.config.persistToLocalStorage) return;

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.events));
    } catch (e) {
      console.warn('Failed to persist events:', e);
    }
  }

  private addEvent(event: RibbonEvent): void {
    if (!this.config.enabled) return;

    this.events.push(event);
    this.updateSession();

    // Trim old events if exceeding max
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents);
    }

    // Persist periodically (every 10 events)
    if (this.events.length % 10 === 0) {
      this.persistEvents();
    }
  }

  // ============================================================================
  // Public Tracking Methods
  // ============================================================================

  trackClick(
    itemId: string,
    itemType: 'tool' | 'action' | 'custom',
    context: { tabId: string; groupId?: string; executionTime?: number },
  ): void {
    this.addEvent({
      type: 'click',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      itemId,
      itemType,
      ...context,
    });
  }

  trackHover(itemId: string, duration: number, context: { tabId: string; groupId?: string }): void {
    this.addEvent({
      type: 'hover',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      itemId,
      duration,
      ...context,
    });
  }

  trackShortcut(itemId: string, shortcutKey: string, context: { tabId: string }): void {
    this.addEvent({
      type: 'shortcut',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      itemId,
      shortcutKey,
      ...context,
    });
  }

  trackTabSwitch(fromTabId: string, toTabId: string, method: 'click' | 'keyboard'): void {
    this.addEvent({
      type: 'tab_switch',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      tabId: toTabId,
      fromTabId,
      toTabId,
      method,
    });
  }

  trackOverflowOpen(tabId: string, itemCount: number): void {
    this.addEvent({
      type: 'overflow_open',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      tabId,
      itemCount,
    });
  }

  trackTooltipShow(
    itemId: string,
    showDelay: number,
    context: { tabId: string; groupId?: string },
  ): void {
    this.addEvent({
      type: 'tooltip_show',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      itemId,
      showDelay,
      ...context,
    });
  }

  trackMisclick(
    itemId: string,
    undoDelay: number,
    context: { tabId: string; groupId?: string },
  ): void {
    this.addEvent({
      type: 'misclick',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      itemId,
      undoDelay,
      ...context,
    });
  }

  // ============================================================================
  // Query & Analysis Methods
  // ============================================================================

  getEvents(
    filter?: Partial<{ type: RibbonEventType; itemId: string; sessionId: string }>,
  ): RibbonEvent[] {
    let filtered = this.events;

    if (filter?.type) {
      filtered = filtered.filter((e) => e.type === filter.type);
    }
    if (filter?.itemId) {
      filtered = filtered.filter((e) => 'itemId' in e && e.itemId === filter.itemId);
    }
    if (filter?.sessionId) {
      filtered = filtered.filter((e) => e.sessionId === filter.sessionId);
    }

    return filtered;
  }

  getClickCounts(): Record<string, number> {
    const counts: Record<string, number> = {};

    this.events
      .filter((e): e is RibbonClickEvent => e.type === 'click')
      .forEach((e) => {
        counts[e.itemId] = (counts[e.itemId] || 0) + 1;
      });

    return counts;
  }

  getShortcutUsage(): Record<string, { count: number; shortcut: string }> {
    const usage: Record<string, { count: number; shortcut: string }> = {};

    this.events
      .filter((e): e is RibbonShortcutEvent => e.type === 'shortcut')
      .forEach((e) => {
        if (!usage[e.itemId]) {
          usage[e.itemId] = { count: 0, shortcut: e.shortcutKey };
        }
        usage[e.itemId].count++;
      });

    return usage;
  }

  getTabSwitchCount(): number {
    return this.events.filter((e) => e.type === 'tab_switch').length;
  }

  getMisclickRate(): { total: number; misclicks: number; rate: number } {
    const clicks = this.events.filter((e) => e.type === 'click').length;
    const misclicks = this.events.filter((e) => e.type === 'misclick').length;

    return {
      total: clicks,
      misclicks,
      rate: clicks > 0 ? misclicks / clicks : 0,
    };
  }

  getAverageHoverDuration(itemId?: string): number {
    const hovers = this.events
      .filter((e): e is RibbonHoverEvent => e.type === 'hover')
      .filter((e) => !itemId || e.itemId === itemId);

    if (hovers.length === 0) return 0;

    const total = hovers.reduce((sum, e) => sum + e.duration, 0);
    return total / hovers.length;
  }

  // ============================================================================
  // Reporting
  // ============================================================================

  getReport(): RibbonAnalyticsReport {
    const sessionDuration = (this.lastActivityTime - this.sessionStartTime) / 1000 / 60; // Minutes
    const clickCounts = this.getClickCounts();
    const shortcutUsage = this.getShortcutUsage();
    const misclickData = this.getMisclickRate();

    // Top 10 most clicked items
    const topClicks = Object.entries(clickCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([itemId, count]) => ({ itemId, count }));

    // Commands with shortcuts vs clicks
    const shortcutVsClick = Object.keys(shortcutUsage).map((itemId) => ({
      itemId,
      shortcutCount: shortcutUsage[itemId].count,
      clickCount: clickCounts[itemId] || 0,
      ratio:
        shortcutUsage[itemId].count / ((clickCounts[itemId] || 0) + shortcutUsage[itemId].count),
    }));

    return {
      sessionId: this.sessionId,
      sessionDuration,
      totalEvents: this.events.length,
      eventCounts: {
        click: this.events.filter((e) => e.type === 'click').length,
        hover: this.events.filter((e) => e.type === 'hover').length,
        shortcut: this.events.filter((e) => e.type === 'shortcut').length,
        tabSwitch: this.getTabSwitchCount(),
        overflow: this.events.filter((e) => e.type === 'overflow_open').length,
        tooltip: this.events.filter((e) => e.type === 'tooltip_show').length,
        misclick: misclickData.misclicks,
      },
      topClicks,
      shortcutVsClick,
      misclickRate: misclickData.rate,
      averageHoverDuration: this.getAverageHoverDuration(),
    };
  }

  exportToJSON(): string {
    return JSON.stringify(
      {
        report: this.getReport(),
        events: this.events,
      },
      null,
      2,
    );
  }

  exportToCSV(): string {
    const headers = ['timestamp', 'type', 'itemId', 'tabId', 'groupId', 'details'];
    const rows = this.events.map((e) => {
      const details = JSON.stringify(e);
      return [
        new Date(e.timestamp).toISOString(),
        e.type,
        'itemId' in e ? e.itemId : '',
        e.tabId,
        e.groupId || '',
        details,
      ]
        .map((v) => `"${v}"`)
        .join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  clearEvents(): void {
    this.events = [];
    this.persistEvents();
    console.log('[RibbonAnalytics] Events cleared');
  }

  // ============================================================================
  // Dev Tools
  // ============================================================================

  installDevTools(): void {
    if (typeof window === 'undefined') return;

    (window as any).__ribbonAnalytics = {
      getReport: () => this.getReport(),
      getEvents: (filter?: any) => this.getEvents(filter),
      exportJSON: () => this.exportToJSON(),
      exportCSV: () => this.exportToCSV(),
      clear: () => this.clearEvents(),
      enable: () => {
        this.config.enabled = true;
      },
      disable: () => {
        this.config.enabled = false;
      },
    };

    console.log('[RibbonAnalytics] Dev tools installed: window.__ribbonAnalytics');
  }
}

// ============================================================================
// Report Types
// ============================================================================

export interface RibbonAnalyticsReport {
  sessionId: string;
  sessionDuration: number; // Minutes
  totalEvents: number;
  eventCounts: {
    click: number;
    hover: number;
    shortcut: number;
    tabSwitch: number;
    overflow: number;
    tooltip: number;
    misclick: number;
  };
  topClicks: Array<{ itemId: string; count: number }>;
  shortcutVsClick: Array<{
    itemId: string;
    shortcutCount: number;
    clickCount: number;
    ratio: number; // shortcutCount / total
  }>;
  misclickRate: number;
  averageHoverDuration: number; // Milliseconds
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const ribbonAnalytics = new RibbonAnalytics();

// Install dev tools in development
if (import.meta.env.DEV) {
  ribbonAnalytics.installDevTools();
}
