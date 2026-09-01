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

    // 1. Daily Claim Banner
    let dailyBanner = '';
    if (user) {
        const today = new Date().toISOString().split('T')[0];
        if (user.lastClaim !== today) {
            dailyBanner = `
                <div class="daily-claim-banner">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <i class="fa-solid fa-gift" style="font-size:1.5rem; color:#eab308;"></i>
                        <div>
                            <div style="font-weight:700;">Bonus Quotidien disponible !</div>
                            <div style="font-size:0.85rem; color:var(--text-secondary);">Récupérez vos 5 points de fidélité du jour.</div>
                        </div>
                    </div>
                    <button class="btn-primary" id="claimDailyBtn" style="padding:0.5rem 1.25rem;">
                        <i class="fa-solid fa-coins"></i> Récupérer +5 pts
                    </button>
                </div>
            `;
        }
    }

    // 2. Filtres et Recherche
    let html = `
        ${dailyBanner}

        <!-- En-tête avec Recherche & Filtres -->
        <div class="dash-controls">
            <div class="search-bar-wrapper">
                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                <input type="text" id="dashSearchInput" value="${esc(state.searchQuery)}" placeholder="Rechercher un marché, un sujet, un mot-clé..." class="search-input">
                ${state.searchQuery ? `<button class="search-clear-btn" id="clearSearchBtn"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </div>

            <div class="filter-pills-row">
                <button class="filter-pill ${state.marketStatusFilter === 'open' ? 'active' : ''}" data-status="open">
                    <i class="fa-solid fa-bolt"></i> En cours
                </button>
                <button class="filter-pill ${state.marketStatusFilter === 'all' ? 'active' : ''}" data-status="all">
                    Tous les marchés
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

    // 3. Filtrage et Tri des marchés
    let filtered = markets.filter(m => {
        // Catégorie
        if (state.selectedCategoryId !== 'all' && m.categoryId !== state.selectedCategoryId) return false;

        // Statut
        if (state.marketStatusFilter === 'open' && m.status !== 'open') return false;
        if (state.marketStatusFilter === 'closed' && m.status !== 'resolved' && m.status !== 'cancelled') return false;
        if (state.marketStatusFilter === 'my_bets') {
            if (!user) return false;
            const hasMyBet = (m.bets || []).some(b => b.userId === user.id);
            if (!hasMyBet) return false;
        }

        // Recherche texte
        if (searchQuery) {
            const titleMatch = m.title.toLowerCase().includes(searchQuery);
            const optMatch = (m.options || []).some(o => o.label.toLowerCase().includes(searchQuery));
            if (!titleMatch && !optMatch) return false;
        }

        return true;
    });

    // Tri
    filtered.sort((a, b) => (b.volume || 0) - (a.volume || 0));

    // Marchés épinglés en tête si l'utilisateur est connecté
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
                <i class="fa-solid fa-magnifying-glass fa-3x" style="color:var(--text-secondary); margin-bottom:1rem;"></i>
                <h3>Aucun marché trouvé</h3>
                <p style="color:var(--text-secondary); font-size:0.9rem;">Essayez de modifier vos filtres ou de chercher d'autres termes.</p>
                <button class="btn-outline" style="margin-top:1rem;" onclick="window.location.hash = '#/proposals'">
                    <i class="fa-solid fa-lightbulb"></i> Proposer un nouveau pari
                </button>
            </div>
        `;
        return html;
    }

    // Grille des marchés
    html += `<div class="market-grid">`;
    filtered.forEach(m => {
        const probs = AMM.getProbabilities(m);
        const sortedOpts = [...m.options].sort((a, b) => (probs[b.id] || 0) - (probs[a.id] || 0));
        const isPinned = user && user.pinnedMarkets && user.pinnedMarkets.includes(m.id);
        const remaining = getRemainingTime(m.pauseAt);
        const isOpen = m.status === 'open' && (!remaining || !remaining.isExpired);

        html += `
            <div class="market-card ${!isOpen ? 'market-card-closed' : ''}" data-market-id="${m.id}">
                <div class="market-card-header">
                    <div style="display:flex; align-items:flex-start; gap:0.75rem; flex:1;">
                        <img src="${esc(m.image)}" alt="Image" class="market-thumbnail" onerror="this.src='logo.png'">
                        <div style="flex:1;">
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
                        <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-pin-id="${m.id}" title="${isPinned ? 'Désépingler' : 'Épingler en haut'}">
                            <i class="fa-solid fa-thumbtack"></i>
                        </button>
                    ` : ''}
                </div>

                <!-- Options & Cotes -->
                <div class="market-card-options">
                    ${sortedOpts.map(opt => {
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
                </div>
            </div>
        `;
    });
    html += `</div>`;

    return html;
}

export function attachDashboardEvents() {
    // 1. Daily Claim
    const claimBtn = document.getElementById('claimDailyBtn');
    if (claimBtn) {
        claimBtn.onclick = async () => {
            claimBtn.disabled = true;
            claimBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Récupération...';
            try {
                const res = await api.post('/api/auth/daily-claim');
                state.setUser(res.user);
                toast.success("+5 points ajoutés à votre solde !");
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur lors de la récupération du bonus");
                claimBtn.disabled = false;
                claimBtn.innerHTML = '<i class="fa-solid fa-coins"></i> Récupérer +5 pts';
            }
        };
    }

    // 2. Recherche en direct
    const searchInput = document.getElementById('dashSearchInput');
    if (searchInput) {
        searchInput.oninput = (e) => {
            state.searchQuery = e.target.value;
            router.renderCurrentView();
            // Garder le focus
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

    // 3. Filtres statut
    document.querySelectorAll('.filter-pill').forEach(btn => {
        btn.onclick = () => {
            state.marketStatusFilter = btn.dataset.status;
            router.renderCurrentView();
        };
    });

    // 4. Onglets Catégories
    document.querySelectorAll('.cat-tab').forEach(btn => {
        btn.onclick = () => {
            state.selectedCategoryId = btn.dataset.cat;
            router.renderCurrentView();
        };
    });

    // 5. Clics sur les cartes de marché -> Navigation détaillée
    document.querySelectorAll('.market-card').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('.pin-btn') || e.target.closest('.option-row')) return;
            const id = card.dataset.marketId;
            router.navigate(`/market/${id}`);
        };
    });

    // 6. Clic direct sur une cote -> Ouvre le Bet Slip instantanément
    document.querySelectorAll('.option-row').forEach(row => {
        row.onclick = (e) => {
            e.stopPropagation();
            const marketId = row.dataset.marketId;
            const optId = row.dataset.optId;
            betSlip.open(marketId, optId, 50);
        };
    });

    // 7. Épinglage
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
                toast.error("Impossible d'épingler le marché");
            }
        };
    });
}
