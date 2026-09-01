/**
 * PolyBoquette - Vue Portefeuille (Portfolio & P&L)
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { AMM } from '../amm.js';
import { toast } from '../components/toast.js';
import { esc, formatPoints, formatOdds, formatDate, formatRelativeTime } from '../utils.js';

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

    const markets = state.markets || [];

    // Collecte des positions actives (marchés ouverts)
    const openPositions = [];
    let totalInvestedInOpen = 0;
    let totalCurrentValue = 0;

    markets.forEach(m => {
        const myBets = (m.bets || []).filter(b => b.userId === user.id);
        const probs = AMM.getProbabilities(m);

        myBets.forEach(b => {
            const opt = m.options.find(o => o.id === b.optId);
            const sim = AMM.simulateSell(m, b.optId, b.amount);
            const curVal = m.status === 'open' ? sim.refundPoints : b.amount;
            const pnl = curVal - b.amount;

            if (m.status === 'open') {
                totalInvestedInOpen += b.amount;
                totalCurrentValue += curVal;
                openPositions.push({
                    market: m,
                    bet: b,
                    option: opt,
                    currentProb: probs[b.optId] || 50,
                    currentValue: curVal,
                    pnl: pnl
                });
            }
        });
    });

    // Transactions et historique
    const txs = user.transactions || [];
    const winTxs = txs.filter(t => t.desc && t.desc.startsWith("Gain '"));
    const lossTxs = txs.filter(t => t.desc && t.desc.startsWith("Pari perdu '"));
    const totalResolved = winTxs.length + lossTxs.length;
    const winrate = totalResolved > 0 ? Math.round((winTxs.length / totalResolved) * 100) : 0;

    const latentPnl = totalCurrentValue - totalInvestedInOpen;
    const isLatentPositive = latentPnl >= 0;
    const portfolioNetWorth = user.points + totalCurrentValue;

    return `
        <div class="portfolio-container">
            <h1 class="page-title"><i class="fa-solid fa-wallet"></i> Mon Portefeuille & Performances</h1>

            <!-- Métriques Clés P&L -->
            <div class="pnl-metrics-grid">
                <div class="pnl-card">
                    <div class="pnl-card-title">Valeur Nette Totale</div>
                    <div class="pnl-card-val" style="color:var(--text-primary);">${formatPoints(portfolioNetWorth)} <span style="font-size:0.9rem; font-weight:500;">pts</span></div>
                    <div class="pnl-card-sub">Points libres + Positions en cours</div>
                </div>

                <div class="pnl-card">
                    <div class="pnl-card-title">Points Libres (Cash)</div>
                    <div class="pnl-card-val" style="color:var(--accent-color);">${formatPoints(user.points)} <span style="font-size:0.9rem; font-weight:500;">pts</span></div>
                    <div class="pnl-card-sub">Disponible pour miser</div>
                </div>

                <div class="pnl-card">
                    <div class="pnl-card-title">Gains Latents (En cours)</div>
                    <div class="pnl-card-val" style="color:${isLatentPositive ? 'var(--yes-color)' : 'var(--no-color)'};">
                        ${isLatentPositive ? '+' : ''}${formatPoints(latentPnl)} <span style="font-size:0.9rem; font-weight:500;">pts</span>
                    </div>
                    <div class="pnl-card-sub">Sur ${formatPoints(totalInvestedInOpen)} pts investis</div>
                </div>

                <div class="pnl-card">
                    <div class="pnl-card-title">Taux de Réussite (Winrate)</div>
                    <div class="pnl-card-val" style="color:#eab308;">${winrate}%</div>
                    <div class="pnl-card-sub">${winTxs.length} victoires / ${totalResolved} paris résolus</div>
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
                    <div style="padding:2rem; text-align:center; color:var(--text-secondary);">
                        <p>Vous n'avez aucune position ouverte pour l'instant.</p>
                        <button class="btn-primary" style="margin-top:0.75rem;" onclick="window.location.hash = '#/'">
                            Explorer les marchés
                        </button>
                    </div>
                ` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>Marché</th>
                                    <th>Choix</th>
                                    <th>Mise</th>
                                    <th>Cote d'achat</th>
                                    <th>Cote actuelle</th>
                                    <th>Valeur</th>
                                    <th>P&L</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${openPositions.map(pos => {
                                    const isPos = pos.pnl >= 0;
                                    const buyOdds = AMM.probToDecimalOdds(pos.bet.buyProb || 50);
                                    const curOdds = AMM.probToDecimalOdds(pos.currentProb);

                                    return `
                                        <tr>
                                            <td>
                                                <a href="#/market/${pos.market.id}" style="font-weight:600; color:var(--text-primary);">
                                                    ${esc(pos.market.title)}
                                                </a>
                                            </td>
                                            <td>
                                                <span style="font-weight:700; color:${pos.option ? pos.option.color : 'inherit'};">
                                                    ${esc(pos.option ? pos.option.label : pos.bet.optId)}
                                                </span>
                                            </td>
                                            <td><b>${formatPoints(pos.bet.amount)}</b> pts</td>
                                            <td>x${formatOdds(buyOdds)} <span style="font-size:0.75rem; color:var(--text-secondary);">(${pos.bet.buyProb || 50}%)</span></td>
                                            <td>x${formatOdds(curOdds)} <span style="font-size:0.75rem; color:var(--text-secondary);">(${pos.currentProb}%)</span></td>
                                            <td><b>${formatPoints(pos.currentValue)}</b> pts</td>
                                            <td style="font-weight:700; color:${isPos ? 'var(--yes-color)' : 'var(--no-color)'};">
                                                ${isPos ? '+' : ''}${formatPoints(pos.pnl)} pts
                                            </td>
                                            <td>
                                                <button class="btn-outline cashout-btn" data-market-id="${pos.market.id}" data-bet-id="${pos.bet.id}" style="padding:0.35rem 0.75rem; font-size:0.8rem;">
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
                    <i class="fa-solid fa-list-check"></i> Historique des Transactions Récentes
                </h3>

                ${txs.length === 0 ? `
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
                                ${txs.slice(0, 30).map(t => {
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
    document.querySelectorAll('.cashout-btn').forEach(btn => {
        btn.onclick = async () => {
            const mId = btn.dataset.marketId;
            const bId = btn.dataset.betId;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const res = await api.post(`/api/markets/${mId}/cashout/${bId}`);
                state.setUser(res.user);
                const idx = state.markets.findIndex(m => m.id === mId);
                if (idx !== -1) {
                    state.markets[idx] = res.market;
                    state.setMarkets([...state.markets]);
                }
                toast.success(`Cashout réussi : +${formatPoints(res.refund)} pts crédités !`);
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur de cashout");
                btn.disabled = false;
                btn.innerHTML = 'Cashout';
            }
        };
    });
}
