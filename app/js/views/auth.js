/**
 * PolyBoquette - Vue Authentification (Connexion & Inscription Num's)
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

export function renderLogin() {
    return `
        <div class="auth-card">
            <div style="text-align:center; margin-bottom:1.5rem;">
                <img src="logo.png" alt="PolyBoquette" style="height:55px; margin-bottom:0.75rem;">
                <h2 style="font-size:1.4rem; font-weight:800; margin:0;">Connexion</h2>
                <p style="color:var(--text-secondary); font-size:0.85rem; margin-top:0.25rem;">PolyBoquette • Marchés Prédictifs</p>
            </div>

            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.35rem;">Num's ou Identifiant</label>
                    <input type="text" id="loginNums" class="input-full" placeholder="Ex: 11-96 ou votre pseudo" autocomplete="username">
                </div>

                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                        <label style="font-size:0.85rem; font-weight:600; margin:0;">Mot de passe</label>
                        <a href="#" id="forgotPasswordLink" style="font-size:0.8rem; color:var(--accent-color);">Oublié ?</a>
                    </div>
                    <input type="password" id="loginPassword" class="input-full" placeholder="••••••••" autocomplete="current-password">
                </div>

                <button class="btn-primary btn-block" id="doLoginBtn" style="padding:0.85rem; margin-top:0.5rem;">
                    <i class="fa-solid fa-right-to-bracket"></i> Se connecter
                </button>
            </div>

            <div style="text-align:center; margin-top:1.5rem; font-size:0.9rem; color:var(--text-secondary);">
                Pas encore de compte ? <a href="#/register" style="font-weight:600; color:var(--accent-color);">S'inscrire</a>
            </div>
        </div>
    `;
}

export function renderRegister() {
    return `
        <div class="auth-card" style="max-width:480px;">
            <div style="text-align:center; margin-bottom:1.5rem;">
                <img src="logo.png" alt="PolyBoquette" style="height:50px; margin-bottom:0.5rem;">
                <h2 style="font-size:1.4rem; font-weight:800; margin:0;">Inscription Gadz'arts</h2>
                <p style="color:var(--text-secondary); font-size:0.85rem; margin-top:0.25rem;">Rejoignez la communauté de prédiction</p>
            </div>

            <div style="display:flex; flex-direction:column; gap:0.85rem;">
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Num's * (Identifiant de connexion)</label>
                    <input type="text" id="regNums" class="input-full" placeholder="Ex: 11-96(0) ou 11-96">
                </div>

                <div style="display:flex; gap:0.75rem;">
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Prénom *</label>
                        <input type="text" id="regFirstName" class="input-full" placeholder="Jean">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Nom *</label>
                        <input type="text" id="regLastName" class="input-full" placeholder="Dupont">
                    </div>
                </div>

                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Adresse E-mail *</label>
                    <input type="email" id="regEmail" class="input-full" placeholder="jean.dupont@gadz.org">
                </div>

                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Mot de passe (6 car. min) *</label>
                    <input type="password" id="regPassword" class="input-full" placeholder="••••••••">
                </div>

                <button class="btn-primary btn-block" id="doRegisterBtn" style="padding:0.85rem; margin-top:0.5rem;">
                    <i class="fa-solid fa-user-plus"></i> S'inscrire
                </button>
            </div>

            <div style="text-align:center; margin-top:1.25rem; font-size:0.9rem; color:var(--text-secondary);">
                Déjà inscrit ? <a href="#/login" style="font-weight:600; color:var(--accent-color);">Se connecter avec son Num's</a>
            </div>
        </div>
    `;
}

export function attachAuthEvents() {
    // Connexion
    const loginBtn = document.getElementById('doLoginBtn');
    if (loginBtn) {
        const submitLogin = async () => {
            const nums = document.getElementById('loginNums').value.trim();
            const password = document.getElementById('loginPassword').value;
            if (!nums || !password) return toast.error("Veuillez renseigner votre Num's et votre mot de passe");

            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connexion...';

            try {
                const res = await api.post('/api/auth/login', { username: nums, password });
                state.setUser(res.user);
                toast.success(`Bienvenue, ${res.user.name} !`);
                await router.fetchGlobalData();
                router.navigate('/');
            } catch (err) {
                toast.error(err.message || "Num's ou mot de passe incorrect");
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';
            }
        };

        loginBtn.onclick = submitLogin;
        const passIn = document.getElementById('loginPassword');
        if (passIn) {
            passIn.onkeydown = (e) => { if (e.key === 'Enter') submitLogin(); };
        }
    }

    // Inscription
    const regBtn = document.getElementById('doRegisterBtn');
    if (regBtn) {
        regBtn.onclick = async () => {
            const nums = document.getElementById('regNums').value.trim();
            const firstName = document.getElementById('regFirstName').value.trim();
            const lastName = document.getElementById('regLastName').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;

            if (!nums || !firstName || !lastName || !password) {
                return toast.error("Veuillez remplir votre Num's, Prénom, Nom et Mot de passe");
            }
            if (password.length < 6) {
                return toast.error("Le mot de passe doit faire au moins 6 caractères");
            }

            regBtn.disabled = true;
            regBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Inscription...';

            try {
                await api.post('/api/auth/register', {
                    nums, firstName, lastName, email, password
                });
                toast.success("Inscription enregistrée ! Votre compte sera validé par l'administration.");
                router.navigate('/login');
            } catch (err) {
                toast.error(err.message || "Erreur lors de l'inscription");
                regBtn.disabled = false;
                regBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> S\'inscrire';
            }
        };
    }

    // Mot de passe oublié
    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
        forgotLink.onclick = (e) => {
            e.preventDefault();
            modal.show({
                title: "Récupération d'accès",
                content: `
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">
                        Indiquez votre Num's. Une demande de réinitialisation sera envoyée à l'administrateur.
                    </p>
                    <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Num's</label>
                    <input type="text" id="forgotNumsInput" class="input-full" placeholder="Ex: 11-96">
                `,
                confirmText: "Transmettre la demande",
                onConfirm: async () => {
                    const nums = document.getElementById('forgotNumsInput').value.trim();
                    if (!nums) {
                        toast.error("Num's requis");
                        throw new Error("Validation");
                    }
                    try {
                        await api.post('/api/auth/forgot-password', { username: nums });
                        toast.success("Demande transmise à l'administrateur");
                    } catch (err) {
                        toast.error(err.message || "Erreur");
                        throw err;
                    }
                }
            });
        };
    }
}
