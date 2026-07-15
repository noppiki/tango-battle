// Storage adapter with a 3-tier fallback: window.storage (claude.ai Artifacts
// API) -> localStorage -> in-memory. This is the single place browser storage
// APIs are touched, so a Capacitor build can swap the backend here.

function getArtifactStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.storage || null;
  } catch (e) {
    return null;
  }
}

function getLocalStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || null;
  } catch (e) {
    return null;
  }
}

function localStorageWorks(storage) {
  try {
    const k = '__eiken_probe__';
    storage.setItem(k, '1');
    storage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

function detectBackend() {
  const artifact = getArtifactStorage();
  if (artifact && typeof artifact.get === 'function') return 'artifact';
  const local = getLocalStorage();
  if (local && localStorageWorks(local)) return 'local';
  return 'memory';
}

// createStorage(key) -> { get, set, persistent, backend }
// get(): Promise<string|null>   set(value: string): Promise<void>
export function createStorage(key) {
  let backend = detectBackend();
  let mem = null;

  async function get() {
    const artifact = getArtifactStorage();
    if (artifact && typeof artifact.get === 'function') {
      try {
        const r = await artifact.get(key);
        backend = 'artifact';
        return r && r.value ? r.value : null;
      } catch (e) {
        // Try the next storage tier.
      }
    }
    const local = getLocalStorage();
    if (local) {
      try {
        const value = local.getItem(key);
        backend = 'local';
        return value;
      } catch (e) {
        // Try the in-memory tier.
      }
    }
    backend = 'memory';
    return mem;
  }

  async function set(value) {
    const artifact = getArtifactStorage();
    if (artifact && typeof artifact.set === 'function') {
      try {
        await artifact.set(key, value);
        backend = 'artifact';
        return;
      } catch (e) {
        // Try the next storage tier.
      }
    }
    const local = getLocalStorage();
    if (local) {
      try {
        local.setItem(key, value);
        backend = 'local';
        return;
      } catch (e) {
        // Try the in-memory tier.
      }
    }
    backend = 'memory';
    mem = value;
  }

  return {
    get,
    set,
    get persistent() {
      return backend !== 'memory';
    },
    get backend() {
      return backend;
    },
  };
}
