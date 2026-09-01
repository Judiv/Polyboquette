/**
 * PolyBoquette - Vue Profil & Badges
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';
import { esc, formatPoints, computeUserBadges } from '../utils.js';

export function renderProfile() {
    const user = state.currentUser;
    if (!user) {
        return `
            <div class="empty-state">
                <h2>Connexion requise</h2>
                <button class="btn-primary" onclick="window.location.hash = '#/login'">Se connecter</button>
            </div>
        `;
    }

    const badges = computeUserBadges(user, state.markets || []);
    const unlockedCount = badges.filter(b => b.isUnlocked).length;

    return `
        <div class="profile-container">
            <h1 class="page-title"><i class="fa-solid fa-circle-user"></i> Mon Profil Gadz'arts</h1>

            <div class="profile-layout-grid">
                <!-- Carte Informations Personnelles -->
                <div class="profile-card">
                    <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1.5rem;">
                        <div class="profile-avatar">
                            <i class="fa-solid fa-user-graduate fa-2x" style="color:var(--accent-color);"></i>
                        </div>
                        <div>
                            <h2 style="font-size:1.3rem; margin:0; font-weight:800;">${esc(user.name)}</h2>
                            <div style="color:var(--text-secondary); font-size:0.85rem;">Num's : <b>${esc(user.nums || user.username)}</b> ${user.role === 'admin' ? '<span class="admin-badge">ADMIN</span>' : ''}</div>
                        </div>
                    </div>

                    <div class="profile-details-list">
                        <div class="profile-detail-row">
                            <span class="detail-label">Prénom & Nom</span>
                            <span class="detail-val">${esc(user.name)}</span>
                        </div>
                        <div class="profile-detail-row">
                            <span class="detail-label">Num's</span>
                            <span class="detail-val">${esc(user.nums || user.username)}</span>
                        </div>
                        <div class="profile-detail-row">
                            <span class="detail-label">E-mail</span>
                            <span class="detail-val">${esc(user.email) || '<span style="color:var(--text-secondary); font-style:italic;">Non renseigné</span>'}</span>
                        </div>
                        <div class="profile-detail-row">
                            <span class="detail-label">Solde actuel</span>
                            <span class="detail-val" style="color:var(--accent-color); font-weight:700;">${formatPoints(user.points)} pts</span>
                        </div>
                    </div>

                    <!-- Actions Sécurité & Compte -->
                    <div style="margin-top:1.5rem; display:flex; flex-direction:column; gap:0.5rem;">
                        <button class="btn-outline" id="profileChangePassBtn">
                            <i class="fa-solid fa-key"></i> Modifier mon mot de passe
                        </button>
                        <button class="btn-outline" id="profileChangeEmailBtn">
                            <i class="fa-solid fa-envelope"></i> Modifier mon adresse e-mail
                        </button>
                        <button class="btn-outline" id="profileRequestNameBtn">
                            <i class="fa-solid fa-signature"></i> Demander un changement de nom
                        </button>
                        <button class="btn-outline" id="profileLogoutBtn" style="color:var(--no-color); border-color:rgba(239, 68, 68, 0.3); margin-top:0.5rem;">
                            <i class="fa-solid fa-right-from-bracket"></i> Se déconnecter
                        </button>
                    </div>
                </div>

                <!-- Carte Badges & Succès Déblocables -->
                <div class="profile-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                        <div>
                            <h2 style="font-size:1.2rem; font-weight:700; margin:0;">
                                <i class="fa-solid fa-trophy" style="color:#eab308;"></i> Badges & Succès
                            </h2>
                            <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">Relevez des défis et découvrez les badges secrets.</p>
                        </div>
                        <span class="badge-counter">
                            ${unlockedCount} / ${badges.length}
                        </span>
                    </div>

                    <div class="badges-grid">
                        ${badges.map(b => `
                            <div class="badge-item ${b.isUnlocked ? 'badge-unlocked' : 'badge-locked'}">
                                <div class="badge-icon-box" style="background:${b.isUnlocked ? b.color + '25' : 'var(--bg-secondary)'}; color:${b.isUnlocked ? b.color : 'var(--text-secondary)'};">
                                    <i class="fa-solid ${b.isUnlocked ? esc(b.icon) : (b.isSecret ? 'fa-lock' : esc(b.icon))}"></i>
                                </div>
                                <div style="flex:1;">
                                    <div class="badge-title">
                                        ${esc(b.displayName)}
                                        ${b.isUnlocked ? '<i class="fa-solid fa-circle-check" style="color:#22c55e; font-size:0.8rem; margin-left:0.25rem;"></i>' : ''}
                                    </div>
                                    <div class="badge-desc">${esc(b.displayDesc)}</div>
                                    <div class="badge-difficulty difficulty-${b.tier}">${b.difficulty}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function attachProfileEvents() {
    const logoutBtn = document.getElementById('profileLogoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            try { await api.post('/api/auth/logout'); } catch (e) {}
            state.setUser(null);
            toast.info("Déconnexion réussie");
            router.navigate('/');
        };
    }

    const passBtn = document.getElementById('profileChangePassBtn');
    if (passBtn) {
        passBtn.onclick = () => {
            modal.show({
                title: "Modifier mon mot de passe",
                content: `
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Ancien mot de passe</label>
                            <input type="password" id="oldPassInput" class="input-full" placeholder="••••••••">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Nouveau mot de passe (6 car. min)</label>
                            <input type="password" id="newPassInput" class="input-full" placeholder="••••••••">
                        </div>
                    </div>
                `,
                confirmText: "Enregistrer",
                onConfirm: async () => {
                    const oldPassword = document.getElementById('oldPassInput').value;
                    const newPassword = document.getElementById('newPassInput').value;
                    if (!oldPassword || !newPassword) { toast.error("Tous les champs sont requis"); throw new Error(); }
                    await api.post('/api/auth/change-password', { oldPassword, newPassword });
                    toast.success("Mot de passe mis à jour");
                }
            });
        };
    }

    const emailBtn = document.getElementById('profileChangeEmailBtn');
    if (emailBtn) {
        emailBtn.onclick = () => {
            modal.show({
                title: "Modifier mon adresse e-mail",
                content: `
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Nouvelle adresse e-mail</label>
                            <input type="email" id="newEmailInput" class="input-full" placeholder="prenom.nom@gadz.org" value="${esc(state.currentUser.email || '')}">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Mot de passe de confirmation</label>
                            <input type="password" id="confirmPassForEmail" class="input-full" placeholder="••••••••">
                        </div>
                    </div>
                `,
                confirmText: "Enregistrer",
                onConfirm: async () => {
                    const newEmail = document.getElementById('newEmailInput').value.trim();
                    const password = document.getElementById('confirmPassForEmail').value;
                    const res = await api.post('/api/auth/change-email', { newEmail, password });
                    state.setUser(res.user);
                    toast.success("Adresse e-mail enregistrée");
                    router.renderCurrentView();
                }
            });
        };
    }

    const nameBtn = document.getElementById('profileRequestNameBtn');
    if (nameBtn) {
        nameBtn.onclick = () => {
            modal.show({
                title: "Demande de Changement de Nom",
                content: `
                    <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Nouveau Prénom et Nom souhaités</label>
                    <input type="text" id="newNameInput" class="input-full" placeholder="Ex: Jean Dupont">
                `,
                confirmText: "Transmettre la demande",
                onConfirm: async () => {
                    const newName = document.getElementById('newNameInput').value.trim();
                    if (!newName) { toast.error("Nom requis"); throw new Error(); }
                    await api.post('/api/profile/request-name-change', { newName });
                    toast.success("Demande transmise à l'administrateur");
                }
            });
        };
    }
}
