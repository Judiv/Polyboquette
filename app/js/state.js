/**
 * PolyBoquette - Central State Store
 */

export const state = {
    version: 9,
    currentUser: null,
    theme: localStorage.getItem('theme') || 'dark',
    displayMode: localStorage.getItem('displayMode') || 'compact', // 'compact' | 'detailed'

    // Data
    markets: [],
    categories: [],
    proposals: [],
    leaderboard: [],
    pendingUsers: [],
    allUsers: [],
    nameChangeRequests: [],
    passwordResetRequests: [],

    // Navigation & UI State
    currentRoute: 'dashboard',
    routeParams: {},
    selectedCategoryId: 'all',
    searchQuery: '',
    marketStatusFilter: 'open', // 'all' | 'open' | 'closed' | 'my_bets'
    marketSortBy: 'volume',     // 'volume' | 'newest' | 'ending_soon'
    chartHidden: localStorage.getItem('chartHidden') === '1',

    // Admin State
    adminTab: 'members', // 'members' | 'markets' | 'validations' | 'categories' | 'logs'
    adminSearchUser: '',
    adminFilterStatus: 'all',
    adminLogsFilter: 'all',
    collapsedCategories: JSON.parse(localStorage.getItem('collapsedCategories') || '{}'),

    // Bet Slip State (Drawer de pari)
    betSlip: {
        isOpen: false,
        marketId: null,
        optId: null,
        amount: 50,
        mode: 'buy'
    },

    listeners: new Set(),

    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    },

    notify() {
        for (const fn of this.listeners) {
            try { fn(this); } catch (e) { console.error("Error in state subscriber", e); }
        }
    },

    setTheme(newTheme) {
        this.theme = newTheme;
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.notify();
    },

    setDisplayMode(mode) {
        this.displayMode = mode;
        localStorage.setItem('displayMode', mode);
        this.notify();
    },

    setUser(user) {
        this.currentUser = user;
        this.notify();
    },

    setMarkets(markets) {
        this.markets = markets || [];
        this.notify();
    },

    setCategories(categories) {
        this.categories = categories || [];
        this.notify();
    }
};
