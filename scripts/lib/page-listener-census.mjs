// Injected only by the isolated diagnostic browser, after its blank baseline.
// Count calls, not live listeners: duplicate adds, once/abort removal, property
// assignments, browser internals and other JS worlds cannot be inferred here.
export function installPageListenerCensus() {
  const { prototype } = EventTarget;
  const counts = {
    window: [0, 0], document: [0, 0], node: [0, 0],
    worker: [0, 0], abortSignal: [0, 0], other: [0, 0],
  };
  function record(target, listener, operation) {
    if (listener == null) return;
    const kind = target === window ? "window" : target === document ? "document" :
      target instanceof Node ? "node" : target instanceof Worker ? "worker" :
      target instanceof AbortSignal ? "abortSignal" : "other";
    counts[kind][operation]++;
  }
  const methods = Object.getOwnPropertyDescriptors(prototype);
  Object.defineProperty(prototype, "addEventListener", { ...methods.addEventListener,
    value: function addEventListener(type, listener) {
      Reflect.apply(methods.addEventListener.value, this, arguments);
      record(this, listener, 0);
    },
  });
  Object.defineProperty(prototype, "removeEventListener", { ...methods.removeEventListener,
    value: function removeEventListener(type, listener) {
      Reflect.apply(methods.removeEventListener.value, this, arguments);
      record(this, listener, 1);
    },
  });
  Object.defineProperty(window, "__WITHIN_PAGE_LISTENER_CENSUS__", {
    value: () => Object.fromEntries(Object.entries(counts).map(([key, [adds, removes]]) => [key, { adds, removes }])),
  });
}
