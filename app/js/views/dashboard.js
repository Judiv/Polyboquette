/**
 * PolyBoquette - Vue Dashboard (Marchés & Accueil avec Mode Édition Admin)
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { AMM } from '../amm.js';
import { betSlip } from '../components/betSlip.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';
import { esc, formatPoints, formatOdds, getRemainingTime } from '../utils.js';

let editModeActive = false;

export function renderDashboard() {
    const user = state.currentUser;

    // 1. Utilisateur non connecté -> Page d'accueil invitant à se connecter
    if (!user) {
        return `
            <div class="unauth-landing" style="text-align:center; padding:3.5rem 1rem; max-width:600px; margin:0 auto;">
                <img src="logo.png" alt="PolyBoquette" style="height:75px; margin-bottom:1.25rem;">
                <h1 style="font-size:2rem; font-weight:800; letter-spacing:-0.5px; margin-bottom:0.75rem;">Bienvenue sur PolyBoquette</h1>
                <p style="color:var(--text-secondary); font-size:1rem; line-height:1.6; margin-bottom:2rem;">
                    La plateforme de marchés prédictifs et de pronostics. Connectez-vous ou créez votre compte pour explorer les marchés, miser vos points et grimper au classement.
                </p>
                <div style="display:flex; justify-content:center; gap:1rem; flex-wrap:wrap;">
                    <a href="#/login" class="btn-primary" style="padding:0.8rem 1.75rem; font-size:1rem;">
                        <i class="fa-solid fa-right-to-bracket"></i> Se connecter
                    </a>
                    <a href="#/register" class="btn-outline" style="padding:0.8rem 1.75rem; font-size:1rem;">
                        <i class="fa-solid fa-user-plus"></i> S'inscrire
                    </a>
                </div>
            </div>
        `;
    }

    const markets = state.markets || [];
    const categories = state.categories || [];
    const searchQuery = state.searchQuery.toLowerCase().trim();
    const isCompact = state.displayMode === 'compact';
    const isAdmin = user && user.role === 'admin';

    // Daily Claim Banner
    let dailyBanner = '';
    const today = new Date().toISOString().split('T')[0];
    if (user.lastClaim !== today) {
        dailyBanner = `
            <div class="daily-claim-banner">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <i class="fa-solid fa-gift" style="font-size:1.3rem; color:#eab308;"></i>
                    <div>
                        <div style="font-weight:700; font-size:0.95rem;">Bonus Quotidien disponible !</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary);">Récupérez vos 5 points de fidélité du jour.</div>
                    </div>
                </div>
                <button class="btn-primary" id="claimDailyBtn" style="padding:0.45rem 1rem; font-size:0.85rem;">
                    <i class="fa-solid fa-coins"></i> +5 pts
                </button>
            </div>
        `;
    }

    // Header Controls
    let html = `
        ${dailyBanner}

        <div class="dash-controls">
            <div class="search-bar-wrapper">
                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                <input type="text" id="dashSearchInput" value="${esc(state.searchQuery)}" placeholder="Rechercher un marché, un mot..." class="search-input">
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
                    <button class="filter-pill ${state.marketStatusFilter === 'my_bets' ? 'active' : ''}" data-status="my_bets">
                        <i class="fa-solid fa-user-check"></i> Mes Paris
                    </button>
                    <button class="filter-pill ${state.marketStatusFilter === 'closed' ? 'active' : ''}" data-status="closed">
                        <i class="fa-solid fa-flag-checkered"></i> Clôturés
                    </button>
                </div>

                <div style="display:flex; gap:0.5rem;">
                    ${isAdmin ? `
                        <button class="btn-outline ${editModeActive ? 'active' : ''}" id="toggleEditModeBtn" style="padding:0.35rem 0.75rem; font-size:0.8rem; border-color:${editModeActive ? 'var(--accent-color)' : 'var(--border-color)'}; color:${editModeActive ? 'var(--accent-color)' : 'inherit'};">
                            <i class="fa-solid fa-pen-to-square"></i> ${editModeActive ? 'Quitter Édition' : 'Mode Édition'}
                        </button>
                    ` : ''}
                    <button class="btn-outline" id="toggleDisplayModeBtn" style="padding:0.35rem 0.75rem; font-size:0.8rem;">
                        ${isCompact ? '<i class="fa-solid fa-table-cells-large"></i> Détaillé' : '<i class="fa-solid fa-compress"></i> Compact'}
                    </button>
                </div>
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
            ${isAdmin && editModeActive ? `
                <button class="btn-primary" id="dashAddCatBtn" style="padding:0.35rem 0.75rem; font-size:0.8rem; border-radius:var(--radius-md); white-space:nowrap;">
                    <i class="fa-solid fa-plus"></i> Catégorie
                </button>
            ` : ''}
        </div>
    `;

    // Filtrage et Tri
    let filtered = markets.filter(m => {
        if (state.selectedCategoryId !== 'all' && m.categoryId !== state.selectedCategoryId) return false;
        if (state.marketStatusFilter === 'open' && m.status !== 'open') return false;
        if (state.marketStatusFilter === 'closed' && m.status !== 'resolved' && m.status !== 'cancelled') return false;
        if (state.marketStatusFilter === 'my_bets') {
            const hasMyBet = (m.bets || []).some(b => String(b.userId) === String(user.id) || String(b.userId) === String(user.username) || String(b.userId) === String(user.nums));
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

    // Grille des Marchés
    html += `<div class="market-grid ${isCompact ? 'grid-compact' : ''}">`;
    filtered.forEach(m => {
        const probs = AMM.getProbabilities(m);
        const sortedOpts = [...m.options].sort((a, b) => (probs[b.id] || 0) - (probs[a.id] || 0));
        const isPinned = user && user.pinnedMarkets && user.pinnedMarkets.includes(m.id);
        const remaining = getRemainingTime(m.pauseAt);
        const isPaused = m.status === 'paused';
        const isResolved = m.status === 'resolved';
        const isExpired = remaining && remaining.isExpired;
        const isOpen = m.status === 'open' && !isExpired;

        const maxOptsToShow = isCompact ? 3 : sortedOpts.length;
        const visibleOpts = sortedOpts.slice(0, maxOptsToShow);
        const hiddenOptsCount = sortedOpts.length - maxOptsToShow;

        html += `
            <div class="market-card ${isCompact ? 'card-compact' : ''} ${!isOpen ? 'market-card-closed' : ''}" data-market-id="${m.id}">
                ${isAdmin && editModeActive ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--accent-transparent); padding:0.35rem 0.6rem; border-radius:var(--radius-sm); margin-bottom:0.6rem; font-size:0.75rem;">
                        <span style="font-weight:700; color:var(--accent-color);"><i class="fa-solid fa-gear"></i> Modération</span>
                        <div style="display:flex; gap:0.25rem;">
                            <button class="btn-icon card-admin-rename" data-id="${m.id}" data-title="${esc(m.title)}" title="Renommer" style="width:24px; height:24px; font-size:0.7rem;"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn-icon card-admin-date" data-id="${m.id}" data-date="${esc(m.pauseAt || '')}" title="Date de gel" style="width:24px; height:24px; font-size:0.7rem;"><i class="fa-regular fa-clock"></i></button>
                            <button class="btn-icon card-admin-pause" data-id="${m.id}" title="${isPaused ? 'Réactiver' : 'Mettre en pause'}" style="width:24px; height:24px; font-size:0.7rem; color:${isPaused ? 'var(--yes-color)' : '#f59e0b'};"><i class="fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}"></i></button>
                            <button class="btn-icon card-admin-delete" data-id="${m.id}" title="Supprimer" style="width:24px; height:24px; font-size:0.7rem; color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                ` : ''}

                <div class="market-card-header">
                    <div style="display:flex; align-items:flex-start; gap:0.6rem; flex:1; min-width:0;">
                        <img src="${esc(m.image)}" alt="Cover" class="market-thumbnail" onerror="this.src='logo.png'">
                        <div style="flex:1; min-width:0;">
                            <div class="market-card-title">${esc(m.title)}</div>
                            <div class="market-card-meta">
                                <span><i class="fa-solid fa-chart-simple"></i> ${formatPoints(m.volume)} pts</span>
                                <span><i class="fa-solid fa-comments"></i> ${(m.comments || []).length}</span>
                                ${isPaused ? `<span class="status-badge status-paused"><i class="fa-solid fa-pause"></i> En Pause</span>` : ''}
                                ${isResolved ? `<span class="status-badge status-resolved">Résolu</span>` : ''}
                                ${remaining && !remaining.isExpired ? `
                                    <span class="freeze-pill"><i class="fa-regular fa-clock"></i> ${remaining.label}</span>
                                ` : ''}
                                ${isExpired && !isResolved ? `
                                    <span class="closed-pill"><i class="fa-solid fa-lock"></i> Gelé</span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-pin-id="${m.id}" title="${isPinned ? 'Désépingler' : 'Épingler'}">
                        <i class="fa-solid fa-thumbtack"></i>
                    </button>
                </div>

                <!-- Options -->
                <div class="market-card-options">
                    ${visibleOpts.map(opt => {
                        const prob = probs[opt.id] || 50;
                        const decOdds = AMM.probToDecimalOdds(prob);
                        return `
                            <div class="option-row ${!isOpen ? 'option-row-disabled' : ''}" data-market-id="${m.id}" data-opt-id="${opt.id}" data-is-open="${isOpen ? '1' : '0'}">
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
                toast.error(err.message || "Erreur");
                claimBtn.disabled = false;
                claimBtn.innerHTML = '<i class="fa-solid fa-coins"></i> +5 pts';
            }
        };
    }

    const editBtn = document.getElementById('toggleEditModeBtn');
    if (editBtn) {
        editBtn.onclick = () => {
            editModeActive = !editModeActive;
            router.renderCurrentView();
        };
    }

    const modeBtn = document.getElementById('toggleDisplayModeBtn');
    if (modeBtn) {
        modeBtn.onclick = () => {
            const nextMode = state.displayMode === 'compact' ? 'detailed' : 'compact';
            state.setDisplayMode(nextMode);
            router.renderCurrentView();
        };
    }

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

    document.querySelectorAll('.filter-pill').forEach(btn => {
        btn.onclick = () => {
            state.marketStatusFilter = btn.dataset.status;
            router.renderCurrentView();
        };
    });

    document.querySelectorAll('.cat-tab').forEach(btn => {
        btn.onclick = () => {
            state.selectedCategoryId = btn.dataset.cat;
            router.renderCurrentView();
        };
    });

    document.querySelectorAll('.market-card').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('.pin-btn') || e.target.closest('.option-row') || e.target.closest('.card-admin-rename') || e.target.closest('.card-admin-date') || e.target.closest('.card-admin-pause') || e.target.closest('.card-admin-delete')) return;
            const id = card.dataset.marketId;
            router.navigate(`/market/${id}`);
        };
    });

    document.querySelectorAll('.option-row').forEach(row => {
        row.onclick = (e) => {
            e.stopPropagation();
            const isOpen = row.dataset.isOpen === '1';
            if (!isOpen) {
                return toast.info("Ce marché est actuellement suspendu ou clôturé.");
            }
            const marketId = row.dataset.marketId;
            const optId = row.dataset.optId;
            betSlip.open(marketId, optId, 50);
        };
    });

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

    // Card Admin Direct Actions
    document.querySelectorAll('.card-admin-rename').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const mId = btn.dataset.id;
            const title = btn.dataset.title;
            modal.show({
                title: "Renommer le marché",
                content: `<input type="text" id="dashRenameInput" class="input-full" value="${esc(title)}">`,
                confirmText: "Enregistrer",
                onConfirm: async () => {
                    const newTitle = document.getElementById('dashRenameInput').value.trim();
                    if (!newTitle) throw new Error();
                    await api.post(`/api/admin/markets/${mId}/rename`, { title: newTitle });
                    toast.success("Marché renommé");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    });

    document.querySelectorAll('.card-admin-date').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const mId = btn.dataset.id;
            const rawDate = btn.dataset.date || '';
            const curDate = rawDate ? rawDate.substring(0, 16) : '';

            modal.show({
                title: "Définir la date de gel",
                content: `
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <p style="font-size:0.85rem; color:var(--text-secondary); margin:0;">
                            Indiquez la date et l'heure précises de gel automatique.
                        </p>
                        <input type="datetime-local" id="dashPauseDateInput" class="input-full" value="${curDate}">
                        ${rawDate ? `
                            <button class="btn-outline" id="dashRemovePauseDateBtn" style="color:#ef4444; border-color:rgba(239,68,68,0.3); padding:0.35rem; font-size:0.8rem;">
                                <i class="fa-solid fa-trash"></i> Supprimer la date de gel
                            </button>
                        ` : ''}
                    </div>
                `,
                confirmText: "Enregistrer",
                onConfirm: async () => {
                    const val = document.getElementById('dashPauseDateInput').value;
                    const pauseAt = val ? new Date(val).toISOString() : null;
                    await api.post(`/api/admin/markets/${mId}/pause-date`, { pauseAt });
                    toast.success("Date de gel mise à jour");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });

            setTimeout(() => {
                const removeBtn = document.getElementById('dashRemovePauseDateBtn');
                if (removeBtn) {
                    removeBtn.onclick = async () => {
                        await api.post(`/api/admin/markets/${mId}/pause-date`, { pauseAt: null });
                        toast.info("Date de gel supprimée");
                        modal.close();
                        await router.fetchGlobalData();
                        router.renderCurrentView();
                    };
                }
            }, 50);
        };
    });

    document.querySelectorAll('.card-admin-pause').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            try {
                const res = await api.post(`/api/admin/markets/${btn.dataset.id}/toggle-pause`);
                toast.info(res.status === 'paused' ? "Marché mis en pause" : "Marché réactivé");
                await router.fetchGlobalData();
                router.renderCurrentView();
            } catch (err) {
                toast.error("Erreur de modification du statut");
            }
        };
    });

    document.querySelectorAll('.card-admin-delete').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const mId = btn.dataset.id;
            modal.show({
                title: "Supprimer le marché ?",
                content: "<p style='color:#ef4444;'>Action irréversible.</p>",
                confirmText: "Supprimer",
                isDanger: true,
                onConfirm: async () => {
                    await api.delete(`/api/admin/markets/${mId}`);
                    toast.success("Supprimé");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    });

    const addCatBtn = document.getElementById('dashAddCatBtn');
    if (addCatBtn) {
        addCatBtn.onclick = () => {
            modal.show({
                title: "Nouvelle Catégorie",
                content: `<input type="text" id="dashCatName" class="input-full" placeholder="Nom de la catégorie">`,
                confirmText: "Créer",
                onConfirm: async () => {
                    const name = document.getElementById('dashCatName').value.trim();
                    if (!name) throw new Error();
                    await api.post('/api/admin/categories', { name });
                    toast.success("Catégorie créée");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    }
}
