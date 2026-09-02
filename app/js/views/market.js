/**
 * PolyBoquette - Vue Détail du Marché & Graphique
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { AMM } from '../amm.js';
import { betSlip } from '../components/betSlip.js';
import { shareCard } from '../components/shareCard.js';
import { modal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { esc, formatPoints, formatOdds, formatDate, formatRelativeTime, getRemainingTime } from '../utils.js';

let chartInstance = null;

export function renderMarket(marketId) {
    const user = state.currentUser;
    if (!user) {
        return `
            <div class="empty-state">
                <h2>Connexion requise</h2>
                <p style="color:var(--text-secondary); margin-bottom:1rem;">Connectez-vous pour consulter ce marché et placer vos prédictions.</p>
                <button class="btn-primary" onclick="window.location.hash = '#/login'">Se connecter</button>
            </div>
        `;
    }

    const market = (state.markets || []).find(m => m.id === marketId);
    if (!market) {
        return `
            <div class="empty-state">
                <h2>Marché introuvable</h2>
                <p>Ce marché n'existe pas ou a été supprimé.</p>
                <button class="btn-primary" onclick="window.location.hash = '#/'">Retour aux marchés</button>
            </div>
        `;
    }

    const probs = AMM.getProbabilities(market);
    const remaining = getRemainingTime(market.pauseAt);
    const isOpen = market.status === 'open' && (!remaining || !remaining.isExpired);
    const isPinned = user && user.pinnedMarkets && user.pinnedMarkets.includes(market.id);
    const myBets = (market.bets || []).filter(b => String(b.userId) === String(user.id) || String(b.userId) === String(user.username) || String(b.userId) === String(user.nums));
    const comments = market.comments || [];
    const isAdmin = user && user.role === 'admin';

    return `
        <div class="market-detail-container" style="max-width:900px; margin:0 auto;">
            <!-- Fil d'ariane & Bouton Retour -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <button class="btn-outline" onclick="window.history.back()" style="padding:0.4rem 0.8rem; font-size:0.8rem;">
                    <i class="fa-solid fa-arrow-left"></i> Retour
                </button>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-outline" id="marketShareBtn" style="padding:0.4rem 0.8rem; font-size:0.8rem;">
                        <i class="fa-solid fa-share-nodes"></i> Partager
                    </button>
                    <button class="btn-icon pin-btn ${isPinned ? 'pinned' : ''}" id="marketDetailPinBtn" title="${isPinned ? 'Désépingler' : 'Épingler'}">
                        <i class="fa-solid fa-thumbtack"></i>
                    </button>
                </div>
            </div>

            <!-- Toolbar Admin Inline (Mode Direct) -->
            ${isAdmin ? `
                <div class="admin-inline-toolbar" style="background:var(--accent-transparent); border:1px solid var(--accent-color); border-radius:var(--radius-md); padding:0.6rem 0.85rem; margin-bottom:1rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
                    <span style="font-weight:700; font-size:0.85rem; color:var(--accent-color);">
                        <i class="fa-solid fa-shield-halved"></i> Actions Administrateur :
                    </span>
                    <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                        <button class="btn-outline admin-direct-rename" data-id="${market.id}" data-title="${esc(market.title)}" style="padding:0.25rem 0.6rem; font-size:0.75rem;">
                            <i class="fa-solid fa-pen"></i> Renommer
                        </button>
                        <button class="btn-outline admin-direct-cat" data-id="${market.id}" style="padding:0.25rem 0.6rem; font-size:0.75rem;">
                            <i class="fa-solid fa-tags"></i> Catégorie
                        </button>
                        <button class="btn-outline admin-direct-pause" data-id="${market.id}" style="padding:0.25rem 0.6rem; font-size:0.75rem;">
                            <i class="fa-solid ${market.status === 'open' ? 'fa-pause' : 'fa-play'}"></i> ${market.status === 'open' ? 'Pause' : 'Activer'}
                        </button>
                        <button class="btn-primary admin-direct-resolve" data-id="${market.id}" style="padding:0.25rem 0.6rem; font-size:0.75rem;">
                            <i class="fa-solid fa-gavel"></i> Clôturer
                        </button>
                        <button class="btn-danger admin-direct-delete" data-id="${market.id}" style="padding:0.25rem 0.6rem; font-size:0.75rem;">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            ` : ''}

            <!-- En-tête du Marché -->
            <div class="market-hero-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:1.25rem; margin-bottom:1.25rem;">
                <div style="display:flex; gap:1rem; align-items:flex-start;">
                    <img src="${esc(market.image)}" alt="Image" style="width:64px; height:64px; border-radius:var(--radius-sm); object-fit:cover;" onerror="this.src='logo.png'">
                    <div style="flex:1;">
                        <h1 style="font-size:1.35rem; font-weight:800; line-height:1.3; margin-bottom:0.4rem;">${esc(market.title)}</h1>
                        <div style="display:flex; gap:0.75rem; font-size:0.8rem; color:var(--text-secondary); flex-wrap:wrap;">
                            <span><i class="fa-solid fa-chart-simple"></i> Volume : <b>${formatPoints(market.volume)}</b> pts</span>
                            <span><i class="fa-solid fa-users"></i> ${market.bets ? market.bets.length : 0} positions</span>
                            <span><i class="fa-solid fa-comments"></i> ${comments.length} avis</span>
                            ${remaining && !remaining.isExpired ? `<span class="freeze-pill"><i class="fa-regular fa-clock"></i> ${remaining.label}</span>` : ''}
                            ${!isOpen ? `<span class="closed-pill">${market.status === 'resolved' ? 'Résolu' : 'Fermé'}</span>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Boutons d'Action / Options de Pari -->
                <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:1.25rem;">
                    ${market.options.map(opt => {
                        const prob = probs[opt.id] || 50;
                        const decOdds = AMM.probToDecimalOdds(prob);
                        const optBets = (market.bets || []).filter(b => b.optId === opt.id);
                        const optVol = optBets.reduce((s, b) => s + (b.amount || 0), 0);

                        return `
                            <div class="market-detail-option-card" style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.85rem 1rem;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                                    <div style="display:flex; align-items:center; gap:0.5rem;">
                                        <span class="option-dot" style="background:${opt.color || '#22c55e'}; width:10px; height:10px;"></span>
                                        <span style="font-weight:700; font-size:1rem;">${esc(opt.label)}</span>
                                        <span style="font-size:0.75rem; color:var(--text-secondary);">(${optBets.length} parieurs • ${formatPoints(optVol)} pts)</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:0.5rem;">
                                        <span class="odds-val" style="font-size:0.95rem;">x${formatOdds(decOdds)}</span>
                                        <span class="prob-val" style="font-size:0.85rem;">${prob}%</span>
                                    </div>
                                </div>

                                <div class="progress-bar-bg" style="height:6px; background:var(--bg-card); border-radius:3px; overflow:hidden; margin-bottom:0.65rem;">
                                    <div style="width:${prob}%; height:100%; background:${opt.color || '#22c55e'}; transition:width 0.4s ease;"></div>
                                </div>

                                ${isOpen ? `
                                    <button class="btn-primary btn-block place-bet-btn" data-market-id="${market.id}" data-opt-id="${opt.id}" style="padding:0.65rem; font-size:0.85rem;">
                                        + Parier sur "${esc(opt.label)}"
                                    </button>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Mes Positions sur ce Marché -->
            ${myBets.length > 0 ? `
                <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:1.25rem; margin-bottom:1.25rem;">
                    <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:0.85rem;"><i class="fa-solid fa-ticket"></i> Mes Positions Actives (${myBets.length})</h3>
                    <div style="display:flex; flex-direction:column; gap:0.65rem;">
                        ${myBets.map(b => {
                            const opt = market.options.find(o => o.id === b.optId);
                            const curProb = probs[b.optId] || 50;
                            const buyProb = b.buyProb || curProb;
                            const sim = AMM.simulateCashout(market, b);
                            const isPositive = sim.pnl >= 0;

                            return `
                                <div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.85rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                                    <div>
                                        <div style="font-weight:700; color:${opt ? opt.color : 'inherit'}; font-size:0.95rem;">${esc(opt ? opt.label : b.optId)}</div>
                                        <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.15rem;">
                                            Misé : <b>${formatPoints(b.amount)} pts</b> • Acheté à <b>${buyProb}%</b> • Actuel : <b>${curProb}%</b>
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:0.85rem;">
                                        <div style="text-align:right;">
                                            <div style="font-weight:800; font-size:0.95rem; color:${isPositive ? 'var(--yes-color)' : 'var(--no-color)'};">
                                                ${isPositive ? '+' : ''}${formatPoints(sim.pnl)} pts
                                            </div>
                                            <div style="font-size:0.75rem; color:var(--text-secondary);">Valeur : ~${formatPoints(sim.refund)} pts</div>
                                        </div>
                                        ${isOpen ? `
                                            <button class="btn-outline cashout-btn" data-market-id="${market.id}" data-bet-id="${b.id}" style="padding:0.4rem 0.85rem; font-size:0.8rem;">
                                                Cashout (~${formatPoints(sim.refund)})
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Graphique d'Évolution des Cotes -->
            <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:1.25rem; margin-bottom:1.25rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="font-size:1.1rem; font-weight:700;"><i class="fa-solid fa-chart-line"></i> Évolution des Cotes</h3>
                    <button class="btn-outline" id="toggleChartBtn" style="padding:0.3rem 0.6rem; font-size:0.75rem;">
                        ${state.chartHidden ? '<i class="fa-solid fa-eye"></i> Afficher' : '<i class="fa-solid fa-eye-slash"></i> Masquer'}
                    </button>
                </div>
                <div id="chartWrapper" style="${state.chartHidden ? 'display:none;' : 'height:260px; position:relative;'}">
                    <canvas id="marketChartCanvas"></canvas>
                </div>
            </div>

            <!-- Espace Débats & Analyses -->
            <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:1.25rem; margin-bottom:1.5rem;">
                <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;">
                    <i class="fa-solid fa-comments"></i> Débats & Analyses (${comments.length})
                </h3>

                <!-- Formulaire Nouveau Commentaire -->
                <div style="margin-bottom:1.25rem;">
                    <textarea id="marketCommentInput" class="input-full" rows="3" placeholder="Donnez votre avis, vos arguments ou vos prédictions..." style="resize:vertical; font-size:0.85rem; padding:0.75rem;"></textarea>
                    <div style="display:flex; justify-content:flex-end; margin-top:0.5rem;">
                        <button class="btn-primary" id="postCommentBtn" style="padding:0.45rem 1rem; font-size:0.85rem;">
                            <i class="fa-solid fa-paper-plane"></i> Publier mon avis
                        </button>
                    </div>
                </div>

                <!-- Liste des Commentaires -->
                <div class="comments-list" style="display:flex; flex-direction:column; gap:0.75rem;">
                    ${comments.length === 0 ? `
                        <p style="color:var(--text-secondary); text-align:center; padding:1.5rem; font-size:0.85rem;">
                            Aucun commentaire pour le moment. Soyez le premier à donner votre analyse !
                        </p>
                    ` : comments.map(c => `
                        <div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.85rem;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                                <b style="font-size:0.85rem;">${esc(c.userName || 'Membre')}</b>
                                <span style="font-size:0.75rem; color:var(--text-secondary);">${formatRelativeTime(c.time)}</span>
                            </div>
                            <p style="font-size:0.85rem; line-height:1.4; color:var(--text-primary); margin:0;">${esc(c.text)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

export function attachMarketEvents(marketId) {
    const market = (state.markets || []).find(m => m.id === marketId);
    if (!market) return;

    // Bet Button -> Open Bet Slip
    document.querySelectorAll('.place-bet-btn').forEach(btn => {
        btn.onclick = () => {
            const optId = btn.dataset.optId;
            betSlip.open(market.id, optId, 50);
        };
    });

    // Cashout
    document.querySelectorAll('.cashout-btn').forEach(btn => {
        btn.onclick = async () => {
            const bId = btn.dataset.betId;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                const res = await api.post(`/api/markets/${market.id}/cashout/${bId}`);
                state.setUser(res.user);
                toast.success(`Cashout réussi : +${formatPoints(res.refund)} pts crédités !`);
                await router.fetchGlobalData();
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur lors du cashout");
                btn.disabled = false;
                btn.innerHTML = 'Cashout';
            }
        };
    });

    // Share Card
    const shareBtn = document.getElementById('marketShareBtn');
    if (shareBtn) {
        shareBtn.onclick = () => shareCard.open(market);
    }

    // Toggle Chart Visibility
    const toggleChartBtn = document.getElementById('toggleChartBtn');
    if (toggleChartBtn) {
        toggleChartBtn.onclick = () => {
            state.chartHidden = !state.chartHidden;
            localStorage.setItem('chartHidden', state.chartHidden ? '1' : '0');
            router.renderCurrentView();
        };
    }

    // Init Chart
    if (!state.chartHidden) {
        renderChart(market);
    }

    // Post Comment
    const commentBtn = document.getElementById('postCommentBtn');
    if (commentBtn) {
        commentBtn.onclick = async () => {
            const input = document.getElementById('marketCommentInput');
            const text = input ? input.value.trim() : '';
            if (!text) return toast.error("Veuillez écrire un message");

            commentBtn.disabled = true;
            commentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                await api.post(`/api/markets/${market.id}/comments`, { text });
                toast.success("Commentaire publié !");
                await router.fetchGlobalData();
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur de publication");
                commentBtn.disabled = false;
                commentBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publier mon avis';
            }
        };
    }

    // Pin
    const pinBtn = document.getElementById('marketDetailPinBtn');
    if (pinBtn) {
        pinBtn.onclick = async () => {
            try {
                const res = await api.post('/api/users/pin-market', { marketId: market.id });
                state.setUser(res.user);
                toast.info(res.pinned ? "Marché épinglé" : "Marché désépinglé");
                router.renderCurrentView();
            } catch (err) { toast.error("Erreur"); }
        };
    }

    // Admin Direct Actions
    bindAdminInlineActions(market);
}

function bindAdminInlineActions(market) {
    const renameBtn = document.querySelector('.admin-direct-rename');
    if (renameBtn) {
        renameBtn.onclick = () => {
            modal.show({
                title: "Renommer le marché",
                content: `<input type="text" id="directRenameInput" class="input-full" value="${esc(market.title)}">`,
                confirmText: "Enregistrer",
                onConfirm: async () => {
                    const newTitle = document.getElementById('directRenameInput').value.trim();
                    if (!newTitle) { toast.error("Titre requis"); throw new Error(); }
                    await api.post(`/api/admin/markets/${market.id}/rename`, { title: newTitle });
                    toast.success("Marché renommé");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    }

    const catBtn = document.querySelector('.admin-direct-cat');
    if (catBtn) {
        catBtn.onclick = () => {
            const cats = state.categories || [];
            modal.show({
                title: "Modifier la catégorie",
                content: `
                    <select id="directCatSelect" class="input-full">
                        <option value="">-- Sans catégorie --</option>
                        ${cats.map(c => `<option value="${c.id}" ${market.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                    </select>
                `,
                confirmText: "Enregistrer",
                onConfirm: async () => {
                    const categoryId = document.getElementById('directCatSelect').value || null;
                    await api.post(`/api/admin/markets/${market.id}/category`, { categoryId });
                    toast.success("Catégorie mise à jour");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    }

    const pauseBtn = document.querySelector('.admin-direct-pause');
    if (pauseBtn) {
        pauseBtn.onclick = async () => {
            await api.post(`/api/admin/markets/${market.id}/toggle-pause`);
            toast.info("Statut mis à jour");
            await router.fetchGlobalData();
            router.renderCurrentView();
        };
    }

    const resolveBtn = document.querySelector('.admin-direct-resolve');
    if (resolveBtn) {
        resolveBtn.onclick = () => {
            modal.show({
                title: `Clôturer : "${esc(market.title)}"`,
                content: `
                    <select id="directWinnerSelect" class="input-full">
                        <option value="cancelled">-- ANNULER (Remboursement intégral) --</option>
                        ${market.options.map(o => `<option value="${o.id}">Gagnant : ${esc(o.label)}</option>`).join('')}
                    </select>
                `,
                confirmText: "Clôturer et Payer",
                onConfirm: async () => {
                    const winnerId = document.getElementById('directWinnerSelect').value;
                    await api.post(`/api/admin/markets/${market.id}/resolve`, { winnerId });
                    toast.success("Marché clôturé !");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    }

    const delBtn = document.querySelector('.admin-direct-delete');
    if (delBtn) {
        delBtn.onclick = () => {
            modal.show({
                title: "Supprimer ce marché ?",
                content: "<p style='color:#ef4444;'>Action irréversible.</p>",
                confirmText: "Supprimer",
                isDanger: true,
                onConfirm: async () => {
                    await api.delete(`/api/admin/markets/${market.id}`);
                    toast.success("Marché supprimé");
                    await router.fetchGlobalData();
                    router.navigate('/');
                }
            });
        };
    }
}

function renderChart(market) {
    const canvas = document.getElementById('marketChartCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    const history = market.history || [];
    if (history.length === 0) return;

    const formatTimeLabel = (raw) => {
        if (!raw) return "";
        if (raw.length <= 11) return raw; // Ex: "Début" ou "19/05 12:15"
        try {
            const d = new Date(raw);
            if (isNaN(d.getTime())) return raw.substring(0, 10);
            return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        } catch {
            return raw;
        }
    };

    const labels = history.map(h => formatTimeLabel(h.time));

    const datasets = market.options.map(opt => ({
        label: opt.label,
        data: history.map(h => h[opt.id] !== undefined ? h[opt.id] : 50),
        borderColor: opt.color || '#22c55e',
        backgroundColor: (opt.color || '#22c55e') + '15',
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: history.length > 20 ? 0 : 3,
        pointHoverRadius: 6
    }));

    if (chartInstance) chartInstance.destroy();

    const isDark = state.theme === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#a1a1aa' : '#64748b';

    chartInstance = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: textColor, font: { family: 'Inter', size: 11, weight: '600' } }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}% (x${formatOdds(AMM.probToDecimalOdds(ctx.raw))})`
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: { color: textColor, callback: v => `${v}%` },
                    grid: { color: gridColor }
                },
                x: {
                    ticks: { color: textColor, maxTicksLimit: 6 },
                    grid: { color: gridColor }
                }
            }
        }
    });
}
