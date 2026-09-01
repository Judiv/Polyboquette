/**
 * PolyBoquette - Toast Notifications
 */

import { esc } from '../utils.js';

export const toast = {
    show(message, type = 'success', duration = 3500) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const el = document.createElement('div');
        const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info');
        el.className = `toast toast-${type}`;
        el.innerHTML = `<i class="fa-solid ${esc(icon)}"></i> <span>${esc(message)}</span>`;
        container.appendChild(el);

        setTimeout(() => {
            el.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => el.remove(), 300);
        }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 4500); },
    info(msg) { this.show(msg, 'info'); }
};
