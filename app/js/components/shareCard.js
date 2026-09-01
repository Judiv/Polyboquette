/**
 * PolyBoquette - Share Card Generator (HTML5 Canvas)
 * Génère une image stylisée aux couleurs de PolyBoquette
 * pour partage sur Discord, WhatsApp, Instagram...
 */

import { esc, formatPoints, formatOdds } from '../utils.js';
import { modal } from './modal.js';

export const shareCard = {
    generateAndShow({ userName, marketTitle, optionLabel, optionColor, amount, decimalOdds, probPercent, potentialGain }) {
        const modalContent = `
            <div style="text-align:center;">
                <p style="color:var(--text-secondary); margin-bottom:1rem; font-size:0.9rem;">
                    Partagez votre prédiction avec votre promo ou sur Discord !
                </p>
                <div style="background:#0a0a0a; border-radius:16px; padding:12px; display:inline-block; max-width:100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <canvas id="shareCanvas" width="600" height="340" style="width:100%; max-width:480px; height:auto; border-radius:12px; display:block;"></canvas>
                </div>
                <div style="margin-top:1.25rem; display:flex; justify-content:center; gap:0.75rem;">
                    <button class="btn-primary" id="downloadShareCardBtn">
                        <i class="fa-solid fa-download"></i> Télécharger l'image
                    </button>
                    <button class="btn-outline" id="copyShareLinkBtn">
                        <i class="fa-solid fa-link"></i> Copier le lien
                    </button>
                </div>
            </div>
        `;

        modal.show({
            title: "🎉 Partager mon Pari",
            content: modalContent,
            confirmText: "Fermer",
            cancelText: "",
            onConfirm: () => {}
        });

        // Dessin du Canvas
        setTimeout(() => {
            const canvas = document.getElementById('shareCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;

            // Fond dégradé sombre et grenat
            const bgGrad = ctx.createLinearGradient(0, 0, w, h);
            bgGrad.addColorStop(0, '#121212');
            bgGrad.addColorStop(0.6, '#1e1014');
            bgGrad.addColorStop(1, '#800000');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, w, h);

            // Cercles lumineux décoratifs
            ctx.save();
            ctx.fillStyle = 'rgba(156, 39, 65, 0.25)';
            ctx.beginPath();
            ctx.arc(w - 50, 50, 140, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Bordure
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.strokeRect(10, 10, w - 20, h - 20);

            // Header : Logo texte & Badge
            ctx.font = 'bold 22px Inter, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('POLYBOQUETTE', 35, 50);

            ctx.font = '13px Inter, sans-serif';
            ctx.fillStyle = '#ff8fa3';
            ctx.fillText('MARCHÉS PRÉDICTIFS', 35, 70);

            // Nom du joueur
            ctx.fillStyle = '#a0a0a0';
            ctx.font = '14px Inter, sans-serif';
            ctx.fillText(`Pari placé par`, 35, 115);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Inter, sans-serif';
            ctx.fillText(userName || 'Un Gadzarts', 35, 138);

            // Titre du marché (tronqué avec ellipses si trop long)
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Inter, sans-serif';
            let title = marketTitle;
            if (title.length > 45) title = title.substring(0, 42) + '...';
            ctx.fillText(title, 35, 185);

            // Carte de l'option choisie
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.beginPath();
            ctx.roundRect(35, 210, w - 70, 95, 12);
            ctx.fill();

            // Indicateur couleur de l'option
            ctx.fillStyle = optionColor || '#22c55e';
            ctx.beginPath();
            ctx.arc(60, 245, 10, 0, Math.PI * 2);
            ctx.fill();

            // Libellé de l'option + Probabilité
            ctx.font = 'bold 20px Inter, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${optionLabel} (${probPercent}%)`, 80, 252);

            // Cote et Mise
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = '#d0d0d0';
            ctx.fillText(`Mise : ${formatPoints(amount)} pts`, 60, 285);

            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.fillStyle = '#22c55e';
            ctx.fillText(`Gain max : ~${formatPoints(potentialGain)} pts (Cote x${formatOdds(decimalOdds)})`, 240, 285);

            // Listener Téléchargement
            const dlBtn = document.getElementById('downloadShareCardBtn');
            if (dlBtn) {
                dlBtn.onclick = () => {
                    const link = document.createElement('a');
                    link.download = `PolyBoquette-Pari-${Date.now()}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                };
            }

            // Listener Copie lien
            const copyBtn = document.getElementById('copyShareLinkBtn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(window.location.href);
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Lien copié !';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fa-solid fa-link"></i> Copier le lien';
                    }, 2000);
                };
            }
        }, 50);
    }
};
