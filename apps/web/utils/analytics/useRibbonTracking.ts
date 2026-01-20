/**
 * React Hook for Ribbon Interaction Tracking
 *
 * Automatically tracks ribbon interactions when used in ribbon components.
 *
 * Usage:
 *   const tracking = useRibbonTracking('inicio', 'arquivo')
 *   tracking.trackClick('save-file', 'action')
 */

import { useCallback, useRef } from 'react'
import { ribbonAnalytics } from './ribbonAnalytics'

export interface RibbonTrackingContext {
  tabId: string
  groupId?: string
}

export interface RibbonTrackingHook {
  trackClick: (itemId: string, itemType: 'tool' | 'action' | 'custom', executionTime?: number) => void
  trackHover: (itemId: string, duration: number) => void
  trackShortcut: (itemId: string, shortcutKey: string) => void
  startHoverTimer: (itemId: string) => () => void
  trackMisclick: (itemId: string, undoDelay: number) => void
}

export function useRibbonTracking(
  tabId: string,
  groupId?: string
): RibbonTrackingHook {
  const contextRef = useRef<RibbonTrackingContext>({ tabId, groupId })

  // Update context ref when props change
  contextRef.current = { tabId, groupId }

  const trackClick = useCallback(
    (itemId: string, itemType: 'tool' | 'action' | 'custom', executionTime?: number) => {
      ribbonAnalytics.trackClick(itemId, itemType, {
        ...contextRef.current,
        executionTime
      })
    },
    []
  )

  const trackHover = useCallback(
    (itemId: string, duration: number) => {
      ribbonAnalytics.trackHover(itemId, duration, contextRef.current)
    },
    []
  )

  const trackShortcut = useCallback(
    (itemId: string, shortcutKey: string) => {
      ribbonAnalytics.trackShortcut(itemId, shortcutKey, {
        tabId: contextRef.current.tabId
      })
    },
    []
  )

  const startHoverTimer = useCallback(
    (itemId: string) => {
      const startTime = Date.now()

      return () => {
        const duration = Date.now() - startTime
        if (duration > 200) {  // Only track hovers > 200ms
          trackHover(itemId, duration)
        }
      }
    },
    [trackHover]
  )

  const trackMisclick = useCallback(
    (itemId: string, undoDelay: number) => {
      ribbonAnalytics.trackMisclick(itemId, undoDelay, contextRef.current)
    },
    []
  )

  return {
    trackClick,
    trackHover,
    trackShortcut,
    startHoverTimer,
    trackMisclick
  }
}

/**
 * Hook for tracking tab switches
 */
export function useRibbonTabTracking() {
  const trackTabSwitch = useCallback(
    (fromTabId: string, toTabId: string, method: 'click' | 'keyboard') => {
      ribbonAnalytics.trackTabSwitch(fromTabId, toTabId, method)
    },
    []
  )

  return { trackTabSwitch }
}

/**
 * Hook for tracking misclicks (click followed by immediate undo)
 */
export function useRibbonMisclickDetector() {
  const lastClickRef = useRef<{ itemId: string; timestamp: number; tabId: string; groupId?: string } | null>(null)

  const recordClick = useCallback((itemId: string, tabId: string, groupId?: string) => {
    lastClickRef.current = {
      itemId,
      timestamp: Date.now(),
      tabId,
      groupId
    }
  }, [])

  const checkForMisclick = useCallback(() => {
    if (lastClickRef.current) {
      const undoDelay = Date.now() - lastClickRef.current.timestamp

      // Consider it a misclick if undo happened within 3 seconds
      if (undoDelay < 3000) {
        ribbonAnalytics.trackMisclick(
          lastClickRef.current.itemId,
          undoDelay,
          {
            tabId: lastClickRef.current.tabId,
            groupId: lastClickRef.current.groupId
          }
        )
      }

      lastClickRef.current = null
    }
  }, [])

  return {
    recordClick,
    checkForMisclick
  }
}
