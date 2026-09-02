/**
 * PolyBoquette - Vue Propositions d'Idées de Marchés (Ergonomique & Moderne)
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { esc, formatDate, formatRelativeTime } from '../utils.js';

let userProposalsList = null;

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

    const proposals = userProposalsList !== null ? userProposalsList : (state.proposals || []);
    const isAdmin = user.role === 'admin';

    return `
        <div class="proposals-container" style="max-width:1000px; margin:0 auto;">
            <div style="margin-bottom:1.5rem;">
                <h1 class="page-title" style="margin-bottom:0.25rem;"><i class="fa-solid fa-lightbulb"></i> Boîte à Idées & Paris</h1>
                <p style="color:var(--text-secondary); font-size:0.9rem;">Proposez des sujets de paris pour animer la communauté ou suivez l'état de vos soumissions.</p>
            </div>

            ${isAdmin ? `
                <div style="background:var(--accent-transparent); border:1px solid var(--accent-color); border-radius:var(--radius-md); padding:0.75rem 1rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                    <div style="font-size:0.85rem; font-weight:600;">
                        <i class="fa-solid fa-shield-halved"></i> Espace Modération : Consultez les propositions de tous les membres.
                    </div>
                    <button class="btn-primary" onclick="window.location.hash = '#/admin'" style="padding:0.35rem 0.8rem; font-size:0.8rem;">
                        Aller aux Validations Admin
                    </button>
                </div>
            ` : ''}

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
                            <input type="text" id="propTitleInput" class="input-full" placeholder="Ex: Qui gagnera le match TBK vs KIN ?">
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

                <!-- Historique des Propositions de l'Utilisateur -->
                <div class="proposals-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <i class="fa-solid fa-clock-rotate-left" style="color:var(--accent-color);"></i>
                            <h2 style="font-size:1.15rem; font-weight:700; margin:0;">Mes Soumissions (${proposals.length})</h2>
                        </div>
                    </div>

                    ${proposals.length === 0 ? `
                        <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-secondary);">
                            <i class="fa-regular fa-paper-plane fa-2x" style="opacity:0.4; margin-bottom:0.5rem;"></i>
                            <p style="font-size:0.9rem; font-weight:600;">Aucune proposition enregistrée</p>
                            <p style="font-size:0.8rem;">Remplissez le formulaire à gauche pour suggérer votre premier pari !</p>
                        </div>
                    ` : `
                        <div class="proposals-list-flow" style="display:flex; flex-direction:column; gap:0.85rem; max-height:550px; overflow-y:auto; padding-right:0.25rem;">
                            ${proposals.map(p => {
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
                                            <span><i class="fa-regular fa-calendar"></i> ${formatRelativeTime(p.createdAt || p.time)}</span>
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
    // Recharger la liste personnelle de l'utilisateur
    api.get('/api/proposals').then(data => {
        userProposalsList = data || [];
        const container = document.getElementById('app-container');
        if (container && state.currentRoute === 'proposals') {
            container.innerHTML = renderProposals();
            bindSubmitEvent();
        }
    }).catch(() => {});

    bindSubmitEvent();
}

function bindSubmitEvent() {
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
