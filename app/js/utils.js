/**
 * PolyBoquette - Fonctions Utilitaires & Catalogue de Badges
 */

export function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatPoints(num) {
    if (num === null || num === undefined) return "0";
    return new Intl.NumberFormat('fr-FR').format(Math.floor(num));
}

export function formatOdds(odds) {
    if (isNaN(odds) || odds <= 0) return "1.00";
    return Number(odds).toFixed(2);
}

export function formatDate(isoString) {
    if (!isoString) return "-";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return isoString;
    }
}

export function formatRelativeTime(isoString) {
    if (!isoString) return "";
    try {
        const d = new Date(isoString);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return "À l'instant";
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 30) return `Il y a ${diffDays}j`;
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    } catch {
        return "";
    }
}

export function getRemainingTime(pauseAtIso) {
    if (!pauseAtIso) return null;
    let target = pauseAtIso;
    if (target.endsWith('Z')) target = target.slice(0, -1) + '+00:00';
    const targetDate = new Date(target).getTime();
    const now = Date.now();
    const diff = targetDate - now;

    if (diff <= 0) {
        return { isExpired: true, label: "Clôturé" };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let label = "";
    if (days > 0) label = `${days}j ${hours}h restant${days > 1 ? 's' : ''}`;
    else if (hours > 0) label = `${hours}h ${minutes}m restant${hours > 1 ? 's' : ''}`;
    else if (minutes > 0) label = `${minutes}m ${seconds}s restant${minutes > 1 ? 's' : ''}`;
    else label = `${seconds}s restantes`;

    return { isExpired: false, label, days, hours, minutes, seconds };
}

export const PALETTE = ['#22c55e', '#ef4444', '#3b82f6', '#d946ef', '#f97316', '#eab308', '#06b6d4'];

/**
 * Catalogue enrichi des 18 Badges (Facile, Moyen, Difficile, Secrets)
 */
export const BADGES_CATALOG = [
    // ── FACILE ──
    {
        id: 'first_bet',
        difficulty: 'Facile',
        tier: 'easy',
        isSecret: false,
        icon: 'fa-shoe-prints',
        color: '#3b82f6',
        name: 'Premier Pas',
        desc: 'A placé son tout premier pari sur PolyBoquette'
    },
    {
        id: 'first_comment',
        difficulty: 'Facile',
        tier: 'easy',
        isSecret: false,
        icon: 'fa-comment-dots',
        color: '#06b6d4',
        name: 'Orateur',
        desc: 'A posté son premier commentaire d\'analyse sous un marché'
    },
    {
        id: 'daily_claim',
        difficulty: 'Facile',
        tier: 'easy',
        isSecret: false,
        icon: 'fa-calendar-check',
        color: '#eab308',
        name: 'Ponctuel',
        desc: 'A réclamé son bonus quotidien'
    },
    {
        id: 'first_win',
        difficulty: 'Facile',
        tier: 'easy',
        isSecret: false,
        icon: 'fa-champagne-glasses',
        color: '#22c55e',
        name: 'Première Victoire',
        desc: 'A remporté son premier gain sur un marché résolu'
    },

    // ── MOYEN ──
    {
        id: 'banker_500',
        difficulty: 'Moyen',
        tier: 'medium',
        isSecret: false,
        icon: 'fa-vault',
        color: '#8b5cf6',
        name: 'Épargnant',
        desc: 'A atteint un solde supérieur à 500 points'
    },
    {
        id: 'cashout_master',
        difficulty: 'Moyen',
        tier: 'medium',
        isSecret: false,
        icon: 'fa-hand-holding-dollar',
        color: '#22c55e',
        name: 'Roi du Cashout',
        desc: 'A sécurisé un gain avec une revente anticipée'
    },
    {
        id: 'creator',
        difficulty: 'Moyen',
        tier: 'medium',
        isSecret: false,
        icon: 'fa-lightbulb',
        color: '#f97316',
        name: 'Idéateur',
        desc: 'A vu une de ses propositions de marché validée par l\'admin'
    },
    {
        id: 'explorer',
        difficulty: 'Moyen',
        tier: 'medium',
        isSecret: false,
        icon: 'fa-compass',
        color: '#3b82f6',
        name: 'Touche-à-tout',
        desc: 'A placé des paris sur au moins 5 marchés différents'
    },
    {
        id: 'veteran_20',
        difficulty: 'Moyen',
        tier: 'medium',
        isSecret: false,
        icon: 'fa-award',
        color: '#a855f7',
        name: 'Pilier de Boquette',
        desc: 'A cumulé au moins 20 paris placés au total'
    },

    // ── DIFFICILE / LÉGENDAIRE ──
    {
        id: 'oracle',
        difficulty: 'Difficile',
        tier: 'hard',
        isSecret: false,
        icon: 'fa-eye',
        color: '#d946ef',
        name: "L'Oracle",
        desc: 'A remporté au moins 6 paris résolus'
    },
    {
        id: 'high_roller',
        difficulty: 'Difficile',
        tier: 'hard',
        isSecret: false,
        icon: 'fa-money-bill-wave',
        color: '#eab308',
        name: 'Gros Joueur',
        desc: 'A misé plus de 500 points en une seule fois'
    },
    {
        id: 'contrarian',
        difficulty: 'Légendaire',
        tier: 'legendary',
        isSecret: false,
        icon: 'fa-bolt-lightning',
        color: '#ef4444',
        name: 'Contrarien',
        desc: 'A remporté un pari avec une cote supérieure ou égale à x4.00'
    },
    {
        id: 'magnat_2000',
        difficulty: 'Légendaire',
        tier: 'legendary',
        isSecret: false,
        icon: 'fa-crown',
        color: '#eab308',
        name: 'Magnat de Promo',
        desc: 'A atteint un trésor de 2 000 points'
    },

    // ── BADGES SECRETS ──
    {
        id: 'secret_night_owl',
        difficulty: 'Secret',
        tier: 'secret',
        isSecret: true,
        icon: 'fa-moon',
        color: '#6366f1',
        name: 'Oiseau de Nuit',
        secretHint: 'Un exploit nocturne réservé aux insomniaques...',
        desc: 'A placé un pari entre 2h et 5h du matin'
    },
    {
        id: 'secret_all_in',
        difficulty: 'Secret',
        tier: 'secret',
        isSecret: true,
        icon: 'fa-dice-d20',
        color: '#ec4899',
        name: 'Tapis Total',
        secretHint: 'Ne rien garder en réserve et tout risquer...',
        desc: 'A misé l\'intégralité de ses points restants sur un seul pari'
    },
    {
        id: 'secret_sniper',
        difficulty: 'Secret',
        tier: 'secret',
        isSecret: true,
        icon: 'fa-crosshairs',
        color: '#10b981',
        name: 'Le Sniper',
        secretHint: 'Une précision chirurgicale sans la moindre erreur...',
        desc: 'A enchaîné 3 victoires consécutives sans défaite'
    },
    {
        id: 'secret_pinned',
        difficulty: 'Secret',
        tier: 'secret',
        isSecret: true,
        icon: 'fa-thumbtack',
        color: '#f59e0b',
        name: 'Garde Rapprochée',
        secretHint: 'Garder ses cibles favorites bien en vue...',
        desc: 'A épinglé au moins 3 marchés simultanément'
    }
];

export function computeUserBadges(user, markets = []) {
    const unlocked = new Set();
    if (!user) return [];

    const txs = user.transactions || [];
    const points = user.points || 0;

    // 1. First Bet
    const betTxs = txs.filter(t => t.desc && t.desc.startsWith("Mise dans"));
    if (betTxs.length >= 1) unlocked.add('first_bet');
    if (betTxs.length >= 20) unlocked.add('veteran_20');

    // 2. High roller
    if (betTxs.some(t => Math.abs(t.amount) >= 500)) unlocked.add('high_roller');

    // 3. Comments
    const hasComment = markets.some(m => (m.comments || []).some(c => c.userId === user.id));
    if (hasComment) unlocked.add('first_comment');

    // 4. Daily claim
    if (user.lastClaim) unlocked.add('daily_claim');

    // 5. Wins & Cashouts
    const winTxs = txs.filter(t => t.desc && t.desc.startsWith("Gain '"));
    if (winTxs.length >= 1) unlocked.add('first_win');
    if (winTxs.length >= 6) unlocked.add('oracle');

    const cashoutTxs = txs.filter(t => t.desc && (t.desc.includes("Revente") || t.desc.includes("Cashout")));
    if (cashoutTxs.length >= 1) unlocked.add('cashout_master');

    // 6. Solde
    if (points >= 500) unlocked.add('banker_500');
    if (points >= 2000) unlocked.add('magnat_2000');

    // 7. Creator
    if (markets.some(m => m.proposedBy === user.id)) unlocked.add('creator');

    // 8. Explorer (5+ marchés différents)
    const distinctMarkets = new Set(betTxs.map(t => t.desc));
    if (distinctMarkets.size >= 5) unlocked.add('explorer');

    // 9. Contrarian
    if (winTxs.some(t => t.amount >= 250)) unlocked.add('contrarian');

    // 10. Secrets
    // Night owl (2h à 5h)
    const hasNightBet = txs.some(t => {
        try {
            const h = new Date(t.time).getHours();
            return h >= 2 && h < 5;
        } catch { return false; }
    });
    if (hasNightBet) unlocked.add('secret_night_owl');

    // Pinned 3+
    if ((user.pinnedMarkets || []).length >= 3) unlocked.add('secret_pinned');

    // Sniper
    if (winTxs.length >= 3) unlocked.add('secret_sniper');

    // All in
    if (betTxs.some(t => Math.abs(t.amount) >= 100 && Math.abs(t.amount) >= (points - 10))) {
        unlocked.add('secret_all_in');
    }

    return BADGES_CATALOG.map(b => {
        const isUnlocked = unlocked.has(b.id);
        return {
            ...b,
            isUnlocked,
            displayName: (b.isSecret && !isUnlocked) ? '??? Défi Mystère' : b.name,
            displayDesc: (b.isSecret && !isUnlocked) ? b.secretHint : b.desc
        };
    });
}
