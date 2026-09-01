/**
 * PolyBoquette - Floating Bet Slip (Ticket de Pari Flottant)
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { AMM } from '../amm.js';
import { toast } from './toast.js';
import { shareCard } from './shareCard.js';
import { formatPoints, formatOdds, esc } from '../utils.js';

export const betSlip = {
    open(marketId, optId, defaultAmount = 50) {
        state.betSlip.isOpen = true;
        state.betSlip.marketId = marketId;
        state.betSlip.optId = optId;
        state.betSlip.amount = defaultAmount;
        this.render();
    },

    close() {
        state.betSlip.isOpen = false;
        this.render();
    },

    render() {
        let container = document.getElementById('betSlipContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'betSlipContainer';
            container.className = 'bet-slip-container';
            document.body.appendChild(container);
        }

        if (!state.betSlip.isOpen || !state.betSlip.marketId) {
            container.innerHTML = '';
            container.classList.remove('open');
            return;
        }

        const market = state.markets.find(m => m.id === state.betSlip.marketId);
        if (!market) return this.close();

        const opt = market.options.find(o => o.id === state.betSlip.optId) || market.options[0];
        const probs = AMM.getProbabilities(market);
        const prob = probs[opt.id] || 50;
        const decOdds = AMM.probToDecimalOdds(prob);

        const amount = Number(state.betSlip.amount) || 0;
        const user = state.currentUser;
        const userPoints = user ? user.points : 0;

        const sim = AMM.simulateBuy(market, opt.id, amount);

        container.classList.add('open');
        container.innerHTML = `
            <div class="bet-slip-card">
                <div class="bet-slip-header">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span class="bet-slip-badge" style="background:${opt.color || '#22c55e'}"></span>
                        <span style="font-weight:700; font-size:1rem;">Ticket de Pari</span>
                    </div>
                    <button class="btn-icon" id="closeBetSlipBtn" style="width:28px; height:28px;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="bet-slip-body">
                    <div class="bet-slip-market-title">${esc(market.title)}</div>
                    
                    <div class="bet-slip-choice">
                        <span style="font-weight:700; color:${opt.color || '#22c55e'}">${esc(opt.label)}</span>
                        <div style="text-align:right;">
                            <span class="bet-slip-odds">Cote x${formatOdds(sim.decimalOdds || decOdds)}</span>
                            <span style="font-size:0.8rem; color:var(--text-secondary); margin-left:0.25rem;">(${prob}%)</span>
                        </div>
                    </div>

                    <div style="margin-top:0.75rem;">
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:0.25rem;">
                            <span style="color:var(--text-secondary)">Montant de la mise</span>
                            <span style="font-weight:600;">Solde : ${formatPoints(userPoints)} pts</span>
                        </div>
                        <div class="bet-input-wrapper">
                            <input type="number" id="betSlipInput" value="${amount}" min="1" max="${userPoints}" class="bet-slip-input">
                            <span class="bet-input-unit">pts</span>
                        </div>
                    </div>

                    <div class="quick-amounts">
                        <button class="quick-btn" data-add="10">+10</button>
                        <button class="quick-btn" data-add="50">+50</button>
                        <button class="quick-btn" data-add="100">+100</button>
                        <button class="quick-btn" data-set="${userPoints}">Max</button>
                    </div>

                    <div class="bet-slip-summary">
                        <div class="summary-row">
                            <span>Gain estimé (si gagnant)</span>
                            <span class="payout-highlight">~${formatPoints(sim.payoutIfWin)} pts</span>
                        </div>
                        <div class="summary-row" style="font-size:0.8rem; color:var(--text-secondary);">
                            <span>Bénéfice net</span>
                            <span style="color:var(--yes-color); font-weight:600;">+${formatPoints(Math.max(0, sim.payoutIfWin - amount))} pts</span>
                        </div>
                        ${sim.priceImpact > 1 ? `
                            <div class="summary-row" style="font-size:0.75rem; color:#f97316;">
                                <span><i class="fa-solid fa-arrow-trend-up"></i> Impact marché</span>
                                <span>+${sim.priceImpact}%</span>
                            </div>
                        ` : ''}
                    </div>

                    <button class="btn-primary btn-block" id="confirmBetBtn" style="margin-top:0.75rem; padding:0.85rem;" ${!user || amount <= 0 || amount > userPoints ? 'disabled' : ''}>
                        ${!user ? 'Connectez-vous pour miser' : (amount > userPoints ? 'Solde insuffisant' : `<i class="fa-solid fa-check"></i> Valider mon Pari (${formatPoints(amount)} pts)`)}
                    </button>
                </div>
            </div>
        `;

        // Event Listeners
        document.getElementById('closeBetSlipBtn').onclick = () => this.close();

        const input = document.getElementById('betSlipInput');
        input.oninput = (e) => {
            state.betSlip.amount = Math.max(0, parseInt(e.target.value) || 0);
            this.render();
        };

        container.querySelectorAll('.quick-btn').forEach(btn => {
            btn.onclick = () => {
                if (btn.dataset.add) {
                    state.betSlip.amount = (Number(state.betSlip.amount) || 0) + parseInt(btn.dataset.add);
                } else if (btn.dataset.set) {
                    state.betSlip.amount = parseInt(btn.dataset.set) || 0;
                }
                this.render();
            };
        });

        const confirmBtn = document.getElementById('confirmBetBtn');
        if (confirmBtn && user && amount > 0 && amount <= userPoints) {
            confirmBtn.onclick = async () => {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';
                try {
                    const res = await api.post(`/api/markets/${market.id}/buy`, {
                        optId: opt.id,
                        amount: amount
                    });

                    // Update user & market state
                    state.setUser(res.user);
                    const idx = state.markets.findIndex(m => m.id === market.id);
                    if (idx !== -1) {
                        state.markets[idx] = res.market;
                        state.setMarkets([...state.markets]);
                    }

                    toast.success(`Pari de ${formatPoints(amount)} pts validé avec succès !`);
                    this.close();

                    // Proposer le partage social
                    shareCard.generateAndShow({
                        userName: user.name,
                        marketTitle: market.title,
                        optionLabel: opt.label,
                        optionColor: opt.color,
                        amount: amount,
                        decimalOdds: sim.decimalOdds || decOdds,
                        probPercent: prob,
                        potentialGain: sim.payoutIfWin
                    });

                } catch (err) {
                    toast.error(err.message || "Erreur lors du pari");
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Valider mon Pari';
                }
            };
        }
    }
};
