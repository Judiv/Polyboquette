/**
 * PolyBoquette - Automated Market Maker (AMM) Engine
 * Implémentation du modèle CPMM (Constant Product Market Maker)
 * pour marchés binaires et à choix multiples.
 */

export const AMM = {
    /**
     * Calcule les probabilités instantanées (%) de chaque option.
     * Pour un marché binaire/multi avec réserves pool { o1: shares1, o2: shares2, ... }
     */
    getProbabilities(market) {
        if (!market || !market.options || market.options.length === 0) return {};
        const options = market.options;

        // Si réserves AMM présentes
        if (market.poolReserves) {
            const inverses = {};
            let sumInv = 0;
            for (const opt of options) {
                const r = Math.max(1, market.poolReserves[opt.id] || 100);
                const inv = 1 / r;
                inverses[opt.id] = inv;
                sumInv += inv;
            }
            const probs = {};
            let sumRounded = 0;
            options.forEach((opt, idx) => {
                const p = (inverses[opt.id] / sumInv) * 100;
                const rounded = idx === options.length - 1 ? Math.max(1, 100 - sumRounded) : Math.round(p);
                probs[opt.id] = Math.min(99, Math.max(1, rounded));
                sumRounded += probs[opt.id];
            });
            return probs;
        }

        // Fallback / Initialisation équilibrée
        const total = options.reduce((sum, o) => sum + (o.shares || 0), 0);
        if (total <= 0) {
            const def = Math.round(100 / options.length);
            const res = {};
            options.forEach(o => res[o.id] = def);
            return res;
        }
        const res = {};
        options.forEach(o => {
            res[o.id] = Math.max(1, Math.min(99, Math.round(((o.shares || 0) / total) * 100)));
        });
        return res;
    },

    /**
     * Convertit une probabilité (1 à 99%) en cote décimale européenne (ex: 40% -> 2.50)
     */
    probToDecimalOdds(probPercent) {
        if (!probPercent || probPercent <= 0) return 99.0;
        const odds = 100 / Math.max(1, Math.min(99, probPercent));
        return Math.round(odds * 100) / 100;
    },

    /**
     * Simule un achat de parts pour une option donnée avec un montant en points.
     * Retourne : { sharesBought, payoutIfWin, decimalOdds, avgPrice, priceImpact, newProb }
     */
    simulateBuy(market, optId, amountPoints) {
        const amount = Math.floor(Number(amountPoints));
        if (isNaN(amount) || amount <= 0) {
            return {
                sharesBought: 0,
                payoutIfWin: 0,
                decimalOdds: 1.0,
                avgPrice: 0,
                priceImpact: 0,
                newProb: 0
            };
        }

        const currentProbs = this.getProbabilities(market);
        const currentProb = currentProbs[optId] || 50;

        // Modèle CPMM pour options binaires / multi
        const reserves = market.poolReserves ? { ...market.poolReserves } : null;
        let sharesBought = 0;
        let newProb = currentProb;

        if (reserves && market.options.length === 2) {
            const otherOpt = market.options.find(o => o.id !== optId);
            const y = reserves[optId] || 100;       // réserve de l'option choisie
            const n = reserves[otherOpt.id] || 100; // réserve de l'autre option

            // Shares = M + (y * M) / (n + M)
            const deltaY = (y * amount) / (n + amount);
            sharesBought = Math.floor(amount + deltaY);

            // Nouvelles réserves théoriques
            const newY = Math.max(1, y - deltaY);
            const newN = n + amount;
            newProb = Math.min(99, Math.max(1, Math.round((newN / (newY + newN)) * 100)));
        } else {
            // Approximation AMM Multi-choix
            const pFraction = currentProb / 100;
            const mult = 1 / pFraction;
            sharesBought = Math.floor(amount * mult);
            newProb = Math.min(99, currentProb + Math.min(15, Math.round(amount / 50)));
        }

        const payoutIfWin = sharesBought; // 1 share = 1 point if win
        const decimalOdds = amount > 0 ? (payoutIfWin / amount).toFixed(2) : "1.00";
        const avgPrice = amount > 0 ? (amount / sharesBought).toFixed(2) : "0.00";
        const priceImpact = Math.max(0, newProb - currentProb);

        return {
            sharesBought,
            payoutIfWin,
            decimalOdds: parseFloat(decimalOdds),
            avgPrice: parseFloat(avgPrice),
            priceImpact,
            newProb
        };
    },

    /**
     * Simule la revente (Cashout) de N shares d'une position.
     * Retourne les points récupérés et le prix unitaire moyen de revente.
     */
    simulateSell(market, optId, sharesToSell) {
        const shares = Math.floor(Number(sharesToSell));
        if (isNaN(shares) || shares <= 0) return { refundPoints: 0, sellPrice: 0 };

        const currentProbs = this.getProbabilities(market);
        const currentProb = currentProbs[optId] || 50;

        const reserves = market.poolReserves ? { ...market.poolReserves } : null;
        let refundPoints = 0;

        if (reserves && market.options.length === 2) {
            const otherOpt = market.options.find(o => o.id !== optId);
            const y = reserves[optId] || 100;
            const n = reserves[otherOpt.id] || 100;

            // Points reçus = (n * S) / (y + S)
            const pts = (n * shares) / (y + shares);
            refundPoints = Math.max(1, Math.floor(pts));
        } else {
            // Approximation au prix spot actuel
            const pFraction = currentProb / 100;
            refundPoints = Math.max(1, Math.floor(shares * pFraction));
        }

        const sellPrice = shares > 0 ? (refundPoints / shares).toFixed(2) : "0.00";
        return {
            refundPoints,
            sellPrice: parseFloat(sellPrice)
        };
    }
};
