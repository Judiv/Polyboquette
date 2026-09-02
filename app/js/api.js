/**
 * PolyBoquette - API Client & Smart Sync
 */

import { state } from './state.js';

let syncInterval = null;

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

    // Synchronisation d'arrière-plan ultra-légère et non-bloquante
    initSSE(onUpdateCallback) {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }

        // Rafraîchissement automatique toutes les 6 secondes uniquement si l'onglet est actif
        syncInterval = setInterval(async () => {
            if (document.hidden || !state.currentUser) return;

            try {
                const markets = await this.get('/api/markets');
                if (markets && Array.isArray(markets)) {
                    state.setMarkets(markets);
                    if (onUpdateCallback) onUpdateCallback('market_update', markets);
                }
            } catch (e) {
                // Ignore silent sync errors
            }
        }, 6000);
    }
};
