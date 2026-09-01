/**
 * PolyBoquette - Router & Deep Linking Manager
 */

import { state } from './state.js';
import { api } from './api.js';
import { navbar } from './components/navbar.js';
import { renderDashboard, attachDashboardEvents } from './views/dashboard.js';
import { renderMarket, attachMarketEvents } from './views/market.js';
import { renderPortfolio, attachPortfolioEvents } from './views/portfolio.js';
import { renderProfile, attachProfileEvents } from './views/profile.js';
import { renderAdmin, attachAdminEvents } from './views/admin.js';
import { renderProposals, attachProposalsEvents } from './views/proposals.js';
import { renderLogin, renderRegister, attachAuthEvents } from './views/auth.js';

export const router = {
    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    },

    navigate(path) {
        window.location.hash = path.startsWith('/') ? '#' + path : '#/' + path;
    },

    async fetchGlobalData() {
        try {
            // Check auth
            const meRes = await api.get('/api/auth/me').catch(() => ({ user: null }));
            state.setUser(meRes.user);

            // Fetch markets and categories
            const [mRes, cRes] = await Promise.all([
                api.get('/api/markets').catch(() => []),
                api.get('/api/categories').catch(() => [])
            ]);
            state.setMarkets(mRes || []);
            state.setCategories(cRes || []);

            // If user is logged in, fetch user-specific data
            if (state.currentUser) {
                const [pRes, lbRes] = await Promise.all([
                    api.get('/api/proposals').catch(() => []),
                    api.get('/api/leaderboard').catch(() => [])
                ]);
                state.proposals = pRes || [];
                state.leaderboard = lbRes || [];

                if (state.currentUser.role === 'admin') {
                    const [uRes, ncRes, prRes] = await Promise.all([
                        api.get('/api/admin/users').catch(() => []),
                        api.get('/api/admin/name-changes').catch(() => []),
                        api.get('/api/admin/password-resets').catch(() => [])
                    ]);
                    state.pendingUsers = (uRes || []).filter(u => u.status === 'pending');
                    state.nameChangeRequests = ncRes || [];
                    state.passwordResetRequests = prRes || [];
                }
            }
        } catch (e) {
            console.error("Global data fetch error", e);
        }
    },

    async handleRoute() {
        const hash = window.location.hash.slice(1) || '/';
        const [path, queryString] = hash.split('?');
        const segments = path.split('/').filter(Boolean);

        const container = document.getElementById('app-container');
        if (!container) return;

        // Route matching
        if (segments.length === 0 || segments[0] === 'dashboard') {
            state.currentRoute = 'dashboard';
            state.routeParams = {};
        } else if (segments[0] === 'market' && segments[1]) {
            state.currentRoute = 'market';
            state.routeParams = { marketId: segments[1] };
        } else if (segments[0] === 'portfolio') {
            state.currentRoute = 'portfolio';
            state.routeParams = {};
        } else if (segments[0] === 'profile') {
            state.currentRoute = 'profile';
            state.routeParams = {};
        } else if (segments[0] === 'admin') {
            state.currentRoute = 'admin';
            state.routeParams = {};
        } else if (segments[0] === 'proposals') {
            state.currentRoute = 'proposals';
            state.routeParams = {};
        } else if (segments[0] === 'login') {
            state.currentRoute = 'login';
            state.routeParams = {};
        } else if (segments[0] === 'register') {
            state.currentRoute = 'register';
            state.routeParams = {};
        } else {
            state.currentRoute = 'dashboard';
            state.routeParams = {};
        }

        navbar.render();
        this.renderCurrentView();
    },

    renderCurrentView() {
        const container = document.getElementById('app-container');
        if (!container) return;

        switch (state.currentRoute) {
            case 'dashboard':
                container.innerHTML = renderDashboard();
                attachDashboardEvents();
                break;
            case 'market':
                container.innerHTML = renderMarket(state.routeParams.marketId);
                attachMarketEvents(state.routeParams.marketId);
                break;
            case 'portfolio':
                container.innerHTML = renderPortfolio();
                attachPortfolioEvents();
                break;
            case 'profile':
                container.innerHTML = renderProfile();
                attachProfileEvents();
                break;
            case 'admin':
                container.innerHTML = renderAdmin();
                attachAdminEvents();
                break;
            case 'proposals':
                container.innerHTML = renderProposals();
                attachProposalsEvents();
                break;
            case 'login':
                container.innerHTML = renderLogin();
                attachAuthEvents();
                break;
            case 'register':
                container.innerHTML = renderRegister();
                attachAuthEvents();
                break;
            default:
                container.innerHTML = renderDashboard();
                attachDashboardEvents();
        }

        window.scrollTo(0, 0);
    }
};
