(function (root) {
  'use strict';
  // No access flags or recipe contents are persisted in browser storage.
  function createController({ rpc, context, changed }) {
    let key = '', generation = 0, view = { phase: 'idle' };
    const contextKey = () => JSON.stringify(context());
    function sync() {
      const next = contextKey();
      if (next !== key) { key = next; generation++; view = { phase: 'idle' }; }
    }
    function snapshot() { sync(); return view; }
    function invalidate() { generation++; view = { phase: 'idle' }; }
    function allowed() { const c = context(); return c.role === 'storeOwner' && !!c.storeId && !!c.userId; }
    async function load() {
      sync();
      if (!allowed() || view.phase === 'loading') return;
      const requestKey = key, request = ++generation, storeId = context().storeId;
      const recipeError = !!view.recipeError;
      view = { phase: 'loading' }; changed();
      try {
        const { data, error } = await rpc('manee_factory_catalog', { p_store_id: storeId });
        if (error) throw error;
        if (requestKey !== contextKey() || request !== generation) return;
        if (!data || typeof data.logistics_active !== 'boolean' || !Array.isArray(data.recipes)) throw new Error('Invalid catalog');
        view = { phase: 'ready', active: data.logistics_active, recipes: data.recipes, recipeError };
      } catch (_) {
        if (requestKey !== contextKey() || request !== generation) return;
        view = { phase: 'error' };
      }
      changed();
    }
    async function openRecipe(id) {
      sync();
      if (!allowed() || view.phase !== 'ready' || !view.active || view.recipeLoading) return;
      const requestKey = key, request = ++generation, storeId = context().storeId;
      view = { ...view, recipe: null, recipeError: false, recipeLoading: true }; changed();
      try {
        // The server rechecks current logistics usage on EVERY recipe request.
        const { data, error } = await rpc('manee_factory_recipe', { p_store_id: storeId, p_recipe_id: id });
        if (error) throw error;
        if (requestKey !== contextKey() || request !== generation) return;
        if (!data || data.id !== id || typeof data.instructions !== 'string') throw new Error('Invalid recipe');
        view = { ...view, recipe: data, recipeLoading: false };
      } catch (_) {
        if (requestKey !== contextKey() || request !== generation) return;
        // Clear formerly granted access as well; never keep stale recipe text on failure.
        view = { phase: 'idle', recipeError: true }; changed();
        await load(); return;
      }
      changed();
    }
    function closeRecipe() { generation++; view = { ...view, recipe: null, recipeLoading: false }; changed(); }
    return { snapshot, load, openRecipe, closeRecipe, invalidate };
  }
  function safeVideoUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
    catch (_) { return null; }
  }
  const api = { createController, safeVideoUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ManeeFactory = api;
})(typeof window !== 'undefined' ? window : globalThis);
