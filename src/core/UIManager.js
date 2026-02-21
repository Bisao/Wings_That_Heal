/**
 * UIManager.js
 * Gerencia a Interface do Usuário, Notificações e Feedback Visual.
 * Atualizado para suportar a renderização do Gerenciador de Colmeias (Saves) e feedback profissional.
 */
export class UIManager {
    constructor() {
        // Nomes dos meses para o relógio do jogo
        this.months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
        this.toastTimeout = null;
    }

    /**
     * Exibe notificações temporárias no topo da tela.
     * @param {string} msg - Texto da mensagem.
     * @param {string} type - Tipo da mensagem: 'error', 'success', 'info'.
     */
    showToast(msg, type = 'info') {
        const toast = document.getElementById('toast-msg');
        if (!toast) return;

        toast.innerText = msg;
        
        // Define cores baseadas no tipo de mensagem
        if (type === 'error') {
            toast.style.background = "linear-gradient(135deg, #e74c3c, #c0392b)"; // Vermelho
            toast.style.color = "white";
        } else if (type === 'success') {
            toast.style.background = "linear-gradient(135deg, #2ecc71, #27ae60)"; // Verde
            toast.style.color = "white";
        } else {
            toast.style.background = "linear-gradient(135deg, #FFD700, #F39C12)"; // Amarelo (Padrão)
            toast.style.color = "#222";
        }

        toast.style.opacity = "1";
        toast.style.transform = "translateX(-50%) translateY(0)"; // Efeito de descida

        // Limpa timeout anterior para evitar conflitos
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        
        this.toastTimeout = setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(-50%) translateY(-20px)"; // Efeito de subida
        }, 3000);
    }

    // Mantém compatibilidade com chamadas antigas de showError
    showError(msg) {
        this.showToast(msg, 'error');
    }

    /**
     * Atualiza todas as informações do HUD (Barra de Status, Nível, Nome).
     * @param {Object} localPlayer - O objeto do jogador local.
     */
    updateHUD(localPlayer) {
        if (!localPlayer) return;

        // Atualiza Texto de Nome e Nível
        const nameEl = document.getElementById('hud-name');
        const lvlEl = document.getElementById('hud-lvl');
        
        if (nameEl) nameEl.innerText = localPlayer.nickname;
        if (lvlEl) lvlEl.innerText = localPlayer.level;

        // Atualiza Barras
        this._updateBar('bar-hp-fill', 'bar-hp-text', localPlayer.hp, localPlayer.maxHp);
        this._updateBar('bar-xp-fill', 'bar-xp-text', localPlayer.xp, localPlayer.maxXp);
        this._updateBar('bar-pollen-fill', 'bar-pollen-text', localPlayer.pollen, localPlayer.maxPollen);

        // Feedback visual crítico (Tela vermelha se HP baixo)
        const hpRatio = localPlayer.hp / localPlayer.maxHp;
        const lowHpOverlay = document.getElementById('suffocation-overlay');
        if (lowHpOverlay) {
            if (hpRatio < 0.3) {
                lowHpOverlay.style.opacity = (0.3 - hpRatio) * 2; // Fica mais vermelho conforme morre
            } else {
                lowHpOverlay.style.opacity = 0;
            }
        }
    }

    /**
     * Função auxiliar interna para animar as barras de progresso.
     */
    _updateBar(fillId, textId, current, max) {
        const fill = document.getElementById(fillId);
        const text = document.getElementById(textId);
        
        if (fill) {
            // Garante porcentagem válida entre 0% e 100%
            const pct = Math.max(0, Math.min(100, (current / max) * 100));
            fill.style.width = `${pct}%`;
        }
        
        if (text) {
            text.innerText = `${Math.floor(current)}/${Math.floor(max)}`;
        }
    }

    /**
     * Atualiza o Relógio do Mundo e o efeito de Dia/Noite.
     * @param {number} worldTime - Timestamp do mundo.
     */
    updateEnvironment(worldTime) {
        if (!worldTime) return;
        
        const date = new Date(worldTime);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const month = this.months[date.getMonth()];

        // Atualiza Relógio
        const timeEl = document.getElementById('hud-time');
        if (timeEl) {
            if (timeEl.style.display === 'none') timeEl.style.display = 'block';
            timeEl.innerText = `${day} ${month} - ${hours}:${minutes}`;
        }

        // Lógica Dia/Noite (Senoide)
        const h = date.getHours() + date.getMinutes() / 60;
        
        // Fórmula: Cos((h / 24) * 2PI). 
        // Em h=0 -> Cos(0)=1 (Escuro). Em h=12 -> Cos(PI)=-1 (Claro).
        let darknessIntensity = (Math.cos(h / 24 * Math.PI * 2) + 1) / 2;
        
        // Ajuste fino para o amanhecer/anoitecer ser mais rápido
        darknessIntensity = Math.pow(darknessIntensity, 0.5);

        const overlay = document.getElementById('day-night-overlay');
        if (overlay) {
            // Limita a escuridão máxima a 85%
            overlay.style.opacity = darknessIntensity * 0.85;
            
            // Muda a cor do relógio para contraste
            if (timeEl) {
                timeEl.style.color = darknessIntensity > 0.5 ? "#f1c40f" : "#333";
                timeEl.style.textShadow = darknessIntensity > 0.5 ? "0 0 5px black" : "none";
                timeEl.style.background = darknessIntensity > 0.5 ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.6)";
            }
        }
    }

    /**
     * Atualiza o Ranking de "Top Curadores".
     * Combina dados salvos (offline) com dados ao vivo (online).
     */
    updateRanking(guestDataDB, localPlayer, remotePlayers) {
        // 1. Converte o DB de convidados em array
        let rankingData = Object.entries(guestDataDB || {}).map(([nick, stats]) => ({
            nick: nick,
            score: stats.tilesCured || 0
        }));

        // 2. Atualiza ou Adiciona o Player Local
        if (localPlayer) {
            const localIdx = rankingData.findIndex(r => r.nick === localPlayer.nickname);
            if (localIdx !== -1) {
                // Usa o maior valor entre o salvo e o atual
                rankingData[localIdx].score = Math.max(rankingData[localIdx].score, localPlayer.tilesCured);
            } else {
                rankingData.push({ nick: localPlayer.nickname, score: localPlayer.tilesCured });
            }
        }

        // 3. Atualiza ou Adiciona Players Remotos (Online agora)
        Object.values(remotePlayers).forEach(p => {
            if (!p.nickname) return;
            const idx = rankingData.findIndex(r => r.nick === p.nickname);
            if (idx !== -1) {
                rankingData[idx].score = Math.max(rankingData[idx].score, p.tilesCured);
            } else {
                rankingData.push({ nick: p.nickname, score: p.tilesCured });
            }
        });

        // 4. Ordena Decrescente e Renderiza
        rankingData.sort((a, b) => b.score - a.score);
        
        const miniList = document.getElementById('ranking-list');
        const container = document.getElementById('ranking-container');

        if (miniList && container) {
            if (rankingData.length > 0) {
                container.style.display = 'block';
                const top3 = rankingData.slice(0, 5); // Mostra Top 5
                
                miniList.innerHTML = top3.map((p, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const prefix = index < 3 ? medals[index] : `<span style="opacity:0.7; font-size:10px;">#${index+1}</span>`;
                    const isMe = localPlayer && p.nick === localPlayer.nickname;
                    
                    return `
                        <div class="rank-item" style="${isMe ? 'color:#f1c40f; font-weight:900; background:rgba(255,255,255,0.1); border-radius:4px; padding:2px;' : ''}">
                            <span style="display:flex; gap:5px; align-items:center;">${prefix} ${p.nick}</span>
                            <b style="color:${isMe ? '#f1c40f' : '#2ecc71'}">${p.score}</b>
                        </div>
                    `;
                }).join('');
            } else {
                container.style.display = 'none';
            }
        }
    }

    /**
     * Exibe coordenadas para debug (canto inferior direito).
     */
    updateCoords(x, y) {
        const el = document.getElementById('hud-coords');
        if(el) {
            el.style.display = 'block';
            el.innerText = `POS: ${Math.round(x)}, ${Math.round(y)}`;
        }
    }

    /**
     * Renderiza a lista de colmeias salvas no modal de Carregar.
     * @param {Object} saveSystem - Instância do SaveSystem.
     * @param {Function} onEnterWorld - Callback chamado ao clicar em "VOAR" (recebe: id, pass, seed, nick).
     */
    renderSaveList(saveSystem, onEnterWorld) {
        const container = document.getElementById('save-list-container');
        if (!container) return;

        const saves = saveSystem.listAllSaves();

        if (saves.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #aaa; font-size: 14px; margin-top: 20px;">Nenhuma colmeia encontrada no vazio...</p>';
            return;
        }

        container.innerHTML = ''; // Limpa a lista atual

        saves.forEach(save => {
            const dateStr = new Date(save.timestamp).toLocaleDateString();
            const timeStr = new Date(save.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const card = document.createElement('div');
            card.className = 'save-card';
            
            // Construção do HTML interno do Card com metadados
            card.innerHTML = `
                <div class="save-card-header">
                    <div>
                        <div class="save-card-title">${save.id}</div>
                        <div class="save-card-subtitle">Último voo: ${dateStr} às ${timeStr}</div>
                    </div>
                    <button class="btn-delete-save" title="Destruir Colmeia">🗑️</button>
                </div>
                <div class="save-card-details">
                    <div class="save-detail-row">
                        <span>Abelha Mestra:</span> 
                        <span class="save-detail-val" style="color:var(--primary); font-weight:bold;">${save.meta.nick} (Lv ${save.meta.level})</span>
                    </div>
                    <div class="save-detail-row">
                        <span>Semente do Mundo:</span> 
                        <span class="save-detail-val">${save.meta.seed}</span>
                    </div>
                    <div class="save-detail-row">
                        <span>Senha:</span>
                        <div>
                            <span class="save-detail-val pass-text" data-hidden="true" data-pass="${save.meta.pass || ''}">${save.meta.pass ? '****' : 'Aberta (Sem Senha)'}</span>
                            ${save.meta.pass ? '<span class="pass-toggle" onclick="toggleSavePassword(this)" title="Mostrar/Esconder">👁️</span>' : ''}
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <button class="btn-action btn-load-save" style="margin:0; width:100%;">VOAR</button>
                    </div>
                </div>
            `;

            // EVENTO 1: Expandir / Retrair o card
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-save') || e.target.closest('.btn-load-save') || e.target.closest('.pass-toggle')) {
                    return;
                }
                document.querySelectorAll('.save-card').forEach(c => {
                    if (c !== card) c.classList.remove('expanded');
                });
                card.classList.toggle('expanded');
            });

            // EVENTO 2: Botão VOAR (Carregar Mundo)
            const btnLoad = card.querySelector('.btn-load-save');
            btnLoad.addEventListener('click', () => {
                if (onEnterWorld && typeof onEnterWorld === 'function') {
                    onEnterWorld(save.id, save.meta.pass, save.meta.seed, save.meta.nick);
                }
            });

            // EVENTO 3: Lixeira (Excluir Mundo)
            const btnDelete = card.querySelector('.btn-delete-save');
            btnDelete.addEventListener('click', () => {
                const popup = document.getElementById('delete-confirm-popup');
                const btnConfirm = document.getElementById('btn-confirm-delete');
                
                if (popup && btnConfirm) {
                    popup.style.display = 'flex';
                    btnConfirm.onclick = () => {
                        saveSystem.deleteSave(save.id);
                        this.showToast(`Colmeia ${save.id} destruída.`, 'success');
                        popup.style.display = 'none';
                        this.renderSaveList(saveSystem, onEnterWorld);
                    };
                }
            });

            container.appendChild(card);
        });
    }
}

