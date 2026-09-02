/**
 * PolyBoquette - Vue Propositions d'Idées de Marchés
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { esc, formatDate, formatRelativeTime } from '../utils.js';

let userProposalsList = null;
let allProposalsList = null;
let adminViewMode = 'mine'; // 'mine' | 'all'

export function renderProposals() {
    const user = state.currentUser;
    if (!user) {
        return `
            <div class="empty-state">
                <h2>Connexion requise</h2>
                <p style="color:var(--text-secondary); margin-bottom:1rem;">Connectez-vous pour soumettre des propositions de marchés.</p>
                <button class="btn-primary" onclick="window.location.hash = '#/login'">Se connecter</button>
            </div>
        `;
    }

    const isAdmin = user.role === 'admin';
    const myProposals = userProposalsList || [];
    const allProposals = allProposalsList || [];
    const displayedProposals = (isAdmin && adminViewMode === 'all') ? allProposals : myProposals;

    return `
        <div class="proposals-container" style="max-width:1050px; margin:0 auto;">
            <div style="margin-bottom:1.5rem;">
                <h1 class="page-title" style="margin-bottom:0.25rem;"><i class="fa-solid fa-lightbulb"></i> Boîte à Idées & Paris</h1>
                <p style="color:var(--text-secondary); font-size:0.9rem;">Proposez des idées de paris à l'administration ou suivez l'avancement de vos soumissions.</p>
            </div>

            <div class="proposals-grid-layout">
                <!-- Formulaire de Soumission -->
                <div class="proposals-card">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem;">
                        <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-color);"></i>
                        <h2 style="font-size:1.15rem; font-weight:700; margin:0;">Proposer un sujet</h2>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:0.9rem;">
                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.3rem;">Question du marché *</label>
                            <input type="text" id="propTitleInput" class="input-full" placeholder="Ex: Qui gagnera le tournoi TBK vs KIN ?">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.3rem;">Choix possibles (séparés par une virgule) *</label>
                            <input type="text" id="propChoicesInput" class="input-full" placeholder="Oui, Non (ou Équipe A, Équipe B, Nul)">
                            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">Exemple : <code>Oui, Non</code> ou <code>Siber's, KIN, Bordel's</code></div>
                        </div>

                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.3rem;">Image d'illustration (URL optionnelle)</label>
                            <input type="text" id="propImageInput" class="input-full" placeholder="https://images.unsplash.com/...">
                        </div>

                        <button class="btn-primary btn-block" id="submitProposalBtn" style="padding:0.75rem; margin-top:0.35rem;">
                            <i class="fa-solid fa-paper-plane"></i> Soumettre à l'administration
                        </button>
                    </div>
                </div>

                <!-- Historique des Propositions -->
                <div class="proposals-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <i class="fa-solid fa-clock-rotate-left" style="color:var(--accent-color);"></i>
                            <h2 style="font-size:1.15rem; font-weight:700; margin:0;">
                                ${isAdmin && adminViewMode === 'all' ? `Toutes les Idées (${allProposals.length})` : `Mes Idées (${myProposals.length})`}
                            </h2>
                        </div>

                        ${isAdmin ? `
                            <div style="display:flex; gap:0.3rem;">
                                <button class="filter-pill ${adminViewMode === 'mine' ? 'active' : ''}" id="toggleMinePropsBtn" style="font-size:0.75rem; padding:0.25rem 0.6rem;">
                                    Mes Idées
                                </button>
                                <button class="filter-pill ${adminViewMode === 'all' ? 'active' : ''}" id="toggleAllPropsBtn" style="font-size:0.75rem; padding:0.25rem 0.6rem;">
                                    Toute la Promo (${allProposals.length})
                                </button>
                            </div>
                        ` : ''}
                    </div>

                    ${displayedProposals.length === 0 ? `
                        <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-secondary);">
                            <i class="fa-regular fa-paper-plane fa-2x" style="opacity:0.4; margin-bottom:0.5rem;"></i>
                            <p style="font-size:0.9rem; font-weight:600;">Aucune proposition</p>
                            <p style="font-size:0.8rem;">Remplissez le formulaire à gauche pour suggérer un pari !</p>
                        </div>
                    ` : `
                        <div class="proposals-list-flow" style="display:flex; flex-direction:column; gap:0.85rem; max-height:560px; overflow-y:auto; padding-right:0.25rem;">
                            ${displayedProposals.map(p => {
                                const statusClass = p.status === 'approved' ? 'status-approved' : (p.status === 'rejected' ? 'status-rejected' : 'status-pending');
                                const statusLabel = p.status === 'approved' ? 'Validé' : (p.status === 'rejected' ? 'Refusé' : 'En attente');
                                const choices = Array.isArray(p.choices) ? p.choices : [];

                                return `
                                    <div class="proposal-card-item">
                                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; margin-bottom:0.4rem;">
                                            <div style="font-weight:700; font-size:0.95rem; line-height:1.3; color:var(--text-primary);">
                                                ${esc(p.title)}
                                            </div>
                                            <span class="status-badge ${statusClass}">
                                                ${statusLabel}
                                            </span>
                                        </div>

                                        <div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-bottom:0.5rem;">
                                            ${choices.map(c => `
                                                <span class="choice-tag"><i class="fa-regular fa-circle-dot" style="font-size:0.65rem;"></i> ${esc(c)}</span>
                                            `).join('')}
                                        </div>

                                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-secondary);">
                                            <span>
                                                ${isAdmin && p.authorName ? `<b>${esc(p.authorName)}</b> • ` : ''}
                                                <i class="fa-regular fa-calendar"></i> ${formatRelativeTime(p.createdAt || p.time)}
                                            </span>
                                        </div>

                                        ${p.adminNote ? `
                                            <div class="admin-note-bubble">
                                                <i class="fa-solid fa-comment-dots"></i> <b>Motif admin :</b> ${esc(p.adminNote)}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

export function attachProposalsEvents() {
    // Charger mes propositions
    api.get('/api/proposals').then(data => {
        userProposalsList = data || [];
        if (state.currentUser && state.currentUser.role === 'admin') {
            api.get('/api/proposals?scope=all').then(all => {
                allProposalsList = all || [];
                if (state.currentRoute === 'proposals') router.renderCurrentView();
            }).catch(() => {});
        } else {
            if (state.currentRoute === 'proposals') router.renderCurrentView();
        }
    }).catch(() => {});

    // Boutons de bascule Admin
    const mineBtn = document.getElementById('toggleMinePropsBtn');
    if (mineBtn) {
        mineBtn.onclick = () => {
            adminViewMode = 'mine';
            router.renderCurrentView();
        };
    }

    const allBtn = document.getElementById('toggleAllPropsBtn');
    if (allBtn) {
        allBtn.onclick = () => {
            adminViewMode = 'all';
            router.renderCurrentView();
        };
    }

    // Soumission
    const submitBtn = document.getElementById('submitProposalBtn');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            const title = document.getElementById('propTitleInput').value.trim();
            const choicesStr = document.getElementById('propChoicesInput').value.trim();
            const image = document.getElementById('propImageInput').value.trim();

            const choices = choicesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
            if (!title || choices.length < 2) {
                return toast.error("Veuillez renseigner un titre et au moins 2 choix valides.");
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi...';

            try {
                const res = await api.post('/api/proposals', { title, choices, image });
                if (!userProposalsList) userProposalsList = [];
                userProposalsList.unshift(res);
                if (allProposalsList) allProposalsList.unshift(res);

                toast.success("Proposition envoyée avec succès !");
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur lors de l'envoi");
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Soumettre à l\'administration';
            }
        };
    }
}
