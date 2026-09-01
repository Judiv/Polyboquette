/**
 * PolyBoquette - Main Application Entrypoint
 */

import { state } from './state.js';
import { api } from './api.js';
import { router } from './router.js';
import { navbar } from './components/navbar.js';
import { betSlip } from './components/betSlip.js';
import { toast } from './components/toast.js';

async function initApp() {
    // 1. Initialiser le thème
    document.documentElement.setAttribute('data-theme', state.theme);

    // 2. Écouter les changements d'état pour re-render la navbar
    state.subscribe(() => {
        navbar.render();
    });

    // 3. Charger les données du serveur
    await router.fetchGlobalData();

    // 4. Initialiser le routeur
    router.init();

    // 5. Initialiser le flux temps réel SSE
    api.initSSE((eventType, payload) => {
        if (eventType === 'market_update') {
            const idx = state.markets.findIndex(m => m.id === payload.id);
            if (idx !== -1) {
                state.markets[idx] = payload;
                state.setMarkets([...state.markets]);
                // Si on est sur la vue de ce marché ou le dashboard, re-render discret
                if (state.currentRoute === 'dashboard' || (state.currentRoute === 'market' && state.routeParams.marketId === payload.id)) {
                    router.renderCurrentView();
                }
            }
        } else if (eventType === 'comment_added') {
            const m = state.markets.find(m => m.id === payload.marketId);
            if (m) {
                if (!m.comments) m.comments = [];
                m.comments.push(payload.comment);
                if (state.currentRoute === 'market' && state.routeParams.marketId === payload.marketId) {
                    router.renderCurrentView();
                }
            }
        }
    });

    // 6. Gestion du bouton de déconnexion dans la navbar
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            try { await api.post('/api/auth/logout'); } catch (e) {}
            state.setUser(null);
            toast.info("Vous avez été déconnecté");
            router.navigate('/');
        };
    }
}

// Démarrer l'application dès le chargement du DOM
document.addEventListener('DOMContentLoaded', initApp);
