/**
 * PolyBoquette - Moteur de Cotation & Cotes Continues (Anti-Arbitrage)
 */

export const AMM = {
    /**
     * Calcule la cote décimale européenne à partir d'une probabilité en pourcentage.
     * Ex: 50% -> x2.00, 25% -> x4.00, 80% -> x1.25
     */
    probToDecimalOdds(probPercent) {
        if (!probPercent || probPercent <= 0) return 1.01;
        if (probPercent >= 100) return 1.01;
        return Math.max(1.01, 100 / probPercent);
    },

    /**
     * Calcule les probabilités de chaque option d'un marché basées sur les parts réelles.
     */
    getProbabilities(market) {
        const options = market.options || [];
        if (!options || options.length === 0) return {};

        const total = options.reduce((sum, o) => sum + (o.shares || 0), 0);
        if (total <= 0) {
            const n = options.length;
            const equal = Math.round(100 / n);
            const res = {};
            options.forEach(o => res[o.id] = equal);
            return res;
        }

        const probs = {};
        let sumRounded = 0;
        options.forEach((opt, idx) => {
            const pct = ((opt.shares || 0) / total) * 100;
            const rounded = (idx < options.length - 1) ? Math.round(pct) : Math.max(1, 100 - sumRounded);
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
        const simulatedOptions = (market.options || []).map(o => ({
            ...o,
            shares: o.id === optId ? (o.shares || 0) + amount : (o.shares || 0)
        }));

        const newProbs = this.getProbabilities({ options: simulatedOptions });
        const newProb = newProbs[optId] || curProb;
        const newOdds = this.probToDecimalOdds(newProb);

        // Gain estimé si vainqueur (calcul basé sur la cote d'entrée)
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
     * Simule un cashout équilibré
     */
    simulateCashout(market, bet) {
        const probs = this.getProbabilities(market);
        const curProb = probs[bet.optId] || 50;
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
