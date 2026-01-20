/**
 * RibbonSplitButton Component
 *
 * Phase 2: Component Refactor + Unified States
 * A split button with a primary action and a dropdown menu of related actions.
 *
 * Usage:
 *   <RibbonSplitButton
 *     label="Save"
 *     icon={<Save />}
 *     onClick={() => save()}
 *     items={[
 *       { id: 'save-as', label: 'Save As...', onClick: () => saveAs() },
 *       { id: 'save-copy', label: 'Save Copy', onClick: () => saveCopy() }
 *     ]}
 *   />
 */

import { ChevronDown } from 'lucide-react'
import React, { useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { LABELS } from '@/i18n/labels'
import { useRibbonTracking } from '@/utils/analytics/useRibbonTracking'

import { isRibbonDebugEnabled } from './ribbonDebug'
import { combineClasses, getStateClasses, resolveButtonVariant, type RibbonButtonIntent } from './ribbonButtonState'

// ============================================================================
// Types
// ============================================================================

export interface RibbonSplitButtonItem {
  id: string
  label: string
  icon?: React.ComponentType<{ size?: number | string }>
  onClick: () => void
  disabled?: boolean
  intent?: RibbonButtonIntent
}

export interface RibbonSplitButtonProps {
  // Primary action
  label: string
  icon?: React.ComponentType<{ size?: number | string }>
  onClick: () => void

  // Dropdown items
  items: RibbonSplitButtonItem[]

  // State
  isActive?: boolean
  disabled?: boolean
  intent?: RibbonButtonIntent

  // Appearance
  size?: 'sm' | 'md'
  width?: 'sm' | 'md' | 'lg' | 'auto'

  // Metadata
  title?: string

  // Tracking
  tabId: string
  groupId: string
}

// ============================================================================
// Component
// ============================================================================

export const RibbonSplitButton: React.FC<RibbonSplitButtonProps> = ({
  label,
  icon: IconComponent,
  onClick,
  items,
  isActive = false,
  disabled = false,
  intent = 'default',
  size = 'md',
  width = 'auto',
  title,
  tabId,
  groupId
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownButtonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const tracking = useRibbonTracking(tabId, groupId)

  // Width classes
  const widthClasses = {
    sm: 'w-20',
    md: 'w-28',
    lg: 'w-36',
    auto: 'w-auto'
  }

  // Resolve variant and classes
  const variant = resolveButtonVariant(
    isActive ? 'active' : 'default',
    intent,
    isActive,
    'mode'
  )

  const stateClasses = getStateClasses({ isActive, isDisabled: disabled, intent, activeStyle: 'mode' })

  const debugClass = isRibbonDebugEnabled() ? ' ribbon-debug-control' : ''

  // Height based on size
  const heightClass = size === 'sm' ? 'h-6' : 'h-8'

  // Handle primary action click
  const handlePrimaryClick = () => {
    if (disabled) return
    tracking.trackClick(`${label}-primary`, 'action')
    onClick()
  }

  // Handle dropdown toggle
  const handleDropdownToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    setIsDropdownOpen(!isDropdownOpen)
    tracking.trackClick(`${label}-dropdown`, 'action')
  }

  // Handle dropdown item click
  const handleItemClick = (item: RibbonSplitButtonItem) => {
    if (item.disabled) return
    tracking.trackClick(item.id, 'action')
    item.onClick()
    setIsDropdownOpen(false)
    dropdownButtonRef.current?.focus()
  }

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!isDropdownOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !dropdownButtonRef.current?.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false)
        dropdownButtonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isDropdownOpen])

  return (
    <div className={combineClasses('relative inline-flex', widthClasses[width])}>
      {/* Primary Action Button */}
      <Button
        variant={variant}
        size={size === 'sm' ? 'sm' : 'md'}
        onClick={handlePrimaryClick}
        disabled={disabled}
        title={title || label}
        className={combineClasses(
          heightClass,
          'flex-1 rounded-r-none border-r-0 justify-start px-2.5',
          stateClasses,
          debugClass
        )}
        leftIcon={IconComponent ? <Icon icon={IconComponent} size="sm" /> : undefined}
      >
        <span className="truncate">{label}</span>
      </Button>

      {/* Dropdown Toggle Button */}
      <Button
        ref={dropdownButtonRef}
        variant={variant}
        size={size === 'sm' ? 'sm' : 'md'}
        onClick={handleDropdownToggle}
        disabled={disabled}
        title={LABELS.common.moreOptions}
        aria-haspopup="true"
        aria-expanded={isDropdownOpen}
        className={combineClasses(
          heightClass,
          'w-6 rounded-l-none px-0 justify-center',
          stateClasses,
          debugClass
        )}
      >
        <ChevronDown size={12} />
      </Button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          className="absolute top-full left-0 mt-1 min-w-full w-max bg-surface-2 border border-border rounded shadow-lg py-1 z-dropdown"
          style={{ minWidth: '160px' }}
        >
          {items.map((item) => {
            const ItemIcon = item.icon
            return (
              <button
                key={item.id}
                role="menuitem"
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                className={combineClasses(
                  'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
                  'hover:bg-surface-3 focus:bg-surface-3 focus-outline',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors'
                )}
                title={item.label}
              >
                {ItemIcon && (
                  <span className="flex-shrink-0">
                    <Icon icon={ItemIcon} size="sm" />
                  </span>
                )}
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default RibbonSplitButton
