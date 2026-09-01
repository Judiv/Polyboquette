/**
 * PolyBoquette - Vue Authentification (Connexion & Inscription)
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';
import { esc } from '../utils.js';

export function renderLogin() {
    return `
        <div class="auth-card">
            <div style="text-align:center; margin-bottom:1.5rem;">
                <img src="logo.png" alt="PolyBoquette" style="height:60px; margin-bottom:0.75rem;">
                <h2 style="font-size:1.4rem; font-weight:800; margin:0;">Connexion</h2>
                <p style="color:var(--text-secondary); font-size:0.85rem; margin-top:0.25rem;">PolyBoquette • Marchés Prédictifs</p>
            </div>

            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.35rem;">Nom d'utilisateur / Identifiant</label>
                    <input type="text" id="loginUsername" class="input-full" placeholder="Identifiant" autocomplete="username">
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
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Nom & Prénom *</label>
                    <input type="text" id="regName" class="input-full" placeholder="Ex: Jean Dupont">
                </div>

                <div style="display:flex; gap:0.5rem;">
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Bucque</label>
                        <input type="text" id="regBuque" class="input-full" placeholder="F'OÜ">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Num's</label>
                        <input type="text" id="regNums" class="input-full" placeholder="11-96">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Prom's</label>
                        <input type="text" id="regProms" class="input-full" placeholder="ME225">
                    </div>
                </div>

                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Adresse E-mail (optionnelle)</label>
                    <input type="email" id="regEmail" class="input-full" placeholder="jean.dupont@gadz.org">
                </div>

                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Identifiant de connexion *</label>
                    <input type="text" id="regUsername" class="input-full" placeholder="Nom ou Pseudo unique">
                </div>

                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.25rem;">Mot de passe (6 car. min) *</label>
                    <input type="password" id="regPassword" class="input-full" placeholder="••••••••">
                </div>

                <button class="btn-primary btn-block" id="doRegisterBtn" style="padding:0.85rem; margin-top:0.5rem;">
                    <i class="fa-solid fa-user-plus"></i> Créer mon compte
                </button>
            </div>

            <div style="text-align:center; margin-top:1.25rem; font-size:0.9rem; color:var(--text-secondary);">
                Déjà inscrit ? <a href="#/login" style="font-weight:600; color:var(--accent-color);">Se connecter</a>
            </div>
        </div>
    `;
}

export function attachAuthEvents() {
    // 1. Connexion
    const loginBtn = document.getElementById('doLoginBtn');
    if (loginBtn) {
        const submitLogin = async () => {
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            if (!username || !password) return toast.error("Veuillez renseigner vos identifiants");

            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connexion...';

            try {
                const res = await api.post('/api/auth/login', { username, password });
                state.setUser(res.user);
                toast.success(`Bienvenue, ${res.user.name} !`);
                await router.fetchGlobalData();
                router.navigate('/');
            } catch (err) {
                toast.error(err.message || "Identifiants incorrects");
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

    // 2. Inscription
    const regBtn = document.getElementById('doRegisterBtn');
    if (regBtn) {
        regBtn.onclick = async () => {
            const name = document.getElementById('regName').value.trim();
            const buque = document.getElementById('regBuque').value.trim();
            const nums = document.getElementById('regNums').value.trim();
            const proms = document.getElementById('regProms').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const username = document.getElementById('regUsername').value.trim();
            const password = document.getElementById('regPassword').value;

            if (!name || !username || !password) {
                return toast.error("Veuillez renseigner votre nom, identifiant et mot de passe");
            }
            if (password.length < 6) {
                return toast.error("Le mot de passe doit faire au moins 6 caractères");
            }

            regBtn.disabled = true;
            regBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Inscription...';

            try {
                await api.post('/api/auth/register', {
                    name, buque, nums, proms, email, username, password
                });
                toast.success("Inscription enregistrée ! Votre compte sera validé par l'administration.");
                router.navigate('/login');
            } catch (err) {
                toast.error(err.message || "Erreur lors de l'inscription");
                regBtn.disabled = false;
                regBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Créer mon compte';
            }
        };
    }

    // 3. Mot de passe oublié
    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
        forgotLink.onclick = (e) => {
            e.preventDefault();
            modal.show({
                title: "Mot de passe oublié",
                content: `
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.75rem;">
                        Indiquez votre identifiant. Une demande sera transmise à l'administrateur pour réinitialiser votre accès.
                    </p>
                    <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem;">Identifiant de connexion</label>
                    <input type="text" id="forgotUsernameInput" class="input-full" placeholder="Votre nom d'utilisateur">
                `,
                confirmText: "Envoyer la demande",
                onConfirm: async () => {
                    const username = document.getElementById('forgotUsernameInput').value.trim();
                    if (!username) {
                        toast.error("Identifiant requis");
                        throw new Error("Validation");
                    }
                    try {
                        await api.post('/api/auth/forgot-password', { username });
                        toast.success("Demande transmise à l'administrateur !");
                    } catch (err) {
                        toast.error(err.message || "Erreur");
                        throw err;
                    }
                }
            });
        };
    }
}
