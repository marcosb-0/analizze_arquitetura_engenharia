// APIs que o React Aria / HeroUI usam e o jsdom não tem. Nos testes em `node` não há `window`.
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getAnimations ??= () => [];
}
