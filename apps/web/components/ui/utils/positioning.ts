export type Placement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end';

export interface PositionOptions {
  placement?: Placement;
  offset?: number;
  flip?: boolean;
}

export interface Coordinates {
  top: number;
  left: number;
}

export function calculatePosition(
  triggerRect: DOMRect,
  contentRect: DOMRect,
  options: PositionOptions = {},
): Coordinates {
  const { placement = 'bottom', offset = 4 } = options;

  let top = 0;
  let left = 0;

  switch (placement) {
    case 'top':
      top = triggerRect.top - contentRect.height - offset;
      left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
      break;
    case 'top-start':
      top = triggerRect.top - contentRect.height - offset;
      left = triggerRect.left;
      break;
    case 'top-end':
      top = triggerRect.top - contentRect.height - offset;
      left = triggerRect.right - contentRect.width;
      break;
    case 'bottom':
      top = triggerRect.bottom + offset;
      left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
      break;
    case 'bottom-start':
      top = triggerRect.bottom + offset;
      left = triggerRect.left;
      break;
    case 'bottom-end':
      top = triggerRect.bottom + offset;
      left = triggerRect.right - contentRect.width;
      break;
    case 'left':
      top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
      left = triggerRect.left - contentRect.width - offset;
      break;
    case 'right':
      top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
      left = triggerRect.right + offset;
      break;
  }

  return {
    top,
    left,
  };
}
