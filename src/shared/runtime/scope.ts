/** Owns resources for one UI lifetime. Cleanup is idempotent and runs in reverse order. */
export class ResourceScope {
  private cleanups = new Set<() => void>();
  private disposed = false;
  constructor(private report: (error: unknown) => void = console.error) {}
  get isDisposed(): boolean { return this.disposed; }
  get size(): number { return this.cleanups.size; }
  add(cleanup: () => void): () => void {
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      this.cleanups.delete(release);
      try { cleanup(); } catch (error) { this.report(error); }
    };
    if (this.disposed) release(); else this.cleanups.add(release);
    return release;
  }
  listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions): () => void {
    target.addEventListener(type, listener, options);
    return this.add(() => target.removeEventListener(type, listener, options));
  }
  observe(observer: {disconnect(): void}): () => void {
    return this.add(() => observer.disconnect());
  }
  timeout(callback: () => void, milliseconds: number): () => void {
    let release = () => {};
    const id = globalThis.setTimeout(() => { release(); callback(); }, milliseconds);
    release = this.add(() => globalThis.clearTimeout(id));
    return release;
  }
  interval(callback: () => void, milliseconds: number): () => void {
    const id = globalThis.setInterval(callback, milliseconds);
    return this.add(() => globalThis.clearInterval(id));
  }
  frame(callback: FrameRequestCallback): () => void {
    let release = () => {};
    const id = globalThis.requestAnimationFrame(time => { release(); callback(time); });
    release = this.add(() => globalThis.cancelAnimationFrame(id));
    return release;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of [...this.cleanups].reverse()) release();
  }
}
export const runtime = Object.freeze({ResourceScope});
globalThis.CZRuntime = runtime;
