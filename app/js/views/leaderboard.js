/**
 * PolyBoquette - Vue Classement (Leaderboard)
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { esc, formatPoints } from '../utils.js';

export function renderLeaderboard() {
    const list = state.leaderboard || [];
    const currentUser = state.currentUser;
    const myId = currentUser ? String(currentUser.id) : null;
    const myRankItem = list.find(u => String(u.id) === myId);

    const top1 = list[0] || null;
    const top2 = list[1] || null;
    const top3 = list[2] || null;

    return `
        <div class="leaderboard-container">
            <!-- Header -->
            <div class="leaderboard-header">
                <div class="leaderboard-title-group">
                    <h1 class="page-title"><i class="fa-solid fa-trophy" style="color:#eab308;"></i> Classement Général</h1>
                    <p class="leaderboard-subtitle">Le panthéon des parieurs Gadz'arts — Qui dominera la promo ?</p>
                </div>

                <!-- Recherche rapide en direct -->
                <div class="leaderboard-search-box">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="leaderboardSearchInput" placeholder="Rechercher par nom, num's ou bucque..." autocomplete="off" />
                    <button id="clearLeaderboardSearch" class="hidden" title="Effacer"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>

            ${currentUser && myRankItem ? `
                <!-- Bandeau Position Personnelle -->
                <div class="my-rank-banner">
                    <div class="my-rank-left">
                        <div class="my-rank-badge">#${myRankItem.rank}</div>
                        <div class="my-rank-info">
                            <div class="my-rank-name">
                                <b>${esc(currentUser.name || currentUser.firstName)}</b> 
                                <span class="my-rank-tag">C'est vous !</span>
                            </div>
                            <div class="my-rank-sub">
                                Num's : <b>${esc(currentUser.nums || currentUser.username)}</b> • ${myRankItem.betsCount || 0} pari${(myRankItem.betsCount || 0) > 1 ? 's' : ''} placé${(myRankItem.betsCount || 0) > 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="my-rank-right">
                        <div class="my-rank-points">
                            <i class="fa-solid fa-coins" style="color:#eab308;"></i> ${formatPoints(currentUser.points)} <span class="pts-unit">pts</span>
                        </div>
                        <button class="btn-outline btn-sm" id="jumpToMyRankBtn">
                            <i class="fa-solid fa-crosshairs"></i> Voir ma place
                        </button>
                    </div>
                </div>
            ` : ''}

            <!-- Podium Top 3 (si au moins 2 joueurs) -->
            ${list.length >= 2 ? `
                <div class="podium-section">
                    <!-- 2ème Place (Argent) -->
                    ${top2 ? `
                        <div class="podium-step podium-silver ${myId === String(top2.id) ? 'is-me' : ''}">
                            <div class="podium-avatar-wrapper">
                                <div class="podium-medal silver"><i class="fa-solid fa-medal"></i> 2</div>
                                <div class="podium-avatar">${getInitials(top2.name)}</div>
                            </div>
                            <div class="podium-name" title="${esc(top2.name)}">${esc(top2.name)}</div>
                            <div class="podium-nums">${esc(top2.nums || '')}</div>
                            <div class="podium-points"><i class="fa-solid fa-coins"></i> ${formatPoints(top2.points)} pts</div>
                            <div class="podium-pedestal pedestal-silver">2</div>
                        </div>
                    ` : ''}

                    <!-- 1ère Place (Or) -->
                    ${top1 ? `
                        <div class="podium-step podium-gold ${myId === String(top1.id) ? 'is-me' : ''}">
                            <div class="podium-crown"><i class="fa-solid fa-crown"></i></div>
                            <div class="podium-avatar-wrapper">
                                <div class="podium-medal gold"><i class="fa-solid fa-trophy"></i> 1</div>
                                <div class="podium-avatar">${getInitials(top1.name)}</div>
                            </div>
                            <div class="podium-name" title="${esc(top1.name)}">${esc(top1.name)}</div>
                            <div class="podium-nums">${esc(top1.nums || '')}</div>
                            <div class="podium-points"><i class="fa-solid fa-coins"></i> ${formatPoints(top1.points)} pts</div>
                            <div class="podium-pedestal pedestal-gold">1</div>
                        </div>
                    ` : ''}

                    <!-- 3ème Place (Bronze) -->
                    ${top3 ? `
                        <div class="podium-step podium-bronze ${myId === String(top3.id) ? 'is-me' : ''}">
                            <div class="podium-avatar-wrapper">
                                <div class="podium-medal bronze"><i class="fa-solid fa-award"></i> 3</div>
                                <div class="podium-avatar">${getInitials(top3.name)}</div>
                            </div>
                            <div class="podium-name" title="${esc(top3.name)}">${esc(top3.name)}</div>
                            <div class="podium-nums">${esc(top3.nums || '')}</div>
                            <div class="podium-points"><i class="fa-solid fa-coins"></i> ${formatPoints(top3.points)} pts</div>
                            <div class="podium-pedestal pedestal-bronze">3</div>
                        </div>
                    ` : ''}
                </div>
            ` : ''}

            <!-- Tableau Complet -->
            <div class="leaderboard-table-card">
                <div class="leaderboard-table-header">
                    <h3><i class="fa-solid fa-list-ol"></i> Classement Complet (${list.length} joueurs)</h3>
                    <div class="leaderboard-table-stats text-muted">Mis à jour en temps réel</div>
                </div>

                ${list.length === 0 ? `
                    <div class="empty-state">
                        <i class="fa-solid fa-users fa-3x" style="color:var(--text-secondary); margin-bottom:1rem;"></i>
                        <p>Aucun membre classé pour le moment.</p>
                    </div>
                ` : `
                    <div class="table-responsive">
                        <table class="leaderboard-table" id="leaderboardTable">
                            <thead>
                                <tr>
                                    <th style="width:70px; text-align:center;">Rang</th>
                                    <th>Gadz'arts</th>
                                    <th>Num's</th>
                                    <th style="text-align:center;">Paris</th>
                                    <th style="text-align:right;">Solde</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${list.map(u => renderLeaderboardRow(u, myId)).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
                <div id="noLeaderboardMatch" class="empty-state hidden" style="padding:2rem;">
                    <i class="fa-solid fa-user-slash fa-2x" style="color:var(--text-secondary); margin-bottom:0.5rem;"></i>
                    <p>Aucun joueur ne correspond à votre recherche.</p>
                </div>
            </div>
        </div>
    `;
}

function renderLeaderboardRow(u, myId) {
    const isMe = myId && String(u.id) === myId;
    const rank = u.rank || 0;
    let rankBadge = `<span class="rank-num">${rank}</span>`;

    if (rank === 1) {
        rankBadge = `<span class="rank-badge-icon rank-gold" title="1er"><i class="fa-solid fa-trophy"></i></span>`;
    } else if (rank === 2) {
        rankBadge = `<span class="rank-badge-icon rank-silver" title="2ème"><i class="fa-solid fa-medal"></i></span>`;
    } else if (rank === 3) {
        rankBadge = `<span class="rank-badge-icon rank-bronze" title="3ème"><i class="fa-solid fa-award"></i></span>`;
    } else if (rank <= 10) {
        rankBadge = `<span class="rank-badge-top10">${rank}</span>`;
    }

    const initials = getInitials(u.name);
    const searchTerms = `${u.name || ''} ${u.nums || ''} ${u.buque || ''}`.toLowerCase();

    return `
        <tr class="leaderboard-row ${isMe ? 'is-current-user' : ''}" 
            id="lb-user-${u.id}" 
            data-search="${esc(searchTerms)}">
            <td style="text-align:center;">
                ${rankBadge}
            </td>
            <td>
                <div class="lb-user-cell">
                    <div class="lb-avatar">${initials}</div>
                    <div class="lb-user-info">
                        <span class="lb-user-name">${esc(u.name)}</span>
                        ${isMe ? '<span class="lb-you-badge">VOUS</span>' : ''}
                        ${u.buque ? `<span class="lb-buque-tag">${esc(u.buque)}</span>` : ''}
                    </div>
                </div>
            </td>
            <td>
                <span class="lb-nums-pill">${esc(u.nums || '—')}</span>
            </td>
            <td style="text-align:center;">
                <span class="lb-bets-count">${u.betsCount || 0}</span>
            </td>
            <td style="text-align:right;">
                <span class="lb-points-val">
                    <i class="fa-solid fa-coins" style="color:#eab308;"></i> ${formatPoints(u.points)} <span class="pts-unit">pts</span>
                </span>
            </td>
        </tr>
    `;
}

function getInitials(name) {
    if (!name) return 'GZ';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function attachLeaderboardEvents() {
    const searchInput = document.getElementById('leaderboardSearchInput');
    const clearBtn = document.getElementById('clearLeaderboardSearch');
    const rows = document.querySelectorAll('.leaderboard-row');
    const noMatchEl = document.getElementById('noLeaderboardMatch');
    const tableEl = document.getElementById('leaderboardTable');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (clearBtn) {
                clearBtn.classList.toggle('hidden', query.length === 0);
            }

            let visibleCount = 0;
            rows.forEach(row => {
                const searchData = row.getAttribute('data-search') || '';
                const match = !query || searchData.includes(query);
                row.style.display = match ? '' : 'none';
                if (match) visibleCount++;
            });

            if (noMatchEl) {
                noMatchEl.classList.toggle('hidden', visibleCount > 0);
            }
            if (tableEl) {
                const tbody = tableEl.querySelector('tbody');
                if (tbody) tbody.style.display = visibleCount === 0 ? 'none' : '';
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
                searchInput.focus();
            });
        }
    }

    const jumpBtn = document.getElementById('jumpToMyRankBtn');
    if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
            const myRow = document.querySelector('.leaderboard-row.is-current-user');
            if (myRow) {
                myRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                myRow.classList.add('highlight-pulse');
                setTimeout(() => myRow.classList.remove('highlight-pulse'), 2500);
            }
        });
    }
}
