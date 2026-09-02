/**
 * PolyBoquette - Moteur de Cotation & Cotes Continues (Pure Volume Pari-Mutuel & Anti-Arbitrage)
 */

export const AMM = {
    /**
     * Calcule la cote décimale européenne à partir d'une probabilité en pourcentage.
     * Ex: 50% -> x2.00, 25% -> x4.00, 80% -> x1.25
     */
    probToDecimalOdds(probPercent) {
        if (!probPercent || probPercent <= 0) return 1.01;
        if (probPercent >= 100) return 1.01;
        return Math.max(1.01, parseFloat((100 / probPercent).toFixed(2)));
    },

    /**
     * Calcule les probabilités de chaque option strictement dérivées des vrais volumes de paris (bets).
     * Règle d'or : Plus une option accumule de points, plus sa probabilité est haute et sa cote basse.
     */
    getProbabilities(market, excludeBet = null) {
        const options = market.options || [];
        if (!options || options.length === 0) return {};

        const bets = market.bets || [];
        const n = options.length;
        const L = 50; // Prior de liquidité initiale
        const base = L / n;

        const vols = {};
        options.forEach(o => vols[o.id] = 0);

        bets.forEach(b => {
            if (excludeBet && b.id === excludeBet.id) return;
            const amt = Number(b.amount) || 0;
            if (vols[b.optId] !== undefined) {
                vols[b.optId] += amt;
            }
        });

        const totalVol = Object.values(vols).reduce((s, v) => s + v, 0);
        const totalWeight = L + totalVol;

        const probs = {};
        let sumRounded = 0;

        options.forEach((opt, idx) => {
            const weight = base + (vols[opt.id] || 0);
            const rawPct = (weight / totalWeight) * 100;
            const rounded = (idx < n - 1) ? Math.round(rawPct) : Math.max(1, 100 - sumRounded);
            probs[opt.id] = Math.max(1, Math.min(99, rounded));
            sumRounded += probs[opt.id];
        });

        return probs;
    },

    /**
     * Simule un achat pour le Bet Slip
     */
    simulateBuy(market, optId, amount) {
        const probs = this.getProbabilities(market);
        const curProb = probs[optId] || 50;
        const currentOdds = this.probToDecimalOdds(curProb);

        // Simulation post-mise
        const simulatedBets = [...(market.bets || []), { id: '_sim', optId, amount }];
        const newProbs = this.getProbabilities({ ...market, bets: simulatedBets });
        const newProb = newProbs[optId] || curProb;
        const newOdds = this.probToDecimalOdds(newProb);

        // Gain estimé si vainqueur
        const estPayout = Math.floor(amount * currentOdds);

        return {
            currentProb: curProb,
            newProb: newProb,
            currentOdds: currentOdds,
            newOdds: newOdds,
            estPayout: estPayout,
            priceImpact: newProb - curProb
        };
    },

    /**
     * Simule un cashout équilibré sans risque d'arbitrage
     */
    simulateCashout(market, bet) {
        const curProbs = this.getProbabilities(market, bet);
        const curProb = curProbs[bet.optId] || 50;
        const buyProb = bet.buyProb || curProb;

        const ratio = curProb / Math.max(1, buyProb);
        const refund = Math.max(1, Math.floor(bet.amount * ratio * 0.95));

        return {
            curProb,
            buyProb,
            refund,
            pnl: refund - bet.amount
        };
    }
};
