/**
 * PolyBoquette - Suite d'Administration Complète
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';
import { esc, formatPoints, formatDate } from '../utils.js';

let adminUsersList = [];

export function renderAdmin() {
    const user = state.currentUser;
    if (!user || user.role !== 'admin') {
        return `
            <div class="empty-state">
                <h2>Accès Refusé</h2>
                <p>Cette section est réservée aux administrateurs.</p>
                <button class="btn-primary" onclick="window.location.hash = '#/'">Accueil</button>
            </div>
        `;
    }

    const markets = state.markets || [];
    const proposals = state.proposals || [];
    const pendingUsers = state.pendingUsers || [];
    const nameChanges = state.nameChangeRequests || [];
    const pwResets = state.passwordResetRequests || [];

    const totalVolume = markets.reduce((sum, m) => sum + (m.volume || 0), 0);
    const activeMarkets = markets.filter(m => m.status === 'open').length;
    const pendingValidationsCount = pendingUsers.length + proposals.filter(p => p.status === 'pending').length + nameChanges.length + pwResets.length;

    return `
        <div class="admin-container">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                <div>
                    <h1 class="page-title" style="margin:0;"><i class="fa-solid fa-shield-halved"></i> Espace Administration</h1>
                    <p style="color:var(--text-secondary); font-size:0.85rem; margin-top:0.25rem;">Gestion globale des membres, marchés, modération et sécurité.</p>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-primary" id="adminNewMarketBtn">
                        <i class="fa-solid fa-plus"></i> Nouveau Marché
                    </button>
                    <button class="btn-outline" id="exportCsvBtn">
                        <i class="fa-solid fa-file-csv"></i> Export CSV
                    </button>
                </div>
            </div>

            <!-- Onglets d'Administration -->
            <div class="admin-tabs">
                <button class="admin-tab-btn ${state.adminTab === 'members' ? 'active' : ''}" data-tab="members">
                    <i class="fa-solid fa-users-gear"></i> Membres & Modération
                </button>
                <button class="admin-tab-btn ${state.adminTab === 'validations' ? 'active' : ''}" data-tab="validations">
                    <i class="fa-solid fa-user-clock"></i> Validations en Attente ${pendingValidationsCount > 0 ? `<span class="tab-badge">${pendingValidationsCount}</span>` : ''}
                </button>
                <button class="admin-tab-btn ${state.adminTab === 'markets' ? 'active' : ''}" data-tab="markets">
                    <i class="fa-solid fa-fire"></i> Marchés & Clôtures (${activeMarkets})
                </button>
                <button class="admin-tab-btn ${state.adminTab === 'categories' ? 'active' : ''}" data-tab="categories">
                    <i class="fa-solid fa-tags"></i> Catégories
                </button>
                <button class="admin-tab-btn ${state.adminTab === 'logs' ? 'active' : ''}" data-tab="logs">
                    <i class="fa-solid fa-list-check"></i> Audit & Sécurité
                </button>
            </div>

            <!-- Contenu Onglet Actif -->
            <div class="admin-tab-content" style="margin-top:1.5rem;">
                ${state.adminTab === 'members' ? renderAdminMembers() : ''}
                ${state.adminTab === 'validations' ? renderAdminValidations(pendingUsers, proposals, nameChanges, pwResets) : ''}
                ${state.adminTab === 'markets' ? renderAdminMarkets(markets) : ''}
                ${state.adminTab === 'categories' ? renderAdminCategories() : ''}
                ${state.adminTab === 'logs' ? renderAdminLogs() : ''}
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ONGLET 1 : MEMBRES & MODÉRATION
// ─────────────────────────────────────────────────────────────────────────────
function renderAdminMembers() {
    const users = adminUsersList || [];
    const search = (state.adminSearchUser || '').toLowerCase().trim();
    const filterStatus = state.adminFilterStatus || 'all';

    const filtered = users.filter(u => {
        if (filterStatus !== 'all' && u.status !== filterStatus) return false;
        if (search) {
            const nameMatch = (u.name || '').toLowerCase().includes(search);
            const numsMatch = (u.nums || '').toLowerCase().includes(search);
            const emailMatch = (u.email || '').toLowerCase().includes(search);
            if (!nameMatch && !numsMatch && !emailMatch) return false;
        }
        return true;
    });

    return `
        <div class="admin-section-box">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
                <div style="display:flex; gap:0.5rem; flex:1; max-width:400px;">
                    <input type="text" id="adminUserSearchInput" value="${esc(state.adminSearchUser)}" placeholder="Rechercher par Num's, nom, e-mail..." class="input-full" style="padding:0.55rem 0.85rem;">
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="filter-pill ${filterStatus === 'all' ? 'active' : ''}" data-user-filter="all">Tous (${users.length})</button>
                    <button class="filter-pill ${filterStatus === 'active' ? 'active' : ''}" data-user-filter="active">Actifs</button>
                    <button class="filter-pill ${filterStatus === 'frozen' ? 'active' : ''}" data-user-filter="frozen">Gelés/Suspendus</button>
                </div>
            </div>

            <div class="table-responsive">
                <table class="custom-table">
                    <thead>
                        <tr>
                            <th>Membre (Prénom Nom)</th>
                            <th>Num's</th>
                            <th>Solde</th>
                            <th>Statut</th>
                            <th>Rôle</th>
                            <th style="text-align:right;">Actions Modérateur</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? `
                            <tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:2rem;">Aucun membre trouvé.</td></tr>
                        ` : filtered.map(u => {
                            const isFrozen = u.status === 'frozen';
                            const isPending = u.status === 'pending';
                            return `
                                <tr>
                                    <td>
                                        <b>${esc(u.name)}</b>
                                        <div style="font-size:0.75rem; color:var(--text-secondary);">${esc(u.email || 'Pas d\'e-mail')}</div>
                                    </td>
                                    <td><span class="badge-pill">${esc(u.nums || u.username)}</span></td>
                                    <td><b style="color:var(--accent-color);">${formatPoints(u.points)}</b> pts</td>
                                    <td>
                                        <span class="status-badge status-${u.status}">
                                            ${u.status === 'active' ? 'Actif' : (u.status === 'frozen' ? 'Suspendu' : u.status)}
                                        </span>
                                    </td>
                                    <td>
                                        <span style="font-weight:700; font-size:0.8rem; color:${u.role === 'admin' ? 'var(--accent-color)' : 'var(--text-secondary)'};">
                                            ${u.role === 'admin' ? (u.superAdmin ? 'SUPER-ADMIN' : 'ADMIN') : 'JOUEUR'}
                                        </span>
                                    </td>
                                    <td style="text-align:right;">
                                        <div style="display:inline-flex; gap:0.35rem;">
                                            <button class="btn-outline grant-points-btn" data-user-id="${u.id}" data-user-name="${esc(u.name)}" title="Créditer ou débiter des points" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-coins"></i> ± pts
                                            </button>
                                            <button class="btn-outline view-history-btn" data-user-id="${u.id}" title="Voir l'historique complet et les paris" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-clock-rotate-left"></i>
                                            </button>
                                            <button class="btn-outline toggle-status-btn" data-user-id="${u.id}" title="${isFrozen ? 'Débloquer' : 'Suspendre/Geler'}" style="padding:0.3rem 0.6rem; font-size:0.8rem; color:${isFrozen ? '#22c55e' : '#f59e0b'};">
                                                <i class="fa-solid ${isFrozen ? 'fa-play' : 'fa-pause'}"></i>
                                            </button>
                                            <button class="btn-outline kick-user-btn" data-user-id="${u.id}" title="Déconnecter de tous les appareils" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-right-from-bracket"></i>
                                            </button>
                                            ${state.currentUser.superAdmin && u.id !== state.currentUser.id ? `
                                                <button class="btn-outline toggle-role-btn" data-user-id="${u.id}" title="Changer rôle Admin/Joueur" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                    <i class="fa-solid fa-user-shield"></i>
                                                </button>
                                                <button class="btn-danger delete-user-btn" data-user-id="${u.id}" data-user-name="${esc(u.name)}" title="Supprimer définitivement" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                    <i class="fa-solid fa-trash"></i>
                                                </button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ONGLET 2 : VALIDATIONS EN ATTENTE
// ─────────────────────────────────────────────────────────────────────────────
function renderAdminValidations(pendingUsers, proposals, nameChanges, pwResets) {
    const pendingProps = proposals.filter(p => p.status === 'pending');

    return `
        <div style="display:flex; flex-direction:column; gap:1.75rem;">
            <!-- Inscriptions -->
            <div class="admin-section-box">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="font-size:1.1rem; font-weight:700;"><i class="fa-solid fa-user-plus"></i> Inscriptions Gadz'arts (${pendingUsers.length})</h3>
                    ${pendingUsers.length > 0 ? `
                        <button class="btn-primary" id="batchApproveUsersBtn" style="font-size:0.85rem; padding:0.4rem 0.85rem;">
                            <i class="fa-solid fa-check-double"></i> Tout approuver (${pendingUsers.length})
                        </button>
                    ` : ''}
                </div>

                ${pendingUsers.length === 0 ? `<p style="color:var(--text-secondary); font-size:0.85rem;">Aucune inscription en attente.</p>` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr><th>Nom</th><th>Num's</th><th>E-mail</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                ${pendingUsers.map(u => `
                                    <tr>
                                        <td><b>${esc(u.name)}</b></td>
                                        <td><span class="badge-pill">${esc(u.nums || u.username)}</span></td>
                                        <td>${esc(u.email || '-')}</td>
                                        <td>
                                            <div style="display:flex; gap:0.5rem;">
                                                <button class="btn-primary approve-user-btn" data-user-id="${u.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;"><i class="fa-solid fa-check"></i> Valider</button>
                                                <button class="btn-danger reject-user-btn" data-user-id="${u.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;"><i class="fa-solid fa-xmark"></i> Refuser</button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- Mots de passe oubliés -->
            <div class="admin-section-box">
                <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;"><i class="fa-solid fa-key"></i> Demandes de Réinitialisation de Mot de Passe (${pwResets.length})</h3>
                ${pwResets.length === 0 ? `<p style="color:var(--text-secondary); font-size:0.85rem;">Aucune demande de réinitialisation.</p>` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr><th>Date</th><th>Nom</th><th>Num's</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                ${pwResets.map(r => `
                                    <tr>
                                        <td>${formatDate(r.time)}</td>
                                        <td><b>${esc(r.userName)}</b></td>
                                        <td><span class="badge-pill">${esc(r.username)}</span></td>
                                        <td>
                                            <button class="btn-primary reset-pass-action-btn" data-req-id="${r.id}" data-user-name="${esc(r.userName)}" style="padding:0.3rem 0.75rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-unlock"></i> Définir nouveau mot de passe
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- Propositions -->
            <div class="admin-section-box">
                <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;"><i class="fa-solid fa-lightbulb"></i> Idées de Marchés Proposées (${pendingProps.length})</h3>
                ${pendingProps.length === 0 ? `<p style="color:var(--text-secondary); font-size:0.85rem;">Aucune proposition en attente.</p>` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr><th>Titre</th><th>Auteur</th><th>Choix</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                ${pendingProps.map(p => `
                                    <tr>
                                        <td><b>${esc(p.title)}</b></td>
                                        <td>${esc(p.authorName)}</td>
                                        <td>${(p.choices || []).join(' • ')}</td>
                                        <td>
                                            <div style="display:flex; gap:0.5rem;">
                                                <button class="btn-primary approve-prop-btn" data-prop-id="${p.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;"><i class="fa-solid fa-check"></i> Créer marché</button>
                                                <button class="btn-danger reject-prop-btn" data-prop-id="${p.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;"><i class="fa-solid fa-ban"></i> Rejeter</button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- Changements de pseudo -->
            ${nameChanges.length > 0 ? `
                <div class="admin-section-box">
                    <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;"><i class="fa-solid fa-signature"></i> Demandes de Changement de Nom (${nameChanges.length})</h3>
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead><tr><th>Ancien Nom</th><th>Nouveau Nom souhaité</th><th>Action</th></tr></thead>
                            <tbody>
                                ${nameChanges.map(nc => `
                                    <tr>
                                        <td>${esc(nc.oldName)}</td>
                                        <td><b>${esc(nc.newName)}</b></td>
                                        <td>
                                            <div style="display:flex; gap:0.5rem;">
                                                <button class="btn-primary approve-nc-btn" data-req-id="${nc.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">Approuver</button>
                                                <button class="btn-danger reject-nc-btn" data-req-id="${nc.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">Rejeter</button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ONGLET 3 : MARCHÉS & CLÔTURES
// ─────────────────────────────────────────────────────────────────────────────
function renderAdminMarkets(markets) {
    return `
        <div class="admin-section-box">
            <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;"><i class="fa-solid fa-fire"></i> Gestion des Marchés</h3>
            <div class="table-responsive">
                <table class="custom-table">
                    <thead>
                        <tr><th>Titre</th><th>Statut</th><th>Volume</th><th style="text-align:right;">Actions</th></tr>
                    </thead>
                    <tbody>
                        ${markets.map(m => `
                            <tr>
                                <td><b>${esc(m.title)}</b></td>
                                <td><span class="status-badge status-${m.status}">${m.status === 'open' ? 'En cours' : (m.status === 'paused' ? 'En Pause' : 'Clôturé')}</span></td>
                                <td>${formatPoints(m.volume)} pts</td>
                                <td style="text-align:right;">
                                    <div style="display:inline-flex; gap:0.35rem;">
                                        <button class="btn-outline rename-market-btn" data-market-id="${m.id}" data-market-title="${esc(m.title)}" title="Renommer le marché" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                            <i class="fa-solid fa-pen"></i>
                                        </button>
                                        ${m.status === 'open' ? `
                                            <button class="btn-primary resolve-market-btn" data-market-id="${m.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-gavel"></i> Clôturer
                                            </button>
                                            <button class="btn-outline toggle-pause-btn" data-market-id="${m.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-pause"></i>
                                            </button>
                                        ` : `
                                            <button class="btn-outline toggle-pause-btn" data-market-id="${m.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-play"></i> Réactiver
                                            </button>
                                            <button class="btn-danger delete-market-btn" data-market-id="${m.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-trash"></i>
                                            </button>
                                        `}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ONGLET 4 : CATÉGORIES
// ─────────────────────────────────────────────────────────────────────────────
function renderAdminCategories() {
    const categories = state.categories || [];
    return `
        <div class="admin-section-box">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h3 style="font-size:1.1rem; font-weight:700;"><i class="fa-solid fa-tags"></i> Catégories</h3>
                <button class="btn-primary" id="adminCreateCatBtn" style="padding:0.4rem 0.85rem; font-size:0.85rem;">
                    <i class="fa-solid fa-plus"></i> Nouvelle Catégorie
                </button>
            </div>
            <div class="categories-admin-list">
                ${categories.map(c => `
                    <div class="cat-admin-row">
                        <span><b>${esc(c.name)}</b></span>
                        <button class="btn-danger delete-cat-btn" data-cat-id="${c.id}" style="padding:0.25rem 0.5rem; font-size:0.75rem;">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ONGLET 5 : AUDIT & LOGS
// ─────────────────────────────────────────────────────────────────────────────
function renderAdminLogs() {
    return `
        <div class="admin-section-box">
            <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;"><i class="fa-solid fa-list-check"></i> Journal d'Audit & Sécurité</h3>
            <div id="adminAuditLogContainer">
                <p style="color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Chargement des logs...</p>
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTACH EVENTS & MODALS
// ─────────────────────────────────────────────────────────────────────────────
export function attachAdminEvents() {
    // 1. Recharger la liste des utilisateurs admin
    api.get('/api/admin/users').then(users => {
        adminUsersList = users || [];
        const container = document.getElementById('app-container');
        if (container && state.currentRoute === 'admin' && state.adminTab === 'members') {
            container.innerHTML = renderAdmin();
            bindAdminActionListeners();
        }
    }).catch(() => {});

    bindAdminActionListeners();
}

function bindAdminActionListeners() {
    // Navigation Tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.onclick = () => {
            state.adminTab = btn.dataset.tab;
            router.renderCurrentView();
            if (state.adminTab === 'logs') loadAuditLogs();
        };
    });

    // Recherche Membres
    const searchIn = document.getElementById('adminUserSearchInput');
    if (searchIn) {
        searchIn.oninput = (e) => {
            state.adminSearchUser = e.target.value;
            router.renderCurrentView();
            const newIn = document.getElementById('adminUserSearchInput');
            if (newIn) { newIn.focus(); newIn.setSelectionRange(newIn.value.length, newIn.value.length); }
        };
    }

    // Filtre Statut Membres
    document.querySelectorAll('[data-user-filter]').forEach(btn => {
        btn.onclick = () => {
            state.adminFilterStatus = btn.dataset.userFilter;
            router.renderCurrentView();
        };
    });

    // Export CSV
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) exportBtn.onclick = () => window.open('/api/admin/export/csv', '_blank');

    // Créditer / Débiter Points Modal
    document.querySelectorAll('.grant-points-btn').forEach(btn => {
        btn.onclick = () => {
            const uid = btn.dataset.userId;
            const uname = btn.dataset.userName;
            modal.show({
                title: `Ajuster les points pour ${uname}`,
                content: `
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Montant (ex: +200 ou -50)</label>
                            <input type="number" id="grantAmountInput" class="input-full" placeholder="+100 ou -50">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Motif / Justification</label>
                            <input type="text" id="grantReasonInput" class="input-full" placeholder="Ex: Récompense défi ou ajustement">
                        </div>
                    </div>
                `,
                confirmText: "Appliquer l'ajustement",
                onConfirm: async () => {
                    const amount = parseInt(document.getElementById('grantAmountInput').value);
                    const reason = document.getElementById('grantReasonInput').value;
                    if (isNaN(amount) || amount === 0) { toast.error("Montant invalide"); throw new Error(); }
                    await api.post(`/api/admin/users/${uid}/grant`, { amount, reason });
                    toast.success("Points mis à jour");
                    await reloadAdminUsers();
                }
            });
        };
    });

    // Voir Fiche Historique Joueur Modal
    document.querySelectorAll('.view-history-btn').forEach(btn => {
        btn.onclick = async () => {
            const uid = btn.dataset.userId;
            try {
                const data = await api.get(`/api/admin/users/${uid}/history`);
                const u = data.user;
                const txs = data.transactions || [];
                const bets = data.bets || [];

                modal.show({
                    title: `Fiche & Historique de ${esc(u.name)} (@${esc(u.nums || u.username)})`,
                    content: `
                        <div style="font-size:0.9rem; margin-bottom:1rem;">
                            <b>Solde :</b> ${formatPoints(u.points)} pts • <b>E-mail :</b> ${esc(u.email || 'Aucun')} • <b>Statut :</b> ${u.status}
                        </div>
                        <h4 style="font-size:0.95rem; margin-bottom:0.5rem;">Paris Placés (${bets.length})</h4>
                        <div style="max-height:180px; overflow-y:auto; background:var(--bg-secondary); border-radius:8px; padding:0.5rem; margin-bottom:1rem; font-size:0.85rem;">
                            ${bets.length === 0 ? '<p style="color:var(--text-secondary);">Aucun pari.</p>' : bets.map(b => `
                                <div style="padding:0.35rem 0; border-bottom:1px solid var(--border-color);">
                                    <b>${esc(b.marketTitle)}</b> : ${formatPoints(b.amount)} pts sur "${esc(b.optLabel)}" (${b.buyProb}%)
                                </div>
                            `).join('')}
                        </div>
                        <h4 style="font-size:0.95rem; margin-bottom:0.5rem;">Transactions (${txs.length})</h4>
                        <div style="max-height:180px; overflow-y:auto; background:var(--bg-secondary); border-radius:8px; padding:0.5rem; font-size:0.85rem;">
                            ${txs.length === 0 ? '<p style="color:var(--text-secondary);">Aucune transaction.</p>' : txs.map(t => `
                                <div style="padding:0.35rem 0; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between;">
                                    <span>${esc(t.desc)}</span>
                                    <b style="color:${t.amount > 0 ? 'var(--yes-color)' : (t.amount < 0 ? 'var(--no-color)' : 'inherit')};">${t.amount > 0 ? '+' : ''}${formatPoints(t.amount)} pts</b>
                                </div>
                            `).join('')}
                        </div>
                    `,
                    confirmText: "Fermer",
                    cancelText: ""
                });
            } catch (e) {
                toast.error("Impossible de charger la fiche");
            }
        };
    });

    // Toggle Status (Freeze / Unfreeze)
    document.querySelectorAll('.toggle-status-btn').forEach(btn => {
        btn.onclick = async () => {
            const uid = btn.dataset.userId;
            try {
                const res = await api.post(`/api/admin/users/${uid}/toggle-status`);
                toast.info(`Statut changé : ${res.status}`);
                await reloadAdminUsers();
            } catch (err) { toast.error(err.message); }
        };
    });

    // Kick User
    document.querySelectorAll('.kick-user-btn').forEach(btn => {
        btn.onclick = async () => {
            const uid = btn.dataset.userId;
            try {
                await api.post(`/api/admin/users/${uid}/kick`);
                toast.success("Utilisateur déconnecté de force");
            } catch (err) { toast.error(err.message); }
        };
    });

    // Toggle Role
    document.querySelectorAll('.toggle-role-btn').forEach(btn => {
        btn.onclick = async () => {
            const uid = btn.dataset.userId;
            try {
                const res = await api.post(`/api/admin/users/${uid}/toggle-role`);
                toast.success(`Nouveau rôle : ${res.role}`);
                await reloadAdminUsers();
            } catch (err) { toast.error(err.message); }
        };
    });

    // Delete User
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.onclick = () => {
            const uid = btn.dataset.userId;
            const uname = btn.dataset.userName;
            modal.show({
                title: `Supprimer définitivement ${uname} ?`,
                content: `<p style="color:#ef4444; font-size:0.9rem;">Attention : Cette action est irréversible. Toutes les données du membre seront effacées.</p>`,
                confirmText: "Supprimer le compte",
                isDanger: true,
                onConfirm: async () => {
                    await api.delete(`/api/admin/users/${uid}`);
                    toast.success("Compte supprimé");
                    await reloadAdminUsers();
                }
            });
        };
    });

    // Batch Approve
    const batchApproveBtn = document.getElementById('batchApproveUsersBtn');
    if (batchApproveBtn) {
        batchApproveBtn.onclick = async () => {
            try {
                await api.post('/api/admin/users/batch-approve');
                toast.success("Inscriptions validées");
                await router.fetchGlobalData();
                await reloadAdminUsers();
            } catch (err) { toast.error(err.message); }
        };
    }

    // Single Approve / Reject
    document.querySelectorAll('.approve-user-btn').forEach(btn => {
        btn.onclick = async () => {
            await api.post(`/api/admin/users/${btn.dataset.userId}/approve`);
            toast.success("Validé");
            await router.fetchGlobalData();
            await reloadAdminUsers();
        };
    });
    document.querySelectorAll('.reject-user-btn').forEach(btn => {
        btn.onclick = async () => {
            await api.post(`/api/admin/users/${btn.dataset.userId}/reject`);
            toast.info("Rejeté");
            await router.fetchGlobalData();
            await reloadAdminUsers();
        };
    });

    // Reset Password Admin
    document.querySelectorAll('.reset-pass-action-btn').forEach(btn => {
        btn.onclick = () => {
            const reqId = btn.dataset.reqId;
            const userName = btn.dataset.userName;
            modal.show({
                title: `Nouveau mot de passe pour ${userName}`,
                content: `<input type="text" id="adminNewPassInput" class="input-full" placeholder="Nouveau mot de passe">`,
                confirmText: "Valider",
                onConfirm: async () => {
                    const newPassword = document.getElementById('adminNewPassInput').value.trim();
                    if (!newPassword || newPassword.length < 6) { toast.error("6 caractères min."); throw new Error(); }
                    await api.post(`/api/admin/password-resets/${reqId}/approve`, { newPassword });
                    toast.success("Mot de passe mis à jour");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    });

    // Rename Market
    document.querySelectorAll('.rename-market-btn').forEach(btn => {
        btn.onclick = () => {
            const mId = btn.dataset.marketId;
            const title = btn.dataset.marketTitle;
            modal.show({
                title: "Renommer le marché",
                content: `<input type="text" id="renameMarketInput" class="input-full" value="${esc(title)}">`,
                confirmText: "Renommer",
                onConfirm: async () => {
                    const newTitle = document.getElementById('renameMarketInput').value.trim();
                    if (!newTitle) { toast.error("Titre requis"); throw new Error(); }
                    await api.post(`/api/admin/markets/${mId}/rename`, { title: newTitle });
                    toast.success("Marché renommé");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    });

    // Resolve Market
    document.querySelectorAll('.resolve-market-btn').forEach(btn => {
        btn.onclick = () => {
            const mId = btn.dataset.marketId;
            const market = state.markets.find(m => m.id === mId);
            if (!market) return;
            modal.show({
                title: `Clôturer : "${esc(market.title)}"`,
                content: `
                    <select id="resolveWinnerSelect" class="input-full">
                        <option value="cancelled">-- ANNULER (Remboursement intégral) --</option>
                        ${market.options.map(o => `<option value="${o.id}">Gagnant : ${esc(o.label)}</option>`).join('')}
                    </select>
                `,
                confirmText: "Clôturer le marché",
                onConfirm: async () => {
                    const winnerId = document.getElementById('resolveWinnerSelect').value;
                    await api.post(`/api/admin/markets/${mId}/resolve`, { winnerId });
                    toast.success("Marché clôturé et gains distribués !");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    });

    // Toggle Pause Market
    document.querySelectorAll('.toggle-pause-btn').forEach(btn => {
        btn.onclick = async () => {
            await api.post(`/api/admin/markets/${btn.dataset.marketId}/toggle-pause`);
            toast.info("Statut du marché modifié");
            await router.fetchGlobalData();
            router.renderCurrentView();
        };
    });

    // Delete Market
    document.querySelectorAll('.delete-market-btn').forEach(btn => {
        btn.onclick = () => {
            const mId = btn.dataset.marketId;
            modal.show({
                title: "Supprimer le marché ?",
                content: "<p style='color:#ef4444;'>Cette action est irréversible.</p>",
                confirmText: "Supprimer",
                isDanger: true,
                onConfirm: async () => {
                    await api.delete(`/api/admin/markets/${mId}`);
                    toast.success("Marché supprimé");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    });

    // Create Category Modal
    const createCatBtn = document.getElementById('adminCreateCatBtn');
    if (createCatBtn) {
        createCatBtn.onclick = () => {
            modal.show({
                title: "Nouvelle Catégorie",
                content: `<input type="text" id="newCatNameInput" class="input-full" placeholder="Ex: Soirées & Événements">`,
                confirmText: "Créer",
                onConfirm: async () => {
                    const name = document.getElementById('newCatNameInput').value.trim();
                    if (!name) { toast.error("Nom requis"); throw new Error(); }
                    await api.post('/api/admin/categories', { name });
                    toast.success("Catégorie créée");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    }

    // Delete Category
    document.querySelectorAll('.delete-cat-btn').forEach(btn => {
        btn.onclick = async () => {
            await api.delete(`/api/admin/categories/${btn.dataset.catId}`);
            toast.info("Catégorie supprimée");
            await router.fetchGlobalData();
            router.renderCurrentView();
        };
    });

    // Create Market Modal
    const newMarketBtn = document.getElementById('adminNewMarketBtn');
    if (newMarketBtn) {
        newMarketBtn.onclick = () => {
            const categories = state.categories || [];
            modal.show({
                title: "Créer un Nouveau Marché",
                content: `
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Titre du marché *</label>
                            <input type="text" id="createMarketTitle" class="input-full" placeholder="Question du pari...">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Choix (séparés par des virgules) *</label>
                            <input type="text" id="createMarketChoices" class="input-full" placeholder="Oui, Non (ou Choix A, Choix B)">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Catégorie</label>
                            <select id="createMarketCategory" class="input-full">
                                <option value="">-- Sans catégorie --</option>
                                ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Image (URL https://)</label>
                            <input type="text" id="createMarketImage" class="input-full" placeholder="https://...">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Date de gel automatique (optionnelle)</label>
                            <input type="datetime-local" id="createMarketPauseAt" class="input-full">
                        </div>
                    </div>
                `,
                confirmText: "Créer le Marché",
                onConfirm: async () => {
                    const title = document.getElementById('createMarketTitle').value.trim();
                    const choicesStr = document.getElementById('createMarketChoices').value.trim();
                    const categoryId = document.getElementById('createMarketCategory').value || null;
                    const image = document.getElementById('createMarketImage').value.trim();
                    const pauseAtVal = document.getElementById('createMarketPauseAt').value;
                    const choices = choicesStr.split(',').map(s => s.trim()).filter(Boolean);

                    if (!title || choices.length < 2) { toast.error("Titre et au moins 2 choix requis"); throw new Error(); }
                    const pauseAt = pauseAtVal ? new Date(pauseAtVal).toISOString() : null;

                    await api.post('/api/admin/markets', { title, choices, categoryId, image, pauseAt });
                    toast.success("Marché créé avec succès !");
                    await router.fetchGlobalData();
                    router.renderCurrentView();
                }
            });
        };
    }
}

async function reloadAdminUsers() {
    try {
        adminUsersList = await api.get('/api/admin/users');
        router.renderCurrentView();
    } catch (e) {}
}

async function loadAuditLogs() {
    const container = document.getElementById('adminAuditLogContainer');
    if (!container) return;
    try {
        const logs = await api.get('/api/admin/activity-log');
        if (!logs || logs.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);">Aucun log d\'activité.</p>';
            return;
        }
        container.innerHTML = `
            <div class="table-responsive">
                <table class="custom-table">
                    <thead><tr><th>Date</th><th>Type</th><th>Acteur</th><th>Détails</th></tr></thead>
                    <tbody>
                        ${logs.slice(0, 50).map(l => `
                            <tr>
                                <td style="font-size:0.8rem; color:var(--text-secondary);">${formatDate(l.time)}</td>
                                <td><span class="badge-pill">${esc(l.type)}</span></td>
                                <td>${esc(l.adminName || 'Système')}</td>
                                <td style="font-size:0.85rem;">${esc(l.details || l.marketTitle || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        container.innerHTML = '<p style="color:var(--no-color);">Impossible de charger les logs.</p>';
    }
}
