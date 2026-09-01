/**
 * PolyBoquette - Navbar & Mobile Navigation
 */

import { state } from '../state.js';
import { router } from '../router.js';
import { formatPoints, esc } from '../utils.js';

export const navbar = {
    render() {
        const user = state.currentUser;
        const navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        // Theme Toggle
        const themeBtn = document.getElementById('themeToggle');
        if (themeBtn) {
            themeBtn.innerHTML = state.theme === 'dark' 
                ? '<i class="fa-solid fa-sun" style="color:#eab308"></i>' 
                : '<i class="fa-solid fa-moon"></i>';
            themeBtn.onclick = () => {
                const next = state.theme === 'dark' ? 'light' : 'dark';
                state.setTheme(next);
            };
        }

        const userPill = document.getElementById('userPill');
        const authActions = document.getElementById('authActions');
        const logoutBtn = document.getElementById('logoutBtn');

        document.querySelectorAll('.nav-custom-btn').forEach(el => el.remove());

        if (user) {
            if (userPill) {
                userPill.classList.remove('hidden');
                userPill.style.cursor = 'pointer';
                userPill.onclick = () => router.navigate('/profile');
                // Afficher Prénom Nom (ou Bucque / Nom)
                document.getElementById('userName').textContent = user.name || user.firstName || 'Gadzarts';
                document.getElementById('userPoints').innerHTML = `<i class="fa-solid fa-coins"></i> ${formatPoints(user.points)}`;
            }
            if (authActions) authActions.classList.add('hidden');
            if (logoutBtn) logoutBtn.classList.remove('hidden');

            // Desktop Buttons (hidden on mobile via .hide-mobile)
            const propBtn = document.createElement('button');
            propBtn.className = 'btn-outline nav-custom-btn hide-mobile';
            propBtn.innerHTML = '<i class="fa-solid fa-lightbulb"></i> <span>Proposer</span>';
            propBtn.onclick = () => router.navigate('/proposals');
            navActions.insertBefore(propBtn, authActions);

            const portBtn = document.createElement('button');
            portBtn.className = 'btn-outline nav-custom-btn hide-mobile';
            portBtn.innerHTML = '<i class="fa-solid fa-wallet"></i> <span>Portefeuille</span>';
            portBtn.onclick = () => router.navigate('/portfolio');
            navActions.insertBefore(portBtn, authActions);

            if (user.role === 'admin') {
                const admBtn = document.createElement('button');
                admBtn.className = 'btn-primary nav-custom-btn hide-mobile';
                admBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> <span>Admin</span>';
                admBtn.onclick = () => router.navigate('/admin');
                navActions.insertBefore(admBtn, authActions);
            }
        } else {
            if (userPill) userPill.classList.add('hidden');
            if (logoutBtn) logoutBtn.classList.add('hidden');
            if (authActions) authActions.classList.remove('hidden');
        }

        this.renderMobileBottomBar();
    },

    renderMobileBottomBar() {
        let bar = document.getElementById('mobileBottomNav');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'mobileBottomNav';
            bar.className = 'mobile-bottom-nav';
            document.body.appendChild(bar);
        }

        const user = state.currentUser;
        const current = state.currentRoute;

        bar.innerHTML = `
            <a href="#/" class="bottom-nav-item ${current === 'dashboard' ? 'active' : ''}">
                <i class="fa-solid fa-fire"></i>
                <span>Marchés</span>
            </a>
            ${user ? `
                <a href="#/portfolio" class="bottom-nav-item ${current === 'portfolio' ? 'active' : ''}">
                    <i class="fa-solid fa-wallet"></i>
                    <span>Paris</span>
                </a>
                <a href="#/proposals" class="bottom-nav-item ${current === 'proposals' ? 'active' : ''}">
                    <i class="fa-solid fa-lightbulb"></i>
                    <span>Idées</span>
                </a>
                <a href="#/profile" class="bottom-nav-item ${current === 'profile' ? 'active' : ''}">
                    <i class="fa-solid fa-user"></i>
                    <span>Profil</span>
                </a>
                ${user.role === 'admin' ? `
                    <a href="#/admin" class="bottom-nav-item ${current === 'admin' ? 'active' : ''}">
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Admin</span>
                    </a>
                ` : ''}
            ` : `
                <a href="#/login" class="bottom-nav-item ${current === 'login' ? 'active' : ''}">
                    <i class="fa-solid fa-right-to-bracket"></i>
                    <span>Connexion</span>
                </a>
            `}
        `;
    }
};
