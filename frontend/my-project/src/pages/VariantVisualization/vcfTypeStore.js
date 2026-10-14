// Remembers which file type the analyst opened for the current sample
// ("germline" | "somatic"), so the genome viewer can load the matching VCF
// automatically. A tiny module-level store (same idea as variantStore in
// VariantVisualization.jsx) so no extra props have to be passed through
// VariantDetailPanel.
const store = {
  type: null,
  listeners: new Set(),
  get() {
    return store.type;
  },
  set(t) {
    const next = t === "germline" || t === "somatic" ? t : null;
    if (next === store.type) return;
    store.type = next;
    store.listeners.forEach((l) => l());
  },
  subscribe(listener) {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  },
};

export const vcfTypeStore = store;