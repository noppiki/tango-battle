// Storage adapter with a 3-tier fallback: window.storage (claude.ai Artifacts
// API) -> localStorage -> in-memory. This is the single place browser storage
// APIs are touched, so a Capacitor build can swap the backend here.

function localStorageWorks() {
  try {
    const k = '__eiken_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

function detectBackend() {
  if (typeof window !== 'undefined' && window.storage && window.storage.get) {
    return 'artifact';
  }
  if (typeof window !== 'undefined' && window.localStorage && localStorageWorks()) {
    return 'local';
  }
  return 'memory';
}

// createStorage(key) -> { get, set, persistent, backend }
// get(): Promise<string|null>   set(value: string): Promise<void>
export function createStorage(key) {
  const backend = detectBackend();
  let mem = null;

  async function get() {
    try {
      if (backend === 'artifact') {
        const r = await window.storage.get(key);
        return r && r.value ? r.value : null;
      }
      if (backend === 'local') {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      // key missing or backend unavailable -> treat as no stored value
    }
    return mem;
  }

  async function set(value) {
    try {
      if (backend === 'artifact') {
        await window.storage.set(key, value);
        return;
      }
      if (backend === 'local') {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      // fall through to memory on failure
    }
    mem = value;
  }

  return { get, set, persistent: backend !== 'memory', backend };
}
