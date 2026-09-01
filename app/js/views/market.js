/**
 * PolyBoquette - Vue Détail Marché
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { AMM } from '../amm.js';
import { betSlip } from '../components/betSlip.js';
import { toast } from '../components/toast.js';
import { shareCard } from '../components/shareCard.js';
import { esc, formatPoints, formatOdds, formatDate, formatRelativeTime, getRemainingTime } from '../utils.js';

let activeChart = null;

export function renderMarket(marketId) {
    const market = state.markets.find(m => m.id === marketId);
    if (!market) {
        return `
            <div class="empty-state">
                <h2>Marché introuvable</h2>
                <button class="btn-outline" onclick="window.location.hash = '#/'">Retour à l'accueil</button>
            </div>
        `;
    }

    const user = state.currentUser;
    const probs = AMM.getProbabilities(market);
    const remaining = getRemainingTime(market.pauseAt);
    const isOpen = market.status === 'open' && (!remaining || !remaining.isExpired);

    // Positions de l'utilisateur sur ce marché
    const myBets = (market.bets || []).filter(b => user && b.userId === user.id);
    const myTotalInvested = myBets.reduce((sum, b) => sum + b.amount, 0);

    return `
        <div class="market-detail-container">
            <!-- Bouton Retour & Partage -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <button class="btn-outline" id="backToDashBtn">
                    <i class="fa-solid fa-arrow-left"></i> Retour
                </button>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-outline" id="shareMarketBtn">
                        <i class="fa-solid fa-share-nodes"></i> Partager
                    </button>
                    ${user && user.role === 'admin' ? `
                        <button class="btn-primary" onclick="window.location.hash = '#/admin'">
                            <i class="fa-solid fa-gear"></i> Gérer
                        </button>
                    ` : ''}
                </div>
            </div>

            <!-- Bannière Freeze / Clôture -->
            ${remaining && !remaining.isExpired ? `
                <div class="freeze-alert-banner">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                    <div>
                        <b>Clôture programmée :</b> Les prises de paris seront gelées dans <b>${remaining.label}</b> (le ${formatDate(market.pauseAt)}).
                    </div>
                </div>
            ` : ''}

            ${!isOpen ? `
                <div class="market-closed-banner">
                    <i class="fa-solid fa-lock"></i>
                    <div>
                        <b>Marché Clôturé :</b> Ce marché n'accepte plus de transactions.
                        ${market.status === 'resolved' ? `(Résultat : <b>${esc(market.resolvedWinner === 'cancelled' ? 'Annulé' : (market.options.find(o => o.id === market.resolvedWinner)?.label || market.resolvedWinner))}</b>)` : ''}
                    </div>
                </div>
            ` : ''}

            <!-- Header du Marché -->
            <div class="market-detail-header">
                <img src="${esc(market.image)}" alt="Cover" class="market-detail-img" onerror="this.src='logo.png'">
                <div style="flex:1;">
                    <h1 class="market-detail-title">${esc(market.title)}</h1>
                    <div class="market-detail-stats">
                        <span><i class="fa-solid fa-chart-simple"></i> Volume : <b>${formatPoints(market.volume)} pts</b></span>
                        <span><i class="fa-solid fa-users"></i> ${(market.bets || []).length} positions</span>
                        <span><i class="fa-solid fa-comments"></i> ${(market.comments || []).length} avis</span>
                    </div>
                </div>
            </div>

            <!-- Grille Options / Cotes Interactives -->
            <div class="market-options-grid">
                ${market.options.map(opt => {
                    const prob = probs[opt.id] || 50;
                    const decOdds = AMM.probToDecimalOdds(prob);
                    const optBets = (market.bets || []).filter(b => b.optId === opt.id);
                    const optVolume = optBets.reduce((sum, b) => sum + b.amount, 0);

                    return `
                        <div class="option-card" style="border-left: 4px solid ${opt.color || '#22c55e'};">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-weight:700; font-size:1.1rem; color:${opt.color || 'inherit'};">${esc(opt.label)}</div>
                                <div style="text-align:right;">
                                    <span class="odds-tag">Cote x${formatOdds(decOdds)}</span>
                                    <span style="font-size:0.9rem; font-weight:700; color:var(--text-primary); margin-left:0.35rem;">${prob}%</span>
                                </div>
                            </div>

                            <div style="margin-top:0.75rem; font-size:0.8rem; color:var(--text-secondary); display:flex; justify-content:space-between;">
                                <span>Volume : ${formatPoints(optVolume)} pts</span>
                                <span>${optBets.length} parieur${optBets.length > 1 ? 's' : ''}</span>
                            </div>

                            <div class="progress-bar-bg" style="margin-top:0.5rem;">
                                <div class="progress-bar-fill" style="width:${prob}%; background:${opt.color || '#22c55e'};"></div>
                            </div>

                            ${isOpen ? `
                                <button class="btn-primary btn-block open-bet-btn" data-market-id="${market.id}" data-opt-id="${opt.id}" style="margin-top:1rem;">
                                    <i class="fa-solid fa-plus"></i> Parier sur "${esc(opt.label)}"
                                </button>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Graphique d'Évolution -->
            <div class="chart-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="font-size:1.1rem; font-weight:700;"><i class="fa-solid fa-chart-line"></i> Évolution des Cotes</h3>
                    <button class="btn-outline" id="toggleChartBtn" style="padding:0.3rem 0.75rem; font-size:0.8rem;">
                        ${state.chartHidden ? '<i class="fa-solid fa-eye"></i> Afficher' : '<i class="fa-solid fa-eye-slash"></i> Masquer'}
                    </button>
                </div>
                <div id="chartWrapper" style="${state.chartHidden ? 'display:none;' : ''}">
                    <canvas id="marketProbChart" height="280"></canvas>
                </div>
            </div>

            <!-- Mes Positions sur ce Marché -->
            ${user && myBets.length > 0 ? `
                <div class="my-positions-card">
                    <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;">
                        <i class="fa-solid fa-wallet"></i> Vos Positions (${formatPoints(myTotalInvested)} pts engagés)
                    </h3>
                    <div class="positions-list">
                        ${myBets.map(b => {
                            const opt = market.options.find(o => o.id === b.optId);
                            const curProb = probs[b.optId] || 50;
                            const simCashout = AMM.simulateSell(market, b.optId, b.amount);
                            const pnl = simCashout.refundPoints - b.amount;
                            const isPositive = pnl >= 0;

                            return `
                                <div class="position-row">
                                    <div>
                                        <div style="font-weight:700; color:${opt ? opt.color : 'inherit'};">
                                            ${esc(opt ? opt.label : b.optId)}
                                        </div>
                                        <div style="font-size:0.8rem; color:var(--text-secondary);">
                                            Misé : ${formatPoints(b.amount)} pts • Acheté à ${b.buyProb || 50}% • Actuel : ${curProb}%
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:1rem;">
                                        <div style="text-align:right;">
                                            <div style="font-weight:700; color:${isPositive ? 'var(--yes-color)' : 'var(--no-color)'};">
                                                ${isPositive ? '+' : ''}${formatPoints(pnl)} pts
                                            </div>
                                            <div style="font-size:0.75rem; color:var(--text-secondary);">
                                                Valeur : ~${formatPoints(simCashout.refundPoints)} pts
                                            </div>
                                        </div>
                                        ${isOpen ? `
                                            <button class="btn-outline cashout-btn" data-bet-id="${b.id}" data-market-id="${market.id}">
                                                Cashout (~${formatPoints(simCashout.refundPoints)})
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Espace Commentaires & Débats -->
            <div class="comments-card">
                <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;">
                    <i class="fa-solid fa-comments"></i> Débats & Analyses (${(market.comments || []).length})
                </h3>

                ${user ? `
                    <div class="comment-input-box">
                        <textarea id="commentText" placeholder="Donnez votre avis, vos arguments ou vos sources..." rows="2" class="comment-textarea"></textarea>
                        <div style="display:flex; justify-content:flex-end; margin-top:0.5rem;">
                            <button class="btn-primary" id="postCommentBtn">
                                <i class="fa-solid fa-paper-plane"></i> Publier
                            </button>
                        </div>
                    </div>
                ` : `
                    <div style="padding:1rem; text-align:center; background:var(--bg-secondary); border-radius:12px; font-size:0.9rem; color:var(--text-secondary);">
                        <a href="#/login">Connectez-vous</a> pour participer au débat.
                    </div>
                `}

                <div class="comments-list" style="margin-top:1.5rem;">
                    ${(market.comments || []).length === 0 ? `
                        <p style="color:var(--text-secondary); text-align:center; font-size:0.9rem;">Aucun commentaire pour le moment. Soyez le premier à donner votre analyse !</p>
                    ` : (market.comments || []).slice().reverse().map(c => `
                        <div class="comment-item">
                            <div class="comment-author">
                                <i class="fa-solid fa-circle-user" style="color:var(--accent-color)"></i>
                                <b>${esc(c.userName)}</b>
                                <span class="comment-time">${formatRelativeTime(c.time)}</span>
                            </div>
                            <div class="comment-content">${esc(c.text)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

export function attachMarketEvents(marketId) {
    const market = state.markets.find(m => m.id === marketId);
    if (!market) return;

    // Retour Dashboard
    const backBtn = document.getElementById('backToDashBtn');
    if (backBtn) backBtn.onclick = () => router.navigate('/');

    // Ouvrir Bet Slip
    document.querySelectorAll('.open-bet-btn').forEach(btn => {
        btn.onclick = () => {
            const mId = btn.dataset.marketId;
            const optId = btn.dataset.optId;
            betSlip.open(mId, optId, 50);
        };
    });

    // Partager le marché
    const shareBtn = document.getElementById('shareMarketBtn');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const probs = AMM.getProbabilities(market);
            const topOpt = market.options[0];
            const topProb = probs[topOpt.id] || 50;
            shareCard.generateAndShow({
                userName: state.currentUser ? state.currentUser.name : "Un Gadzarts",
                marketTitle: market.title,
                optionLabel: topOpt.label,
                optionColor: topOpt.color,
                amount: 50,
                decimalOdds: AMM.probToDecimalOdds(topProb),
                probPercent: topProb,
                potentialGain: Math.floor(50 * AMM.probToDecimalOdds(topProb))
            });
        };
    }

    // Toggle Chart Visibility
    const toggleChartBtn = document.getElementById('toggleChartBtn');
    if (toggleChartBtn) {
        toggleChartBtn.onclick = () => {
            state.chartHidden = !state.chartHidden;
            localStorage.setItem('chartHidden', state.chartHidden ? '1' : '0');
            const wrapper = document.getElementById('chartWrapper');
            if (wrapper) wrapper.style.display = state.chartHidden ? 'none' : 'block';
            toggleChartBtn.innerHTML = state.chartHidden ? '<i class="fa-solid fa-eye"></i> Afficher' : '<i class="fa-solid fa-eye-slash"></i> Masquer';
        };
    }

    // Cashout Button
    document.querySelectorAll('.cashout-btn').forEach(btn => {
        btn.onclick = async () => {
            const betId = btn.dataset.betId;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                const res = await api.post(`/api/markets/${market.id}/cashout/${betId}`);
                state.setUser(res.user);
                const idx = state.markets.findIndex(m => m.id === market.id);
                if (idx !== -1) {
                    state.markets[idx] = res.market;
                    state.setMarkets([...state.markets]);
                }
                toast.success(`Cashout réussi : +${formatPoints(res.refund)} pts crédités !`);
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur lors du cashout");
                btn.disabled = false;
                btn.innerHTML = 'Cashout';
            }
        };
    });

    // Poster un commentaire
    const postCommentBtn = document.getElementById('postCommentBtn');
    if (postCommentBtn) {
        postCommentBtn.onclick = async () => {
            const textarea = document.getElementById('commentText');
            const text = textarea ? textarea.value.trim() : '';
            if (!text) return toast.error("Le commentaire ne peut pas être vide");

            postCommentBtn.disabled = true;
            postCommentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const res = await api.post(`/api/markets/${market.id}/comments`, { text });
                if (res.comment) {
                    if (!market.comments) market.comments = [];
                    market.comments.push(res.comment);
                    state.setMarkets([...state.markets]);
                }
                toast.success("Commentaire publié");
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur lors de la publication");
                postCommentBtn.disabled = false;
                postCommentBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publier';
            }
        };
    }

    // Render Chart.js
    initChart(market);
}

function initChart(market) {
    const canvas = document.getElementById('marketProbChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (activeChart) {
        activeChart.destroy();
        activeChart = null;
    }

    const history = market.history || [];
    const labels = history.map(h => h.time || 'Début');

    const datasets = market.options.map(opt => {
        const data = history.map(h => h[opt.id] !== undefined ? h[opt.id] : 50);
        return {
            label: opt.label,
            data: data,
            borderColor: opt.color || '#22c55e',
            backgroundColor: opt.color ? opt.color + '20' : '#22c55e20',
            borderWidth: 2.5,
            tension: 0.3,
            fill: false,
            pointRadius: data.length > 20 ? 0 : 3
        };
    });

    const isDark = state.theme === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? '#a0a0a0' : '#666666';

    activeChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        callback: val => val + '%'
                    }
                },
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, maxRotation: 0 }
                }
            },
            plugins: {
                legend: {
                    labels: { color: textColor, font: { family: 'Inter', weight: 600 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}% (Cote x${formatOdds(100 / Math.max(1, ctx.parsed.y))})`
                    }
                }
            }
        }
    });
}
