export class Settings {
  private static readonly STORE = 'ttt-jev-arena-settings';
  private values: Record<string, any>;

  constructor() {
    this.values = {
      jevModel: 'jev-latest',
      llmModel: '',
      hints: true,
      delay: 700,
      autoNext: true,
      alternate: true,
      remember: false,
    };
    try {
      const raw = localStorage.getItem(Settings.STORE);
      if (raw) this.values = { ...this.values, ...JSON.parse(raw) };
    } catch {}
  }

  get(key: string) { return this.values[key]; }

  set(key: string, value: unknown) {
    this.values[key] = value;
    this.persist();
  }

  snapshot() { return { ...this.values }; }

  private persist() {
    try {
      if (this.values.remember) localStorage.setItem(Settings.STORE, JSON.stringify(this.values));
      else localStorage.removeItem(Settings.STORE);
    } catch {}
  }
}
