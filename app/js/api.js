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

    // Synchronisation d'arrière-plan intelligente et non-destructive
    initSSE(onUpdateCallback) {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }

        // Rafraîchissement automatique toutes les 8 secondes uniquement si l'onglet est actif
        syncInterval = setInterval(async () => {
            if (document.hidden || !state.currentUser) return;

            // Ne pas écraser l'affichage si l'utilisateur est en train de saisir dans un champ ou une modale
            const activeTag = document.activeElement ? document.activeElement.tagName : '';
            const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
            const isModalOpen = !!document.querySelector('.modal-overlay');
            const isBetSlipOpen = state.betSlip && state.betSlip.isOpen;

            if (isTyping || isModalOpen || isBetSlipOpen) return;

            try {
                const markets = await this.get('/api/markets');
                if (markets && Array.isArray(markets)) {
                    state.markets = markets;
                    if (onUpdateCallback) onUpdateCallback('markets_sync', markets);
                }
            } catch (e) {
                // Ignore silent background errors
            }
        }, 8000);
    }
};
