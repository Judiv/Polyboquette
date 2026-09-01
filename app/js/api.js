/**
 * PolyBoquette - API Client & Realtime SSE
 */

import { state } from './state.js';

let sseSource = null;

export const api = {
    async request(method, url, data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        if (data) options.body = JSON.stringify(data);

        try {
            const res = await fetch(url, options);
            const contentType = res.headers.get('content-type') || '';
            let json = {};
            if (contentType.includes('application/json')) {
                json = await res.json().catch(() => ({}));
            }

            if (!res.ok) {
                const errMsg = json.error || `Erreur serveur (${res.status})`;
                throw new Error(errMsg);
            }
            return json;
        } catch (err) {
            console.error(`[API ERROR] ${method} ${url}:`, err);
            throw err;
        }
    },

    get(url) { return this.request('GET', url); },
    post(url, data) { return this.request('POST', url, data); },
    delete(url) { return this.request('DELETE', url); },

    // Initialisation du flux temps réel SSE
    initSSE(onUpdateCallback) {
        if (sseSource) {
            sseSource.close();
            sseSource = null;
        }

        try {
            sseSource = new EventSource('/api/stream');

            sseSource.addEventListener('market_update', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    if (onUpdateCallback) onUpdateCallback('market_update', payload);
                } catch (err) { console.error('SSE JSON error', err); }
            });

            sseSource.addEventListener('comment_added', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    if (onUpdateCallback) onUpdateCallback('comment_added', payload);
                } catch (err) { console.error('SSE JSON error', err); }
            });

            sseSource.addEventListener('user_update', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    if (state.currentUser && payload.userId === state.currentUser.id) {
                        state.setUser({ ...state.currentUser, ...payload.user });
                    }
                } catch (err) { console.error('SSE JSON error', err); }
            });

            sseSource.onerror = () => {
                // Auto-reconnect géré par EventSource
            };
        } catch (e) {
            console.warn("SSE not supported or failed to initialize", e);
        }
    }
};
