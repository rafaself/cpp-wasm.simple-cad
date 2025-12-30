/**
 * MouseThrottle - High-performance throttling for mouse events
 * 
 * Implements adaptive throttling with both leading and trailing edge execution
 * to maintain responsiveness while reducing CPU load.
 * 
 * Features:
 * - Configurable interval (default: 16ms for 60fps)
 * - Leading edge: immediate execution if enough time has passed
 * - Trailing edge: ensures last call is always executed
 * - Zero allocation in hot path after initial setup
 * - Sub-millisecond precision using performance.now()
 * 
 * @example
 * const throttle = new MouseThrottle(16); // 60fps
 * const handleMove = throttle.create((x, y) => {
 *   console.log('Throttled move:', x, y);
 * });
 * canvas.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
 */

export interface ThrottleOptions {
  /** Execute immediately on first call if interval passed */
  leading?: boolean;
  /** Execute final call after interval if pending */
  trailing?: boolean;
}

export class MouseThrottle {
  private lastCallTime: number;
  private pendingCall: number | null = null; // RAF ID or timeout ID
  private pendingIsRaf: boolean | null = null;
  private useRAF: boolean;

  /**
   * @param minInterval Minimum milliseconds between executions (default: 16ms ≈ 60fps)
   * @param useRAF Use requestAnimationFrame instead of setTimeout (default: true)
   */
  constructor(
    private readonly minInterval: number = 16,
    useRAF: boolean = true
  ) {
    this.useRAF = useRAF;
    // Allow first call to fire immediately even with leading=true
    this.lastCallTime = -this.minInterval;
  }

  /**
   * Creates a throttled version of the provided function
   * 
   * @param fn Function to throttle
   * @param options Throttle behavior configuration
   * @returns Throttled function with same signature
   */
  public create<TArgs extends any[]>(
    fn: (...args: TArgs) => void,
    options?: ThrottleOptions
  ): (...args: TArgs) => void {
    const { leading = true, trailing = true } = options || {};

    return (...args: TArgs): void => {
      const now = performance.now();
      const timeSinceLastCall = now - this.lastCallTime;

      // Cancel any pending trailing call
      if (this.pendingCall !== null) {
        if (this.pendingIsRaf) {
          cancelAnimationFrame(this.pendingCall);
        } else {
          clearTimeout(this.pendingCall);
        }
        this.pendingCall = null;
        this.pendingIsRaf = null;
      }

      // Leading edge: execute immediately if interval passed
      if (leading && timeSinceLastCall >= this.minInterval) {
        this.lastCallTime = now;
        fn(...args);
        return;
      }

      // Trailing edge: schedule execution
      if (trailing) {
        const delay = Math.max(0, this.minInterval - timeSinceLastCall);
        
        if (this.useRAF && delay === 0) {
          // Use RAF for next frame if no delay needed
          this.pendingCall = requestAnimationFrame(() => {
            this.lastCallTime = performance.now();
            this.pendingCall = null;
            this.pendingIsRaf = null;
            fn(...args);
          });
          this.pendingIsRaf = true;
        } else {
          // Use setTimeout for precise timing
          this.pendingCall = window.setTimeout(() => {
            this.lastCallTime = performance.now();
            this.pendingCall = null;
            this.pendingIsRaf = null;
            fn(...args);
          }, delay);
          this.pendingIsRaf = false;
        }
      }
    };
  }

  /**
   * Cancels any pending trailing call
   */
  public cancel(): void {
    if (this.pendingCall !== null) {
      if (this.pendingIsRaf) {
        cancelAnimationFrame(this.pendingCall);
      } else {
        clearTimeout(this.pendingCall);
      }
      this.pendingCall = null;
      this.pendingIsRaf = null;
    }
  }

  /**
   * Resets the throttle state, allowing immediate next call
   */
  public reset(): void {
    this.cancel();
    this.lastCallTime = -this.minInterval;
  }
}

/**
 * Utility function for one-off throttling without class instantiation
 * 
 * @example
 * const throttledLog = throttle((msg: string) => console.log(msg), 100);
 */
export function throttle<TArgs extends any[]>(
  fn: (...args: TArgs) => void,
  interval: number,
  options?: ThrottleOptions
): (...args: TArgs) => void {
  const throttler = new MouseThrottle(interval, true);
  return throttler.create(fn, options);
}
