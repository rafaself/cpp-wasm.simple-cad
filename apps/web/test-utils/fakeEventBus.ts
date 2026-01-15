type Listener<T> = (payload: T) => void;

export class FakeEventBus {
  private listeners = new Map<string, Set<Listener<any>>>();

  subscribe<T = unknown>(event: string, listener: Listener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<any>);
    return () => {
      this.listeners.get(event)?.delete(listener as Listener<any>);
    };
  }

  emit<T = unknown>(event: string, payload: T): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(payload);
    }
  }
}
