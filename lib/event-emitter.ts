export interface AppEvent {
  type: 'chat' | 'diagnose' | 'report' | 'cost' | 'access';
  timestamp: number;
  data: Record<string, unknown>;
}

type Listener = (event: AppEvent) => void;

class ServerEventHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: AppEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Keep one failed dashboard connection from affecting others.
      }
    }
  }

  get connectionCount(): number {
    return this.listeners.size;
  }
}

export const serverEvents = new ServerEventHub();
