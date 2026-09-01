/**
 * PolyBoquette - Vue Dashboard (Marchés & Accueil)
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { AMM } from '../amm.js';
import { betSlip } from '../components/betSlip.js';
import { toast } from '../components/toast.js';
import { esc, formatPoints, formatOdds, getRemainingTime } from '../utils.js';

export function renderDashboard() {
    const user = state.currentUser;
    const markets = state.markets || [];
    const categories = state.categories || [];
    const searchQuery = state.searchQuery.toLowerCase().trim();
    const isCompact = state.displayMode === 'compact';

    // 1. Daily Claim Banner
    let dailyBanner = '';
    if (user) {
        const today = new Date().toISOString().split('T')[0];
        if (user.lastClaim !== today) {
            dailyBanner = `
                <div class="daily-claim-banner">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <i class="fa-solid fa-gift" style="font-size:1.3rem; color:#eab308;"></i>
                        <div>
                            <div style="font-weight:700; font-size:0.95rem;">Bonus Quotidien disponible !</div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Récupérez vos 5 points de fidélité.</div>
                        </div>
                    </div>
                    <button class="btn-primary" id="claimDailyBtn" style="padding:0.45rem 1rem; font-size:0.85rem;">
                        <i class="fa-solid fa-coins"></i> +5 pts
                    </button>
                </div>
            `;
        }
    }

    // 2. Filtres, Recherche et Switch Mode Compact
    let html = `
        ${dailyBanner}

        <div class="dash-controls">
            <div class="search-bar-wrapper">
                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                <input type="text" id="dashSearchInput" value="${esc(state.searchQuery)}" placeholder="Rechercher un marché, un nom..." class="search-input">
                ${state.searchQuery ? `<button class="search-clear-btn" id="clearSearchBtn"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                <div class="filter-pills-row">
                    <button class="filter-pill ${state.marketStatusFilter === 'open' ? 'active' : ''}" data-status="open">
                        <i class="fa-solid fa-bolt"></i> En cours
                    </button>
                    <button class="filter-pill ${state.marketStatusFilter === 'all' ? 'active' : ''}" data-status="all">
                        Tous
                    </button>
                    ${user ? `
                        <button class="filter-pill ${state.marketStatusFilter === 'my_bets' ? 'active' : ''}" data-status="my_bets">
                            <i class="fa-solid fa-user-check"></i> Mes Paris
                        </button>
                    ` : ''}
                    <button class="filter-pill ${state.marketStatusFilter === 'closed' ? 'active' : ''}" data-status="closed">
                        <i class="fa-solid fa-flag-checkered"></i> Clôturés
                    </button>
                </div>

                <!-- Toggle Mode Compact / Normal -->
                <button class="btn-outline" id="toggleDisplayModeBtn" style="padding:0.35rem 0.75rem; font-size:0.8rem;" title="Changer l'affichage">
                    ${isCompact ? '<i class="fa-solid fa-table-cells-large"></i> Vue Détaillée' : '<i class="fa-solid fa-compress"></i> Vue Compacte'}
                </button>
            </div>
        </div>

        <!-- Filtre des Catégories -->
        <div class="categories-tabs-scroll">
            <button class="cat-tab ${state.selectedCategoryId === 'all' ? 'active' : ''}" data-cat="all">
                🌟 Tout voir
            </button>
            ${categories.map(c => `
                <button class="cat-tab ${state.selectedCategoryId === c.id ? 'active' : ''}" data-cat="${c.id}">
                    ${esc(c.name)}
                </button>
            `).join('')}
        </div>
    `;

    // 3. Filtrage et Tri
    let filtered = markets.filter(m => {
        if (state.selectedCategoryId !== 'all' && m.categoryId !== state.selectedCategoryId) return false;
        if (state.marketStatusFilter === 'open' && m.status !== 'open') return false;
        if (state.marketStatusFilter === 'closed' && m.status !== 'resolved' && m.status !== 'cancelled') return false;
        if (state.marketStatusFilter === 'my_bets') {
            if (!user) return false;
            const hasMyBet = (m.bets || []).some(b => String(b.userId) === String(user.id));
            if (!hasMyBet) return false;
        }

        if (searchQuery) {
            const titleMatch = m.title.toLowerCase().includes(searchQuery);
            const optMatch = (m.options || []).some(o => o.label.toLowerCase().includes(searchQuery));
            if (!titleMatch && !optMatch) return false;
        }

        return true;
    });

    filtered.sort((a, b) => (b.volume || 0) - (a.volume || 0));

    if (user && user.pinnedMarkets && user.pinnedMarkets.length > 0) {
        const pinnedSet = new Set(user.pinnedMarkets);
        filtered.sort((a, b) => {
            const aPinned = pinnedSet.has(a.id) ? 1 : 0;
            const bPinned = pinnedSet.has(b.id) ? 1 : 0;
            return bPinned - aPinned;
        });
    }

    if (filtered.length === 0) {
        html += `
            <div class="empty-state">
                <i class="fa-solid fa-magnifying-glass fa-2x" style="color:var(--text-secondary); margin-bottom:0.75rem;"></i>
                <h3>Aucun marché trouvé</h3>
                <p style="color:var(--text-secondary); font-size:0.85rem;">Essayez de modifier vos filtres.</p>
                <button class="btn-outline" style="margin-top:0.75rem;" onclick="window.location.hash = '#/proposals'">
                    <i class="fa-solid fa-lightbulb"></i> Proposer une idée
                </button>
            </div>
        `;
        return html;
    }

    // 4. Grille des Marchés (Support Compact & Détaillé)
    html += `<div class="market-grid ${isCompact ? 'grid-compact' : ''}">`;
    filtered.forEach(m => {
        const probs = AMM.getProbabilities(m);
        const sortedOpts = [...m.options].sort((a, b) => (probs[b.id] || 0) - (probs[a.id] || 0));
        const isPinned = user && user.pinnedMarkets && user.pinnedMarkets.includes(m.id);
        const remaining = getRemainingTime(m.pauseAt);
        const isOpen = m.status === 'open' && (!remaining || !remaining.isExpired);

        // En mode compact : max 3 options affichées
        const maxOptsToShow = isCompact ? 3 : sortedOpts.length;
        const visibleOpts = sortedOpts.slice(0, maxOptsToShow);
        const hiddenOptsCount = sortedOpts.length - maxOptsToShow;

        html += `
            <div class="market-card ${isCompact ? 'card-compact' : ''} ${!isOpen ? 'market-card-closed' : ''}" data-market-id="${m.id}">
                <div class="market-card-header">
                    <div style="display:flex; align-items:flex-start; gap:0.6rem; flex:1; min-width:0;">
                        <img src="${esc(m.image)}" alt="Cover" class="market-thumbnail" onerror="this.src='logo.png'">
                        <div style="flex:1; min-width:0;">
                            <div class="market-card-title">${esc(m.title)}</div>
                            <div class="market-card-meta">
                                <span><i class="fa-solid fa-chart-simple"></i> ${formatPoints(m.volume)} pts</span>
                                <span><i class="fa-solid fa-comments"></i> ${(m.comments || []).length}</span>
                                ${remaining && !remaining.isExpired ? `
                                    <span class="freeze-pill"><i class="fa-regular fa-clock"></i> ${remaining.label}</span>
                                ` : ''}
                                ${!isOpen ? `
                                    <span class="closed-pill">${m.status === 'resolved' ? 'Résolu' : 'Fermé'}</span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    ${user ? `
                        <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-pin-id="${m.id}" title="${isPinned ? 'Désépingler' : 'Épingler'}">
                            <i class="fa-solid fa-thumbtack"></i>
                        </button>
                    ` : ''}
                </div>

                <!-- Options -->
                <div class="market-card-options">
                    ${visibleOpts.map(opt => {
                        const prob = probs[opt.id] || 50;
                        const decOdds = AMM.probToDecimalOdds(prob);
                        return `
                            <div class="option-row" data-market-id="${m.id}" data-opt-id="${opt.id}">
                                <div class="option-info">
                                    <span class="option-dot" style="background:${opt.color || '#22c55e'}"></span>
                                    <span class="option-name">${esc(opt.label)}</span>
                                </div>
                                <div class="option-odds-box">
                                    <span class="odds-val">x${formatOdds(decOdds)}</span>
                                    <span class="prob-val">${prob}%</span>
                                </div>
                            </div>
                        `;
                    }).join('')}

                    ${hiddenOptsCount > 0 ? `
                        <div class="hidden-opts-indicator">
                            +${hiddenOptsCount} autre${hiddenOptsCount > 1 ? 's' : ''} choix (cliquer pour voir)
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    html += `</div>`;

    return html;
}

export function attachDashboardEvents() {
    // Daily Claim
    const claimBtn = document.getElementById('claimDailyBtn');
    if (claimBtn) {
        claimBtn.onclick = async () => {
            claimBtn.disabled = true;
            claimBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                const res = await api.post('/api/auth/daily-claim');
                state.setUser(res.user);
                toast.success("+5 points ajoutés à votre solde !");
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur de récupération");
                claimBtn.disabled = false;
                claimBtn.innerHTML = '<i class="fa-solid fa-coins"></i> +5 pts';
            }
        };
    }

    // Switch Display Mode
    const modeBtn = document.getElementById('toggleDisplayModeBtn');
    if (modeBtn) {
        modeBtn.onclick = () => {
            const nextMode = state.displayMode === 'compact' ? 'detailed' : 'compact';
            state.setDisplayMode(nextMode);
            router.renderCurrentView();
        };
    }

    // Recherche
    const searchInput = document.getElementById('dashSearchInput');
    if (searchInput) {
        searchInput.oninput = (e) => {
            state.searchQuery = e.target.value;
            router.renderCurrentView();
            const newIn = document.getElementById('dashSearchInput');
            if (newIn) {
                newIn.focus();
                newIn.setSelectionRange(newIn.value.length, newIn.value.length);
            }
        };
    }

    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.onclick = () => {
            state.searchQuery = '';
            router.renderCurrentView();
        };
    }

    // Filtres statut
    document.querySelectorAll('.filter-pill').forEach(btn => {
        btn.onclick = () => {
            state.marketStatusFilter = btn.dataset.status;
            router.renderCurrentView();
        };
    });

    // Catégories
    document.querySelectorAll('.cat-tab').forEach(btn => {
        btn.onclick = () => {
            state.selectedCategoryId = btn.dataset.cat;
            router.renderCurrentView();
        };
    });

    // Clic Carte -> Détail
    document.querySelectorAll('.market-card').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('.pin-btn') || e.target.closest('.option-row')) return;
            const id = card.dataset.marketId;
            router.navigate(`/market/${id}`);
        };
    });

    // Clic Option -> Bet Slip
    document.querySelectorAll('.option-row').forEach(row => {
        row.onclick = (e) => {
            e.stopPropagation();
            const marketId = row.dataset.marketId;
            const optId = row.dataset.optId;
            betSlip.open(marketId, optId, 50);
        };
    });

    // Épinglage
    document.querySelectorAll('.pin-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const mId = btn.dataset.pinId;
            try {
                const res = await api.post('/api/users/pin-market', { marketId: mId });
                state.setUser(res.user);
                toast.info(res.pinned ? "Marché épinglé" : "Marché désépinglé");
                router.renderCurrentView();
            } catch (err) {
                toast.error("Impossible d'épingler");
            }
        };
    });
}
