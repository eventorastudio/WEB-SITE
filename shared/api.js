const DEFAULT_TIMEOUT_MS = 12000;

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: options.signal || controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

export async function apiFetch(url, { user, appCheck, getAppCheckToken, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const headers = { ...(options.headers || {}), 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    if (appCheck && getAppCheckToken) {
        const token = await getAppCheckToken(appCheck);
        if (token?.token) headers['X-Firebase-AppCheck'] = token.token;
    }
    const response = await fetchWithTimeout(url, { ...options, headers }, timeoutMs);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
        const error = new Error(result.message || 'La operación no pudo completarse.');
        error.status = response.status;
        throw error;
    }
    return result;
}

export function isTimeoutError(error) {
    return error?.name === 'AbortError';
}
