/**
 * PolyBoquette - Modal Component
 */

export const modal = {
    show({ title, content, confirmText = "Valider", cancelText = "Annuler", onConfirm, isDanger = false }) {
        const container = document.getElementById('modal-container');
        if (!container) return;

        container.innerHTML = `
            <div class="modal-overlay" id="activeModalOverlay">
                <div class="modal-content">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                        <h2 style="font-size: 1.25rem; font-weight:700; margin:0;">${title}</h2>
                        <button class="btn-icon" id="modalCloseBtn" style="width:32px; height:32px;"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div style="margin-bottom: 1.5rem; color: var(--text-primary);">${content}</div>
                    <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:0.75rem;">
                        <button class="btn-outline" id="modalCancelBtn">${cancelText}</button>
                        <button class="${isDanger ? 'btn-danger' : 'btn-primary'}" id="modalConfirmBtn">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;

        const overlay = document.getElementById('activeModalOverlay');
        const closeBtn = document.getElementById('modalCloseBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');
        const confirmBtn = document.getElementById('modalConfirmBtn');

        const close = () => { container.innerHTML = ''; };

        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        closeBtn.onclick = close;
        cancelBtn.onclick = close;

        confirmBtn.onclick = async () => {
            if (onConfirm) {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';
                try {
                    await onConfirm();
                    close();
                } catch (err) {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = confirmText;
                }
            } else {
                close();
            }
        };
    },

    close() {
        const container = document.getElementById('modal-container');
        if (container) container.innerHTML = '';
    }
};
