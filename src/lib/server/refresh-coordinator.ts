// Share a rotation across concurrent requests in this web process. Successful
// results briefly survive so requests already carrying the old cookie can finish.
export class RefreshCoordinator<T> {
  private readonly entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();

  constructor(private readonly graceMs = 10_000, private readonly now = Date.now) {}

  run(key: string, work: () => Promise<T>): Promise<T> {
    for (const [entryKey, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) this.entries.delete(entryKey);
    }
    const existing = this.entries.get(key);
    if (existing) return existing.promise;
    const entry = { promise: Promise.resolve().then(work), expiresAt: Infinity };
    this.entries.set(key, entry);
    void entry.promise.then(() => {
      entry.expiresAt = this.now() + this.graceMs;
    }, () => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return entry.promise;
  }
}
