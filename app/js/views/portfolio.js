/**
 * PolyBoquette - Vue Portefeuille (Portfolio & P&L)
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { AMM } from '../amm.js';
import { toast } from '../components/toast.js';
import { esc, formatPoints, formatOdds, formatDate } from '../utils.js';

let portfolioData = null;

export function renderPortfolio() {
    const user = state.currentUser;
    if (!user) {
        return `
            <div class="empty-state">
                <h2>Connexion requise</h2>
                <p style="color:var(--text-secondary); margin-bottom:1rem;">Connectez-vous pour consulter votre portefeuille et vos gains.</p>
                <button class="btn-primary" onclick="window.location.hash = '#/login'">Se connecter</button>
            </div>
        `;
    }

    const pData = portfolioData || {
        points: user.points,
        portfolioNetWorth: user.points,
        totalInvested: 0,
        totalCurrentValue: 0,
        latentPnl: 0,
        winrate: 0,
        openPositions: [],
        transactions: user.transactions || []
    };

    const openPositions = pData.openPositions || [];
    const isLatentPositive = pData.latentPnl >= 0;

    return `
        <div class="portfolio-container">
            <h1 class="page-title"><i class="fa-solid fa-wallet"></i> Mon Portefeuille & Performances</h1>

            <!-- Métriques Clés P&L -->
            <div class="pnl-metrics-grid">
                <div class="pnl-card">
                    <div class="pnl-card-title">Valeur Nette Totale</div>
                    <div class="pnl-card-val" style="color:var(--text-primary);">${formatPoints(pData.portfolioNetWorth)} <span style="font-size:0.85rem; font-weight:500;">pts</span></div>
                    <div class="pnl-card-sub">Points libres + Valeur des positions</div>
                </div>

                <div class="pnl-card">
                    <div class="pnl-card-title">Points Disponibles</div>
                    <div class="pnl-card-val" style="color:var(--accent-color);">${formatPoints(pData.points)} <span style="font-size:0.85rem; font-weight:500;">pts</span></div>
                    <div class="pnl-card-sub">Prêts à être misés</div>
                </div>

                <div class="pnl-card">
                    <div class="pnl-card-title">Gains Latents (En cours)</div>
                    <div class="pnl-card-val" style="color:${isLatentPositive ? 'var(--yes-color)' : 'var(--no-color)'};">
                        ${isLatentPositive ? '+' : ''}${formatPoints(pData.latentPnl)} <span style="font-size:0.85rem; font-weight:500;">pts</span>
                    </div>
                    <div class="pnl-card-sub">Sur ${formatPoints(pData.totalInvested)} pts engagés</div>
                </div>

                <div class="pnl-card">
                    <div class="pnl-card-title">Taux de Réussite</div>
                    <div class="pnl-card-val" style="color:#eab308;">${pData.winrate}%</div>
                    <div class="pnl-card-sub">Sur les paris résolus</div>
                </div>
            </div>

            <!-- Positions Ouvertes -->
            <div class="portfolio-section-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="font-size:1.15rem; font-weight:700;">
                        <i class="fa-solid fa-bolt"></i> Positions Ouvertes (${openPositions.length})
                    </h3>
                </div>

                ${openPositions.length === 0 ? `
                    <div style="padding:2.5rem; text-align:center; color:var(--text-secondary);">
                        <i class="fa-solid fa-ticket fa-2x" style="margin-bottom:0.75rem; opacity:0.6;"></i>
                        <p style="font-weight:600; margin-bottom:0.25rem;">Aucune position ouverte actuellement</p>
                        <p style="font-size:0.85rem; margin-bottom:1rem;">Explorez les marchés actifs pour placer vos prédictions.</p>
                        <button class="btn-primary" onclick="window.location.hash = '#/'">
                            <i class="fa-solid fa-fire"></i> Explorer les marchés
                        </button>
                    </div>
                ` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>Marché</th>
                                    <th>Option</th>
                                    <th>Mise</th>
                                    <th>Cote d'achat</th>
                                    <th>Cote actuelle</th>
                                    <th>Valeur Spot</th>
                                    <th>P&L</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${openPositions.map(pos => {
                                    const isPos = pos.pnl >= 0;
                                    const buyOdds = AMM.probToDecimalOdds(pos.buyProb);
                                    const curOdds = AMM.probToDecimalOdds(pos.currentProb);

                                    return `
                                        <tr>
                                            <td>
                                                <a href="#/market/${pos.marketId}" style="font-weight:600; color:var(--text-primary);">
                                                    ${esc(pos.marketTitle)}
                                                </a>
                                            </td>
                                            <td>
                                                <span style="font-weight:700; color:${pos.optColor || '#22c55e'};">
                                                    ${esc(pos.optLabel)}
                                                </span>
                                            </td>
                                            <td><b>${formatPoints(pos.amount)}</b> pts</td>
                                            <td>x${formatOdds(buyOdds)} <span style="font-size:0.75rem; color:var(--text-secondary);">(${pos.buyProb}%)</span></td>
                                            <td>x${formatOdds(curOdds)} <span style="font-size:0.75rem; color:var(--text-secondary);">(${pos.currentProb}%)</span></td>
                                            <td><b>${formatPoints(pos.currentValue)}</b> pts</td>
                                            <td style="font-weight:700; color:${isPos ? 'var(--yes-color)' : 'var(--no-color)'};">
                                                ${isPos ? '+' : ''}${formatPoints(pos.pnl)} pts
                                            </td>
                                            <td>
                                                <button class="btn-outline cashout-btn" data-market-id="${pos.marketId}" data-bet-id="${pos.betId}" style="padding:0.35rem 0.75rem; font-size:0.8rem;">
                                                    Cashout (~${formatPoints(pos.currentValue)})
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- Grand Livre des Transactions -->
            <div class="portfolio-section-card" style="margin-top:1.5rem;">
                <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:1rem;">
                    <i class="fa-solid fa-list-check"></i> Historique des Transactions
                </h3>

                ${pData.transactions.length === 0 ? `
                    <p style="color:var(--text-secondary); text-align:center; padding:1.5rem;">Aucune transaction enregistrée.</p>
                ` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Impact Solde</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pData.transactions.slice(0, 30).map(t => {
                                    const isCredit = t.amount > 0;
                                    const isDebit = t.amount < 0;

                                    return `
                                        <tr>
                                            <td style="font-size:0.85rem; color:var(--text-secondary);">${formatDate(t.time)}</td>
                                            <td style="font-weight:500;">${esc(t.desc)}</td>
                                            <td style="font-weight:700; color:${isCredit ? 'var(--yes-color)' : (isDebit ? 'var(--no-color)' : 'inherit')};">
                                                ${isCredit ? '+' : ''}${formatPoints(t.amount)} pts
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>
    `;
}

export function attachPortfolioEvents() {
    // Rechargement des données fraîches depuis le serveur
    api.get('/api/users/portfolio')
        .then(data => {
            portfolioData = data;
            // Si données différentes, rafraîchir la vue
            const container = document.getElementById('app-container');
            if (container && state.currentRoute === 'portfolio') {
                container.innerHTML = renderPortfolio();
                bindCashoutButtons();
            }
        })
        .catch(() => {});

    bindCashoutButtons();
}

function bindCashoutButtons() {
    document.querySelectorAll('.cashout-btn').forEach(btn => {
        btn.onclick = async () => {
            const mId = btn.dataset.marketId;
            const bId = btn.dataset.betId;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const res = await api.post(`/api/markets/${mId}/cashout/${bId}`);
                state.setUser(res.user);
                toast.success(`Cashout réussi : +${formatPoints(res.refund)} pts crédités !`);
                // Recharger portfolio
                portfolioData = await api.get('/api/users/portfolio');
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur de cashout");
                btn.disabled = false;
                btn.innerHTML = 'Cashout';
            }
        };
    });
}
