/**
 * PolyBoquette - Vue Propositions d'Idées de Marchés
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { esc, formatDate } from '../utils.js';

export function renderProposals() {
    const user = state.currentUser;
    if (!user) {
        return `
            <div class="empty-state">
                <h2>Connexion requise</h2>
                <p>Connectez-vous pour proposer de nouvelles idées de paris.</p>
                <button class="btn-primary" onclick="window.location.hash = '#/login'">Se connecter</button>
            </div>
        `;
    }

    const myProposals = state.proposals || [];

    return `
        <div class="proposals-container">
            <h1 class="page-title"><i class="fa-solid fa-lightbulb"></i> Proposer un Nouveau Pari</h1>

            <div class="proposals-layout">
                <!-- Formulaire de Proposition -->
                <div class="proposals-form-card">
                    <h2 style="font-size:1.2rem; font-weight:700; margin-bottom:1rem;">Soumettre une idée</h2>
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1.25rem;">
                        Votre idée sera examinée par les administrateurs avant d'être publiée comme marché officiel.
                    </p>

                    <div style="display:flex; flex-direction:column; gap:1rem;">
                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Question ou Sujet du pari *</label>
                            <input type="text" id="propTitleInput" class="input-full" placeholder="Ex: Notre promo remportera-t-elle le tournoi inter-campus ?">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Choix possibles (séparés par des virgules) *</label>
                            <input type="text" id="propChoicesInput" class="input-full" placeholder="Oui, Non (ou Option A, Option B...)">
                        </div>

                        <div>
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Image d'illustration (URL optionnelle)</label>
                            <input type="text" id="propImageInput" class="input-full" placeholder="https://images.unsplash.com/...">
                        </div>

                        <button class="btn-primary btn-block" id="submitProposalBtn" style="margin-top:0.5rem; padding:0.85rem;">
                            <i class="fa-solid fa-paper-plane"></i> Envoyer ma proposition
                        </button>
                    </div>
                </div>

                <!-- Historique de mes propositions -->
                <div class="proposals-history-card">
                    <h2 style="font-size:1.2rem; font-weight:700; margin-bottom:1rem;">Mes propositions soumises</h2>

                    ${myProposals.length === 0 ? `
                        <p style="color:var(--text-secondary); font-size:0.9rem;">Vous n'avez pas encore soumis de proposition.</p>
                    ` : `
                        <div class="proposals-list">
                            ${myProposals.map(p => `
                                <div class="proposal-item">
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                                        <b style="font-size:0.95rem;">${esc(p.title)}</b>
                                        <span class="status-badge status-${p.status}">
                                            ${p.status === 'pending' ? 'En attente' : (p.status === 'approved' ? 'Validé' : 'Refusé')}
                                        </span>
                                    </div>
                                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.25rem;">
                                        Choix : ${(p.choices || []).join(' • ')}
                                    </div>
                                    <div style="font-size:0.75rem; color:var(--text-secondary);">
                                        Soumis le ${formatDate(p.createdAt)}
                                    </div>
                                    ${p.adminNote ? `
                                        <div style="margin-top:0.5rem; padding:0.4rem 0.6rem; background:var(--bg-secondary); border-radius:6px; font-size:0.8rem; color:#ef4444;">
                                            <b>Motif admin :</b> ${esc(p.adminNote)}
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

export function attachProposalsEvents() {
    const submitBtn = document.getElementById('submitProposalBtn');
    if (submitBtn) {
        submitBtn.onclick = async () => {
            const title = document.getElementById('propTitleInput').value.trim();
            const choicesStr = document.getElementById('propChoicesInput').value.trim();
            const image = document.getElementById('propImageInput').value.trim();

            const choices = choicesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
            if (!title || choices.length < 2) {
                return toast.error("Veuillez saisir un titre et au moins 2 choix valides.");
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi...';

            try {
                const res = await api.post('/api/proposals', { title, choices, image });
                if (res) {
                    if (!state.proposals) state.proposals = [];
                    state.proposals.unshift(res);
                }
                toast.success("Proposition envoyée avec succès !");
                router.renderCurrentView();
            } catch (err) {
                toast.error(err.message || "Erreur lors de l'envoi");
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer ma proposition';
            }
        };
    }
}
