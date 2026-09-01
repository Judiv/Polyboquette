/**
 * PolyBoquette - Vue Administration
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';
import { esc, formatPoints, formatDate } from '../utils.js';

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

    // Métriques globales
    const totalVolume = markets.reduce((sum, m) => sum + (m.volume || 0), 0);
    const activeMarkets = markets.filter(m => m.status === 'open').length;

    return `
        <div class="admin-container">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                <h1 class="page-title" style="margin:0;"><i class="fa-solid fa-shield-halved"></i> Espace Administration</h1>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-primary" id="adminNewMarketBtn">
                        <i class="fa-solid fa-plus"></i> Nouveau Marché
                    </button>
                    <button class="btn-outline" id="exportCsvBtn">
                        <i class="fa-solid fa-file-csv"></i> Exporter CSV
                    </button>
                </div>
            </div>

            <!-- Onglets Admin -->
            <div class="admin-tabs">
                <button class="admin-tab-btn ${state.adminTab === 'metrics' ? 'active' : ''}" data-tab="metrics">
                    <i class="fa-solid fa-chart-line"></i> Vue d'ensemble & Métriques
                </button>
                <button class="admin-tab-btn ${state.adminTab === 'proposals_users' ? 'active' : ''}" data-tab="proposals_users">
                    <i class="fa-solid fa-user-clock"></i> Validations (${pendingUsers.length + proposals.filter(p => p.status === 'pending').length + nameChanges.length + pwResets.length})
                </button>
                <button class="admin-tab-btn ${state.adminTab === 'markets' ? 'active' : ''}" data-tab="markets">
                    <i class="fa-solid fa-fire"></i> Gestion Marchés & Clôtures (${activeMarkets})
                </button>
                <button class="admin-tab-btn ${state.adminTab === 'categories' ? 'active' : ''}" data-tab="categories">
                    <i class="fa-solid fa-tags"></i> Catégories
                </button>
                <button class="admin-tab-btn ${state.adminTab === 'logs' ? 'active' : ''}" data-tab="logs">
                    <i class="fa-solid fa-list-check"></i> Journal d'Audit
                </button>
            </div>

            <!-- Contenu des Onglets -->
            <div class="admin-tab-content">
                ${state.adminTab === 'metrics' ? renderAdminMetrics(totalVolume, activeMarkets, markets.length) : ''}
                ${state.adminTab === 'proposals_users' ? renderAdminValidations(pendingUsers, proposals, nameChanges, pwResets) : ''}
                ${state.adminTab === 'markets' ? renderAdminMarkets(markets) : ''}
                ${state.adminTab === 'categories' ? renderAdminCategories() : ''}
                ${state.adminTab === 'logs' ? renderAdminLogs() : ''}
            </div>
        </div>
    `;
}

function renderAdminMetrics(totalVolume, activeCount, totalCount) {
    return `
        <div class="pnl-metrics-grid">
            <div class="pnl-card">
                <div class="pnl-card-title">Volume Total Échangé</div>
                <div class="pnl-card-val" style="color:var(--accent-color);">${formatPoints(totalVolume)} pts</div>
                <div class="pnl-card-sub">Sur tous les marchés combinés</div>
            </div>
            <div class="pnl-card">
                <div class="pnl-card-title">Marchés Actifs</div>
                <div class="pnl-card-val" style="color:var(--yes-color);">${activeCount} / ${totalCount}</div>
                <div class="pnl-card-sub">En cours de cotation</div>
            </div>
            <div class="pnl-card">
                <div class="pnl-card-title">Inscriptions en Attente</div>
                <div class="pnl-card-val" style="color:#f97316;">${(state.pendingUsers || []).length}</div>
                <div class="pnl-card-sub">Gadz'arts à valider</div>
            </div>
        </div>
    `;
}

function renderAdminValidations(pendingUsers, proposals, nameChanges, pwResets) {
    const pendingProps = proposals.filter(p => p.status === 'pending');

    return `
        <div style="display:flex; flex-direction:column; gap:2rem;">
            <!-- 1. Inscriptions Utilisateurs -->
            <div class="admin-section-box">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="font-size:1.1rem; font-weight:700;">
                        <i class="fa-solid fa-user-plus"></i> Inscriptions Gadz'arts en attente (${pendingUsers.length})
                    </h3>
                    ${pendingUsers.length > 0 ? `
                        <div style="display:flex; gap:0.5rem;">
                            <button class="btn-primary" id="batchApproveUsersBtn" style="font-size:0.85rem; padding:0.4rem 0.8rem;">
                                <i class="fa-solid fa-check-double"></i> Tout approuver (${pendingUsers.length})
                            </button>
                        </div>
                    ` : ''}
                </div>

                ${pendingUsers.length === 0 ? `
                    <p style="color:var(--text-secondary); font-size:0.9rem;">Aucune inscription en attente.</p>
                ` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>Nom & Pseudo</th>
                                    <th>Bucque / Num's / Prom's</th>
                                    <th>E-mail</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pendingUsers.map(u => `
                                    <tr>
                                        <td><b>${esc(u.name)}</b> (@${esc(u.username)})</td>
                                        <td>${esc(u.buque || '-')} • ${esc(u.nums || '-')} • ${esc(u.proms || '-')}</td>
                                        <td>${esc(u.email || '-')}</td>
                                        <td>
                                            <div style="display:flex; gap:0.5rem;">
                                                <button class="btn-primary approve-user-btn" data-user-id="${u.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                    <i class="fa-solid fa-check"></i> Valider
                                                </button>
                                                <button class="btn-danger reject-user-btn" data-user-id="${u.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                    <i class="fa-solid fa-xmark"></i> Refuser
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- 2. Demandes de Réinitialisation de Mot de Passe -->
            <div class="admin-section-box">
                <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;">
                    <i class="fa-solid fa-key"></i> Demandes de Réinitialisation de Mot de Passe (${pwResets.length})
                </h3>

                ${pwResets.length === 0 ? `
                    <p style="color:var(--text-secondary); font-size:0.9rem;">Aucune demande de réinitialisation en cours.</p>
                ` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Utilisateur</th>
                                    <th>Identifiant</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pwResets.map(r => `
                                    <tr>
                                        <td>${formatDate(r.time)}</td>
                                        <td><b>${esc(r.userName)}</b></td>
                                        <td>@${esc(r.username)}</td>
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

            <!-- 3. Propositions de Marchés -->
            <div class="admin-section-box">
                <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;">
                    <i class="fa-solid fa-lightbulb"></i> Propositions de Marchés Soumises (${pendingProps.length})
                </h3>

                ${pendingProps.length === 0 ? `
                    <p style="color:var(--text-secondary); font-size:0.9rem;">Aucune proposition en attente.</p>
                ` : `
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>Titre</th>
                                    <th>Auteur</th>
                                    <th>Choix proposés</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pendingProps.map(p => `
                                    <tr>
                                        <td><b>${esc(p.title)}</b></td>
                                        <td>${esc(p.authorName)}</td>
                                        <td>${(p.choices || []).map(c => `<span class="choice-pill">${esc(c)}</span>`).join(' ')}</td>
                                        <td>
                                            <div style="display:flex; gap:0.5rem;">
                                                <button class="btn-primary approve-prop-btn" data-prop-id="${p.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                    <i class="fa-solid fa-check"></i> Créer marché
                                                </button>
                                                <button class="btn-danger reject-prop-btn" data-prop-id="${p.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                    <i class="fa-solid fa-ban"></i> Rejeter
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>
    `;
}

function renderAdminMarkets(markets) {
    return `
        <div class="admin-section-box">
            <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;">
                <i class="fa-solid fa-fire"></i> Liste & Clôture des Marchés
            </h3>

            <div class="table-responsive">
                <table class="custom-table">
                    <thead>
                        <tr>
                            <th>Titre</th>
                            <th>Statut</th>
                            <th>Volume</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${markets.map(m => `
                            <tr>
                                <td><b>${esc(m.title)}</b></td>
                                <td>
                                    <span class="status-badge status-${m.status}">
                                        ${m.status === 'open' ? 'Ouvert' : (m.status === 'paused' ? 'En Pause' : 'Clôturé')}
                                    </span>
                                </td>
                                <td>${formatPoints(m.volume)} pts</td>
                                <td>
                                    <div style="display:flex; gap:0.5rem;">
                                        ${m.status === 'open' ? `
                                            <button class="btn-primary resolve-market-btn" data-market-id="${m.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-gavel"></i> Clôturer / Désigner Gagnant
                                            </button>
                                            <button class="btn-outline toggle-pause-btn" data-market-id="${m.id}" style="padding:0.3rem 0.6rem; font-size:0.8rem;">
                                                <i class="fa-solid fa-pause"></i> Pause
                                            </button>
                                        ` : `
                                            <span style="color:var(--text-secondary); font-size:0.8rem;">Résolu</span>
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

function renderAdminCategories() {
    const categories = state.categories || [];
    return `
        <div class="admin-section-box">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h3 style="font-size:1.1rem; font-weight:700;"><i class="fa-solid fa-tags"></i> Gestion des Catégories</h3>
                <button class="btn-primary" id="adminCreateCatBtn" style="padding:0.4rem 0.8rem; font-size:0.85rem;">
                    <i class="fa-solid fa-plus"></i> Nouvelle Catégorie
                </button>
            </div>
            <div class="categories-admin-list">
                ${categories.map(c => `
                    <div class="cat-admin-row">
                        <span><b>${esc(c.name)}</b></span>
                        <button class="btn-danger delete-cat-btn" data-cat-id="${c.id}" style="padding:0.25rem 0.5rem; font-size:0.75rem;">
                            <i class="fa-solid fa-trash"></i> Supprimer
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderAdminLogs() {
    return `
        <div class="admin-section-box">
            <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:1rem;">
                <i class="fa-solid fa-list-check"></i> Journal d'Audit & Sécurité
            </h3>
            <div id="adminAuditLogContainer">
                <p style="color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Chargement des logs...</p>
            </div>
        </div>
    `;
}

export function attachAdminEvents() {
    // 1. Onglets Admin
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.onclick = () => {
            state.adminTab = btn.dataset.tab;
            router.renderCurrentView();
            if (state.adminTab === 'logs') loadAuditLogs();
        };
    });

    // 2. Export CSV
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
        exportBtn.onclick = () => {
            window.open('/api/admin/export/csv', '_blank');
        };
    }

    // 3. Batch Approve Users
    const batchApproveBtn = document.getElementById('batchApproveUsersBtn');
    if (batchApproveBtn) {
        batchApproveBtn.onclick = async () => {
            batchApproveBtn.disabled = true;
            batchApproveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validation...';
            try {
                await api.post('/api/admin/users/batch-approve');
                toast.success("Toutes les inscriptions ont été validées !");
                await router.fetchGlobalData();
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur lors de la validation groupée");
                batchApproveBtn.disabled = false;
                batchApproveBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Tout approuver';
            }
        };
    }

    // 4. Inscription unitaire Approve / Reject
    document.querySelectorAll('.approve-user-btn').forEach(btn => {
        btn.onclick = async () => {
            const uid = btn.dataset.userId;
            try {
                await api.post(`/api/admin/users/${uid}/approve`);
                toast.success("Utilisateur approuvé");
                await router.fetchGlobalData();
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur");
            }
        };
    });

    document.querySelectorAll('.reject-user-btn').forEach(btn => {
        btn.onclick = async () => {
            const uid = btn.dataset.userId;
            try {
                await api.post(`/api/admin/users/${uid}/reject`);
                toast.info("Utilisateur rejeté");
                await router.fetchGlobalData();
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur");
            }
        };
    });

    // 5. Réinitialisation mot de passe admin
    document.querySelectorAll('.reset-pass-action-btn').forEach(btn => {
        btn.onclick = () => {
            const reqId = btn.dataset.reqId;
            const userName = btn.dataset.userName;
            modal.show({
                title: `Réinitialiser le mot de passe pour ${userName}`,
                content: `
                    <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Nouveau mot de passe temporaire</label>
                    <input type="text" id="adminNewPassInput" class="input-full" placeholder="Ex: Boquette2026!">
                `,
                confirmText: "Valider le mot de passe",
                onConfirm: async () => {
                    const newPassword = document.getElementById('adminNewPassInput').value.trim();
                    if (!newPassword || newPassword.length < 6) {
                        toast.error("Le mot de passe doit faire au moins 6 caractères");
                        throw new Error("Validation");
                    }
                    try {
                        await api.post(`/api/admin/password-resets/${reqId}/approve`, { newPassword });
                        toast.success(`Mot de passe réinitialisé pour ${userName}`);
                        await router.fetchGlobalData();
                        router.renderCurrentView();
                    } catch (err) {
                        toast.error(err.message || "Erreur");
                        throw err;
                    }
                }
            });
        };
    });

    // 6. Nouveau Marché Modal
    const newMarketBtn = document.getElementById('adminNewMarketBtn');
    if (newMarketBtn) {
        newMarketBtn.onclick = () => {
            const categories = state.categories || [];
            modal.show({
                title: "Créer un Nouveau Marché",
                content: `
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Titre / Question du marché *</label>
                            <input type="text" id="createMarketTitle" class="input-full" placeholder="Ex: Qui sera élu Grand Khâdrah ?">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Choix possibles (séparés par des virgules) *</label>
                            <input type="text" id="createMarketChoices" class="input-full" placeholder="Oui, Non (ou Choix A, Choix B, Choix C)">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Catégorie</label>
                            <select id="createMarketCategory" class="input-full">
                                <option value="">-- Sans catégorie --</option>
                                ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Image d'illustration (URL https://)</label>
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

                    const choices = choicesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    if (!title || choices.length < 2) {
                        toast.error("Veuillez saisir un titre et au moins 2 choix");
                        throw new Error("Validation");
                    }

                    let pauseAt = null;
                    if (pauseAtVal) pauseAt = new Date(pauseAtVal).toISOString();

                    try {
                        await api.post('/api/admin/markets', {
                            title,
                            choices,
                            categoryId,
                            image,
                            pauseAt
                        });
                        toast.success("Marché créé avec succès !");
                        await router.fetchGlobalData();
                        router.renderCurrentView();
                    } catch (err) {
                        toast.error(err.message || "Erreur de création");
                        throw err;
                    }
                }
            });
        };
    }

    // 7. Clôturer / Résoudre Marché
    document.querySelectorAll('.resolve-market-btn').forEach(btn => {
        btn.onclick = () => {
            const mId = btn.dataset.marketId;
            const market = state.markets.find(m => m.id === mId);
            if (!market) return;

            let optsHtml = `
                <select id="resolveWinnerSelect" class="input-full" style="margin-top:0.75rem;">
                    <option value="cancelled">-- ANNULER (Remboursement Intégral) --</option>
                    ${market.options.map(o => `
                        <option value="${o.id}">Déclarer Vainqueur : ${esc(o.label)}</option>
                    `).join('')}
                </select>
            `;

            modal.show({
                title: `Clôturer le marché "${esc(market.title)}"`,
                content: `
                    <p style="font-size:0.9rem; color:var(--text-secondary);">
                        Désignez l'option gagnante. Les gains seront calculés et distribués automatiquement aux parieurs gagnants.
                    </p>
                    ${optsHtml}
                `,
                confirmText: "Valider la Clôture",
                onConfirm: async () => {
                    const winnerId = document.getElementById('resolveWinnerSelect').value;
                    try {
                        await api.post(`/api/admin/markets/${mId}/resolve`, { winnerId });
                        toast.success("Marché résolu avec succès !");
                        await router.fetchGlobalData();
                        router.renderCurrentView();
                    } catch (err) {
                        toast.error(err.message || "Erreur de résolution");
                        throw err;
                    }
                }
            });
        };
    });
}

async function loadAuditLogs() {
    const container = document.getElementById('adminAuditLogContainer');
    if (!container) return;
    try {
        const logs = await api.get('/api/admin/activity-log');
        if (!logs || logs.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);">Aucun log d\'activité enregistré.</p>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="custom-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Acteur</th>
                            <th>Détails</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.slice(0, 50).map(l => `
                            <tr>
                                <td style="font-size:0.8rem; color:var(--text-secondary);">${formatDate(l.time)}</td>
                                <td><span class="badge-pill">${esc(l.type)}</span></td>
                                <td>${esc(l.adminName || l.userName || 'Système')}</td>
                                <td style="font-size:0.85rem;">${esc(l.details || l.optLabel || l.marketTitle || '-')}</td>
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
