(() => {
  const OUTREACH_TYPES = ['radio station', 'radio show', 'dj', 'curator', 'other'];
  const OUTREACH_STATUSES = ['researching', 'ready', 'contacted', 'follow-up', 'accepted', 'rejected'];
  const DEFAULT_OUTREACH_TYPE = 'other';
  const DEFAULT_OUTREACH_STATUS = 'researching';
  const OUTREACH_STORAGE_KEY = 'livefinder-outreach-v1';

  function isSafeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function normalizeOutreachType(value) {
    const lower = String(value || '').trim().toLowerCase();
    return OUTREACH_TYPES.includes(lower) ? lower : DEFAULT_OUTREACH_TYPE;
  }

  function normalizeOutreachStatus(value) {
    const lower = String(value || '').trim().toLowerCase();
    return OUTREACH_STATUSES.includes(lower) ? lower : DEFAULT_OUTREACH_STATUS;
  }

  function newOutreachId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `outreach-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function buildOutreachTarget(fields = {}) {
    const name = String(fields.name || '').trim();
    if (!name) throw new Error('Outreach target name is required.');
    return {
      id: String(fields.id || newOutreachId()),
      name,
      type: normalizeOutreachType(fields.type),
      url: String(fields.url || '').trim(),
      genre: String(fields.genre || '').trim(),
      status: normalizeOutreachStatus(fields.status),
      notes: String(fields.notes || '').trim(),
      createdAtMs: Number.isFinite(fields.createdAtMs) ? fields.createdAtMs : Date.now()
    };
  }

  function normalizeOutreachTarget(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim();
    if (!name) return null;
    return {
      id: String(raw.id || newOutreachId()),
      name,
      type: normalizeOutreachType(raw.type),
      url: String(raw.url || '').trim(),
      genre: String(raw.genre || '').trim(),
      status: normalizeOutreachStatus(raw.status),
      notes: String(raw.notes || '').trim(),
      createdAtMs: Number.isFinite(raw.createdAtMs) ? raw.createdAtMs : Date.now()
    };
  }

  function loadOutreachTargets(storage = globalThis.localStorage) {
    if (!storage?.getItem) return [];
    let parsed;
    try {
      parsed = JSON.parse(storage.getItem(OUTREACH_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeOutreachTarget).filter(Boolean);
  }

  function saveOutreachTargets(targets, storage = globalThis.localStorage) {
    if (!storage?.setItem) return;
    const normalized = (Array.isArray(targets) ? targets : []).map(normalizeOutreachTarget).filter(Boolean);
    storage.setItem(OUTREACH_STORAGE_KEY, JSON.stringify(normalized));
  }

  const api = {
    OUTREACH_TYPES,
    OUTREACH_STATUSES,
    DEFAULT_OUTREACH_TYPE,
    DEFAULT_OUTREACH_STATUS,
    OUTREACH_STORAGE_KEY,
    isSafeHttpUrl,
    normalizeOutreachType,
    normalizeOutreachStatus,
    buildOutreachTarget,
    normalizeOutreachTarget,
    loadOutreachTargets,
    saveOutreachTargets
  };

  globalThis.LiveFinderOutreach = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
