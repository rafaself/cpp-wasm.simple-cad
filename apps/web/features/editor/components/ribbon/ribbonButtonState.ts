/**
 * Ribbon Button State Management Utilities
 *
 * Phase 2: Component Refactor + Unified States
 * Centralized logic for button state resolution and class generation.
 */

import React from 'react'

import { ButtonVariant } from '@/components/ui/Button'

import { isRibbonDebugEnabled } from './ribbonDebug'

// ============================================================================
// Type Definitions
// ============================================================================

export type RibbonButtonState =
  | 'default'    // Normal state
  | 'hover'      // Mouse over (handled by CSS)
  | 'pressed'    // Mouse down (handled by CSS)
  | 'active'     // Tool/action is currently active
  | 'disabled'   // Cannot interact
  | 'mixed'      // Multi-selection with different values
  | 'loading'    // Async action in progress
  | 'stub'       // Coming soon (not yet implemented)

export type RibbonButtonIntent =
  | 'default'    // Normal action
  | 'primary'    // Primary action (emphasized)
  | 'danger'     // Destructive action
  | 'warning'    // Caution required
  | 'success'    // Positive action

export type RibbonButtonSize = 'sm' | 'md' | 'lg'

export interface RibbonButtonStateConfig {
  // State flags
  isActive?: boolean
  isDisabled?: boolean
  isMixed?: boolean
  isLoading?: boolean
  isStub?: boolean

  // Intent
  intent?: RibbonButtonIntent

  // Size
  size?: RibbonButtonSize
}

// ============================================================================
// State Resolution
// ============================================================================

/**
 * Resolve the current button state from flags
 */
export function resolveButtonState(config: RibbonButtonStateConfig): RibbonButtonState {
  // Priority order:
  // 1. Disabled/Loading/Stub → specific states
  // 2. Mixed → special indicator
  // 3. Active → tool/action active
  // 4. Default → normal state

  if (config.isDisabled) return 'disabled'
  if (config.isLoading) return 'loading'
  if (config.isStub) return 'stub'
  if (config.isMixed) return 'mixed'
  if (config.isActive) return 'active'

  return 'default'
}

/**
 * Map button state and intent to Button primitive variant
 */
export function resolveButtonVariant(
  state: RibbonButtonState,
  intent: RibbonButtonIntent = 'default',
  isActive: boolean = false
): ButtonVariant {
  // Special states use secondary as base
  if (state === 'disabled') return 'secondary'
  if (state === 'loading') return 'secondary'
  if (state === 'stub') return 'secondary'
  if (state === 'mixed') return 'secondary'

  // Active state always uses primary
  if (isActive) return 'primary'

  // Map intent to variant
  switch (intent) {
    case 'primary':
      return 'primary'
    case 'danger':
      return 'danger'
    case 'warning':
      return 'secondary'  // Custom class applied separately
    case 'success':
      return 'secondary'  // Custom class applied separately
    default:
      return 'secondary'
  }
}

// ============================================================================
// CSS Class Generation
// ============================================================================

/**
 * Generate state-specific CSS classes
 */
export function getStateClasses(config: RibbonButtonStateConfig): string {
  const classes: string[] = []

  const state = resolveButtonState(config)

  // State classes
  if (state === 'mixed') classes.push('ribbon-btn-mixed')
  if (state === 'loading') classes.push('ribbon-btn-loading')
  if (state === 'stub') classes.push('ribbon-btn-stub')
  if (state === 'active') classes.push('ribbon-btn-active')

  // Intent classes (only for non-active states)
  if (!config.isActive && config.intent) {
    if (config.intent === 'warning') classes.push('ribbon-btn-intent-warning')
    if (config.intent === 'success') classes.push('ribbon-btn-intent-success')
  }

  // Debug class
  if (isRibbonDebugEnabled()) {
    classes.push('ribbon-debug-control')
  }

  return classes.join(' ')
}

/**
 * Get size-specific height classes
 */
export function getSizeClasses(size: RibbonButtonSize = 'md'): string {
  switch (size) {
    case 'sm':
      return 'h-6'  // 24px
    case 'md':
      return 'h-8'  // 32px
    case 'lg':
      return 'h-[52px]'  // 52px (large buttons)
    default:
      return 'h-8'
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Combine multiple class strings, filtering out empty strings
 */
export function combineClasses(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Check if button should be interactable
 */
export function isButtonInteractable(config: RibbonButtonStateConfig): boolean {
  return !config.isDisabled && !config.isLoading && !config.isStub
}

/**
 * Get appropriate cursor style
 */
export function getCursorClass(config: RibbonButtonStateConfig): string {
  if (config.isDisabled || config.isStub) return 'cursor-not-allowed'
  if (config.isLoading) return 'cursor-wait'
  return 'cursor-pointer'
}

/**
 * Generate aria-pressed value for toggle buttons
 */
export function getAriaPressed(config: RibbonButtonStateConfig): boolean | 'mixed' | undefined {
  if (config.isMixed) return 'mixed'
  if (config.isActive !== undefined) return config.isActive
  return undefined
}

// ============================================================================
// Mixed State Icon Wrapper
// ============================================================================

/**
 * Wrap icon content for mixed state display
 */
export function wrapMixedStateIcon(
  icon: React.ReactNode,
  isMixed: boolean
): React.ReactNode {
  if (!isMixed) return icon

  // Show "—" symbol for mixed state
  return React.createElement(
    'span',
    { className: 'ribbon-btn-mixed-icon', title: 'Mixed values' },
    '—'
  )
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that conflicting states are not both set
 */
export function validateStateConfig(config: RibbonButtonStateConfig): void {
  const activeStates = [
    config.isDisabled,
    config.isLoading,
    config.isStub
  ].filter(Boolean).length

  if (activeStates > 1) {
    console.warn(
      '[RibbonButton] Multiple exclusive states set:',
      { isDisabled: config.isDisabled, isLoading: config.isLoading, isStub: config.isStub }
    )
  }

  if (config.isActive && config.isMixed) {
    console.warn(
      '[RibbonButton] Both isActive and isMixed set. Mixed state takes precedence.'
    )
  }
}
