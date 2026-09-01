/**
 * PolyBoquette - Fonctions Utilitaires
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

/**
 * Calcule le temps restant avant freeze (pauseAt)
 * Retourne { isExpired, label, hours, minutes, seconds }
 */
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

/**
 * Palette de couleurs PolyBoquette
 */
export const PALETTE = ['#22c55e', '#ef4444', '#3b82f6', '#d946ef', '#f97316', '#eab308', '#06b6d4'];

/**
 * Définition et évaluation des Badges utilisateurs
 */
export const BADGES_CATALOG = [
    {
        id: 'first_bet',
        icon: 'fa-shoe-prints',
        color: '#3b82f6',
        name: 'Premier Pas',
        desc: 'A placé son tout premier pari sur PolyBoquette'
    },
    {
        id: 'big_better',
        icon: 'fa-money-bill-wave',
        color: '#eab308',
        name: 'Gros Joueur',
        desc: 'A misé plus de 500 points en une seule fois'
    },
    {
        id: 'cashout_master',
        icon: 'fa-hand-holding-dollar',
        color: '#22c55e',
        name: 'Roi du Cashout',
        desc: 'A sécurisé un gain avec le cashout anticipé'
    },
    {
        id: 'oracle',
        icon: 'fa-eye',
        color: '#d946ef',
        name: "L'Oracle",
        desc: 'A remporté au moins 3 paris résolus'
    },
    {
        id: 'contrarian',
        icon: 'fa-bolt-lightning',
        color: '#f97316',
        name: 'Contrarien',
        desc: 'A gagné sur une cote supérieure à x3.00'
    },
    {
        id: 'creator',
        icon: 'fa-lightbulb',
        color: '#06b6d4',
        name: 'Idéateur',
        desc: 'A vu une de ses propositions de marché validée'
    }
];

export function computeUserBadges(user, markets = []) {
    const unlocked = new Set();
    if (!user) return [];

    const txs = user.transactions || [];
    const betsCount = txs.filter(t => t.desc && t.desc.startsWith("Mise dans")).length;
    if (betsCount >= 1) unlocked.add('first_bet');

    const hasBigBet = txs.some(t => t.desc && t.desc.startsWith("Mise dans") && Math.abs(t.amount) >= 500);
    if (hasBigBet) unlocked.add('big_better');

    const hasCashout = txs.some(t => t.desc && t.desc.includes("Revente"));
    if (hasCashout) unlocked.add('cashout_master');

    const winTxs = txs.filter(t => t.desc && t.desc.startsWith("Gain '"));
    if (winTxs.length >= 3) unlocked.add('oracle');

    const hasContrarianWin = winTxs.some(t => t.amount >= 300);
    if (hasContrarianWin) unlocked.add('contrarian');

    if (markets.some(m => m.proposedBy === user.id)) unlocked.add('creator');

    return BADGES_CATALOG.map(b => ({
        ...b,
        isUnlocked: unlocked.has(b.id)
    }));
}
