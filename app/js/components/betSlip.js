/**
 * PolyBoquette - Floating Bet Slip (Ticket de Pari Flottant - Sans Perte de Focus)
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
        const container = document.getElementById('betSlipContainer');
        if (container) {
            container.classList.remove('open');
            container.innerHTML = '';
        }
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
                            <span class="bet-slip-odds" id="betSlipOddsLabel">Cote x${formatOdds(sim.decimalOdds || decOdds)}</span>
                            <span style="font-size:0.8rem; color:var(--text-secondary); margin-left:0.25rem;">(${prob}%)</span>
                        </div>
                    </div>

                    <div style="margin-top:0.75rem;">
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:0.25rem;">
                            <span style="color:var(--text-secondary)">Montant de la mise</span>
                            <span style="font-weight:600;" id="betSlipUserBal">Solde : ${formatPoints(userPoints)} pts</span>
                        </div>
                        <div class="bet-input-wrapper">
                            <input type="number" id="betSlipInput" value="${amount > 0 ? amount : ''}" placeholder="0" min="1" max="${userPoints}" class="bet-slip-input">
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
                            <span class="payout-highlight" id="betSlipPayoutVal">~${formatPoints(sim.payoutIfWin)} pts</span>
                        </div>
                        <div class="summary-row" style="font-size:0.8rem; color:var(--text-secondary);">
                            <span>Bénéfice net</span>
                            <span style="color:var(--yes-color); font-weight:600;" id="betSlipProfitVal">+${formatPoints(Math.max(0, sim.payoutIfWin - amount))} pts</span>
                        </div>
                        <div class="summary-row" id="betSlipImpactRow" style="font-size:0.75rem; color:#f97316; ${sim.priceImpact > 1 ? '' : 'display:none;'}">
                            <span><i class="fa-solid fa-arrow-trend-up"></i> Impact marché</span>
                            <span id="betSlipImpactVal">+${sim.priceImpact}%</span>
                        </div>
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
        
        // Mise à jour fluide SANS réinitialiser le DOM pour ne pas perdre le focus
        const updateCalculations = (newAmount) => {
            state.betSlip.amount = newAmount;
            const updatedSim = AMM.simulateBuy(market, opt.id, newAmount);
            
            const payoutEl = document.getElementById('betSlipPayoutVal');
            if (payoutEl) payoutEl.textContent = `~${formatPoints(updatedSim.payoutIfWin)} pts`;

            const profitEl = document.getElementById('betSlipProfitVal');
            if (profitEl) profitEl.textContent = `+${formatPoints(Math.max(0, updatedSim.payoutIfWin - newAmount))} pts`;

            const oddsEl = document.getElementById('betSlipOddsLabel');
            if (oddsEl) oddsEl.textContent = `Cote x${formatOdds(updatedSim.decimalOdds || decOdds)}`;

            const impactRow = document.getElementById('betSlipImpactRow');
            const impactVal = document.getElementById('betSlipImpactVal');
            if (impactRow && impactVal) {
                if (updatedSim.priceImpact > 1) {
                    impactRow.style.display = '';
                    impactVal.textContent = `+${updatedSim.priceImpact}%`;
                } else {
                    impactRow.style.display = 'none';
                }
            }

            const confirmBtn = document.getElementById('confirmBetBtn');
            if (confirmBtn) {
                const isValid = user && newAmount > 0 && newAmount <= userPoints;
                confirmBtn.disabled = !isValid;
                if (!user) {
                    confirmBtn.textContent = 'Connectez-vous pour miser';
                } else if (newAmount > userPoints) {
                    confirmBtn.textContent = 'Solde insuffisant';
                } else if (newAmount <= 0) {
                    confirmBtn.textContent = 'Indiquez un montant';
                } else {
                    confirmBtn.innerHTML = `<i class="fa-solid fa-check"></i> Valider mon Pari (${formatPoints(newAmount)} pts)`;
                }
            }
        };

        input.oninput = (e) => {
            const val = Math.max(0, parseInt(e.target.value) || 0);
            updateCalculations(val);
        };

        container.querySelectorAll('.quick-btn').forEach(btn => {
            btn.onclick = () => {
                let current = Number(state.betSlip.amount) || 0;
                let next = current;
                if (btn.dataset.add) {
                    next = current + parseInt(btn.dataset.add);
                } else if (btn.dataset.set) {
                    next = parseInt(btn.dataset.set) || 0;
                }
                input.value = next > 0 ? next : '';
                updateCalculations(next);
            };
        });

        const confirmBtn = document.getElementById('confirmBetBtn');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                const curAmount = Number(state.betSlip.amount) || 0;
                if (!user || curAmount <= 0 || curAmount > userPoints) return;

                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';
                try {
                    const res = await api.post(`/api/markets/${market.id}/buy`, {
                        optId: opt.id,
                        amount: curAmount
                    });

                    // Update user & market state
                    state.setUser(res.user);
                    const idx = state.markets.findIndex(m => m.id === market.id);
                    if (idx !== -1) {
                        state.markets[idx] = res.market;
                        state.setMarkets([...state.markets]);
                    }

                    toast.success(`Pari de ${formatPoints(curAmount)} pts validé avec succès !`);
                    this.close();

                    // Proposer le partage social
                    const finalSim = AMM.simulateBuy(market, opt.id, curAmount);
                    shareCard.generateAndShow({
                        userName: user.name,
                        marketTitle: market.title,
                        optionLabel: opt.label,
                        optionColor: opt.color,
                        amount: curAmount,
                        decimalOdds: finalSim.decimalOdds || decOdds,
                        probPercent: prob,
                        potentialGain: finalSim.payoutIfWin
                    });

                } catch (err) {
                    toast.error(err.message || "Erreur lors du pari");
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = `<i class="fa-solid fa-check"></i> Valider mon Pari (${formatPoints(curAmount)} pts)`;
                }
            };
        }
    }
};
