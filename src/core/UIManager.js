/**
 * UIManager.js
 * Gerencia a Interface do Usuário, Notificações, Feedback Visual e Configurações.
 * Atualizado para suportar Alertas Visuais de Invasão (Ciclo de 7 Dias) no Relógio,
 * com ícones dinâmicos de Sol/Lua e Feedback de Cores (Dia/Noite/Invasão).
 */
export class UIManager {
    constructor() {
        // Nomes dos meses para o relógio do jogo
        this.months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
        this.toastTimeout = null;
        this.isSettingsOpen = false;

        // Data base exata de início do mundo (Sincronizada com o START_TIME do WorldState)
        this.START_TIME = new Date('2074-02-09T06:00:00').getTime();

        // Garante que o elemento de tempo existe e está no local correto da hierarquia (Direto no Body)
        this.ensureTimeElement();

        // Inicializa a interface de configurações (Botão e Modal)
        this.initSettingsUI();

        // Escuta o evento global para abrir/fechar as configurações (disparado pelo InputHandler)
        window.addEventListener('toggleSettings', () => this.toggleSettings());
    }

    /**
     * Verifica se o elemento de data/hora existe no DOM e garante que seja filho direto do Body.
     * Injeta o estilo via JavaScript para garantir visibilidade e centralização perfeitas,
     * imunes a conflitos de CSS externo.
     */
    ensureTimeElement() {
        // INJEÇÃO DE CSS DE ALTA PERFORMANCE PARA O ALERTA (Evita lag de transição sobreposta)
        if (!document.getElementById('hud-time-styles')) {
            const style = document.createElement('style');
            style.id = 'hud-time-styles';
            style.innerHTML = `
                @keyframes pulseRedAlert {
                    0% { box-shadow: 0 0 10px rgba(255, 71, 87, 0.4); }
                    50% { box-shadow: 0 0 25px rgba(255, 71, 87, 1); }
                    100% { box-shadow: 0 0 10px rgba(255, 71, 87, 0.4); }
                }
                .horde-alert {
                    animation: pulseRedAlert 1.5s infinite ease-in-out !important;
                }
            `;
            document.head.appendChild(style);
        }

        let timeEl = document.getElementById('hud-time');
        
        if (!timeEl) {
            // Se não existe, cria e injeta no body
            timeEl = document.createElement('div');
            timeEl.id = 'hud-time';
            document.body.appendChild(timeEl);
        } else if (timeEl.parentElement !== document.body) {
            // Se existe, mas está dentro do #rpg-hud (ou outro container), movemos ele para o body
            document.body.appendChild(timeEl);
        }

        // Aplicação rigorosa de estilos in-line para garantir que nunca mais suma ou saia do centro
        timeEl.style.position = 'fixed';
        timeEl.style.top = '15px';
        timeEl.style.left = '50%';
        timeEl.style.transform = 'translateX(-50%)';
        timeEl.style.zIndex = '99999';
        timeEl.style.padding = '6px 15px';
        timeEl.style.borderRadius = '20px';
        timeEl.style.fontWeight = '900';
        timeEl.style.fontSize = '14px';
        timeEl.style.border = '2px solid rgba(255, 215, 0, 0.3)';
        timeEl.style.pointerEvents = 'none'; // Impede que roube cliques do jogo
        timeEl.style.whiteSpace = 'nowrap';
        // Especifica apenas as propriedades seguras para transição (não "all") para não conflitar com a animação de box-shadow
        timeEl.style.transition = 'color 0.5s ease, background 0.5s ease, border-color 0.5s ease'; 
        timeEl.style.boxShadow = '0 4px 6px rgba(0,0,0,0.5)';
        
        // Texto provisório para evitar que fique invisível até o servidor mandar a primeira hora
        if (!timeEl.innerText) {
            timeEl.innerText = "Aguardando sincronização solar...";
            timeEl.style.color = "#FFD700";
            timeEl.style.background = "rgba(0,0,0,0.8)";
        }
    }

    /**
     * Exibe notificações temporárias no topo da tela.
     */
    showToast(msg, type = 'info') {
        const toast = document.getElementById('toast-msg');
        if (!toast) return;

        toast.innerText = msg;
        
        // Define cores baseadas no tipo de mensagem (Gradientes Profissionais)
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

        // Limpa timeout anterior para evitar conflitos de sobreposição
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        
        this.toastTimeout = setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(-50%) translateY(-20px)"; // Efeito de subida
        }, 3000);
    }

    showError(msg) {
        this.showToast(msg, 'error');
    }

    updateHUD(localPlayer) {
        if (!localPlayer) return;

        // Atualiza Texto do Nome
        const nameEl = document.getElementById('hud-name');
        if (nameEl) nameEl.innerText = localPlayer.nickname;

        // Oculta completamente a informação de Level como solicitado
        const lvlEl = document.getElementById('hud-lvl');
        if (lvlEl) {
            lvlEl.style.display = 'none';
        }

        // Atualiza Barras de Status
        this._updateBar('bar-hp-fill', 'bar-hp-text', localPlayer.hp, localPlayer.maxHp);
        this._updateBar('bar-xp-fill', 'bar-xp-text', localPlayer.xp, localPlayer.maxXp);
        this._updateBar('bar-pollen-fill', 'bar-pollen-text', localPlayer.pollen, localPlayer.maxPollen);

        // Feedback visual de Dano Crítico (Vignette Vermelha)
        const hpRatio = localPlayer.hp / localPlayer.maxHp;
        const lowHpOverlay = document.getElementById('suffocation-overlay');
        if (lowHpOverlay) {
            // Começa a aparecer abaixo de 40% de vida
            if (hpRatio < 0.4) {
                lowHpOverlay.style.opacity = (0.4 - hpRatio) * 1.5; 
            } else {
                lowHpOverlay.style.opacity = 0;
            }
        }
    }

    _updateBar(fillId, textId, current, max) {
        const fill = document.getElementById(fillId);
        
        // Removemos a atualização do texto, pois os números foram ocultados no CSS
        if (fill) {
            // Garante porcentagem válida entre 0% e 100%
            const pct = Math.max(0, Math.min(100, (current / max) * 100));
            fill.style.width = `${pct}%`;
            
            // Adiciona um brilho extra se a barra estiver cheia (Pólen)
            if (fillId === 'bar-pollen-fill' && pct >= 100) {
                fill.style.boxShadow = "0 0 10px #f1c40f";
            } else {
                fill.style.boxShadow = "none";
            }
        }
    }

    /**
     * Atualiza o Relógio do Mundo, Iluminação Global e a Interface de Invasão (Dia 7).
     * @param {number} worldTime - Timestamp do servidor de tempo do mundo.
     */
    updateEnvironment(worldTime) {
        if (!worldTime) return;
        
        const date = new Date(worldTime);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        
        const displayTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const displayDate = `${String(date.getDate()).padStart(2, '0')} ${this.months[date.getMonth()]}`;

        // CÁLCULO DE DIAS DECORRIDOS E SISTEMA DE HORDAS
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysElapsed = Math.floor((worldTime - this.START_TIME) / msPerDay);
        // Considerando que o Dia 0 é o primeiro dia do jogador, a invasão ocorre quando diasElapsed for múltiplo de 7 (7, 14, 21...)
        const isHordeDay = daysElapsed > 0 && (daysElapsed % 7 === 0);
        // O Alerta vermelho começa às 09:00 e vai até meia-noite
        const isRedAlert = isHordeDay && hours >= 9;

        // Atualiza Elemento do HUD
        const timeEl = document.getElementById('hud-time');
        
        if (timeEl) {
            // LÓGICA DE ILUMINAÇÃO GLOBAL (Dia/Noite)
            const h = hours + minutes / 60;
            let darkness = (Math.cos((h / 24) * Math.PI * 2) + 1) / 2;
            darkness = Math.pow(darkness, 0.6); // Ajuste de curva exponencial

            const isNight = darkness > 0.6;
            const icon = isNight ? "🌙" : "☀️";
            
            // Renderiza o texto do relógio com o ícone no meio
            timeEl.innerText = `${displayDate} ${icon} ${displayTime}`;

            const overlay = document.getElementById('day-night-overlay');
            if (overlay) {
                overlay.style.opacity = darkness * 0.8;
            }

            // APLICAÇÃO DE ESTILOS E ALERTAS DO RELÓGIO
            if (isRedAlert) {
                // Alerta de Invasão (A partir das 09h do Dia 7)
                timeEl.style.color = "#ff4757"; // Vermelho Brilhante
                timeEl.style.background = "rgba(0,0,0,0.85)";
                timeEl.style.borderColor = "#ff4757";
                timeEl.classList.add('horde-alert'); // Ativa a animação CSS suave
                
            } else {
                timeEl.classList.remove('horde-alert'); // Remove a animação de pulso

                if (isNight) {
                    // Noite Normal
                    timeEl.style.color = "#74b9ff"; // Azul claro (Lunar)
                    timeEl.style.background = "rgba(0,0,0,0.8)";
                    timeEl.style.borderColor = "#0984e3"; // Azul escuro
                    timeEl.style.boxShadow = "0 4px 10px rgba(9, 132, 227, 0.4)";
                } else {
                    // Dia Normal
                    timeEl.style.color = "#2c3e50"; // Texto escuro para contraste
                    timeEl.style.background = "rgba(255,255,255,0.85)";
                    timeEl.style.borderColor = "#f1c40f"; // Contorno Dourado (Solar)
                    timeEl.style.boxShadow = "0 4px 10px rgba(241, 196, 15, 0.3)";
                }
            }
        }
    }

    /**
     * Atualiza o Ranking de Jogadores baseado em Tiles Curados.
     */
    updateRanking(guestDataDB, localPlayer, remotePlayers) {
        let ranking = [];

        // Adiciona dados salvos (Histórico)
        Object.entries(guestDataDB || {}).forEach(([nick, stats]) => {
            ranking.push({ nick, score: stats.tilesCured || 0, online: false });
        });

        // Adiciona/Atualiza o Player Local
        if (localPlayer) {
            const me = ranking.find(r => r.nick === localPlayer.nickname);
            if (me) {
                me.score = Math.max(me.score, localPlayer.tilesCured);
                me.online = true;
            } else {
                ranking.push({ nick: localPlayer.nickname, score: localPlayer.tilesCured, online: true });
            }
        }

        // Adiciona/Atualiza Players Remotos ativos
        Object.values(remotePlayers).forEach(p => {
            if (!p.nickname) return;
            const entry = ranking.find(r => r.nick === p.nickname);
            if (entry) {
                entry.score = Math.max(entry.score, p.tilesCured);
                entry.online = true;
            } else {
                ranking.push({ nick: p.nickname, score: p.tilesCured, online: true });
            }
        });

        ranking.sort((a, b) => b.score - a.score);
        
        const uniqueRanking = [];
        const seenNicks = new Set();
        for (const item of ranking) {
            if (!seenNicks.has(item.nick)) {
                seenNicks.add(item.nick);
                uniqueRanking.push(item);
            }
        }

        const listEl = document.getElementById('ranking-list');
        const container = document.getElementById('ranking-container');

        if (listEl && container) {
            if (uniqueRanking.length > 0) {
                container.style.display = 'block';
                listEl.innerHTML = uniqueRanking.slice(0, 5).map((p, i) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const prefix = i < 3 ? medals[i] : `<span class="rank-num">#${i+1}</span>`;
                    const isMe = localPlayer && p.nick === localPlayer.nickname;
                    
                    return `
                        <div class="rank-item ${isMe ? 'is-me' : ''}" style="${isMe ? 'color:#f1c40f; font-weight:900; background:rgba(255,255,255,0.1); border-radius:4px; padding:2px;' : ''}">
                            <div class="rank-info" style="display:flex; gap:5px; align-items:center;">
                                ${prefix} 
                                <span class="rank-nick">${p.nick}</span>
                                ${p.online ? '<span class="online-dot" style="width:8px; height:8px; background:#2ecc71; border-radius:50%; display:inline-block;"></span>' : ''}
                            </div>
                            <span class="rank-score" style="color:${isMe ? '#f1c40f' : '#2ecc71'}; font-weight:bold;">${p.score}</span>
                        </div>
                    `;
                }).join('');
            } else {
                container.style.display = 'none';
            }
        }
    }

    /**
     * Exibe coordenadas e debug de performance.
     */
    updateCoords(x, y) {
        const el = document.getElementById('hud-coords');
        if(el) {
            el.style.display = 'block';
            el.innerHTML = `COORD: <b>${Math.round(x)}</b>, <b>${Math.round(y)}</b>`;
        }
    }

    /**
     * Renderiza o Menu de Seleção de Colmeias (Saves).
     */
    renderSaveList(saveSystem, onEnterWorld) {
        const container = document.getElementById('save-list-container');
        if (!container) return;

        const saves = saveSystem.listAllSaves();

        if (saves.length === 0) {
            container.innerHTML = `
                <div class="empty-saves" style="text-align: center; color: #aaa; font-size: 14px; margin-top: 20px;">
                    <p>Nenhuma colmeia encontrada neste jardim...</p>
                    <small>Crie um novo mundo para começar!</small>
                </div>
            `;
            return;
        }

        container.innerHTML = ''; 

        saves.forEach(save => {
            const date = new Date(save.timestamp);
            const dateStr = date.toLocaleDateString();
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const card = document.createElement('div');
            card.className = 'save-card';
            
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
                        <span class="save-detail-val" style="color:var(--primary); font-weight:bold;">${save.meta.nick} (Lv ${save.meta.level || 1})</span>
                    </div>
                    <div class="save-detail-row">
                        <span>Semente do Mundo:</span> 
                        <span class="save-detail-val">${save.meta.seed}</span>
                    </div>
                    <div class="save-detail-row">
                        <span>Senha:</span>
                        <div>
                            <span class="save-detail-val pass-text" data-hidden="true" data-pass="${save.meta.pass || ''}">${save.meta.pass ? '****' : 'Aberta (Sem Senha)'}</span>
                            ${save.meta.pass ? '<span class="pass-toggle" title="Mostrar/Esconder">👁️</span>' : ''}
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <button class="btn-action btn-load-save" style="margin:0; width:100%;">ENTRAR NA COLMEIA</button>
                    </div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-save') || e.target.closest('.btn-load-save') || e.target.closest('.pass-toggle')) {
                    return;
                }
                document.querySelectorAll('.save-card').forEach(c => {
                    if (c !== card) c.classList.remove('expanded');
                });
                card.classList.toggle('expanded');
            });

            const btnLoad = card.querySelector('.btn-load-save');
            btnLoad.addEventListener('click', () => {
                if (onEnterWorld && typeof onEnterWorld === 'function') {
                    onEnterWorld(save.id, save.meta.pass, save.meta.seed, save.meta.nick);
                }
            });

            const btnDelete = card.querySelector('.btn-delete-save');
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Deseja realmente apagar a colmeia ${save.id}? Esta ação é permanente.`)) {
                    saveSystem.deleteSave(save.id);
                    this.showToast(`Colmeia ${save.id} destruída.`, 'success');
                    this.renderSaveList(saveSystem, onEnterWorld);
                }
            });

            const passToggle = card.querySelector('.pass-toggle');
            if (passToggle) {
                passToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const passText = card.querySelector('.pass-text');
                    const isHidden = passText.getAttribute('data-hidden') === 'true';
                    if (isHidden) {
                        passText.innerText = passText.getAttribute('data-pass');
                        passText.setAttribute('data-hidden', 'false');
                    } else {
                        passText.innerText = '****';
                        passText.setAttribute('data-hidden', 'true');
                    }
                });
            }

            container.appendChild(card);
        });
    }

    /**
     * Renderiza o feedback de resgate (barra de progresso sobre o aliado).
     */
    drawRescueProgress(ctx, x, y, progress) {
        const width = 40;
        const height = 6;
        const offsetX = -width / 2;
        const offsetY = -50; // Acima da cabeça da abelha

        // Fundo da barra
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(x + offsetX, y + offsetY, width, height);

        // Progresso (Verde para preenchimento)
        ctx.fillStyle = "#2ecc71";
        ctx.fillRect(x + offsetX, y + offsetY, width * progress, height);

        // Borda
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + offsetX, y + offsetY, width, height);
    }

    // ============================================================================
    // LÓGICA DO MENU DE CONFIGURAÇÕES IN-GAME E MODAL DE SAÍDA + PAINEL ADMIN
    // ============================================================================

    /**
     * NOVO: Configura o Painel Admin (Injetado dentro de initSettingsUI para o Host)
     */
    setupAdminPanel(isHost) {
        if (!isHost) return;

        const mainPanel = document.getElementById('settings-main-panel');
        if (!mainPanel || document.getElementById('admin-section')) return;

        const adminSection = document.createElement('div');
        adminSection.id = 'admin-section';
        adminSection.style.cssText = "margin-top: 20px; padding-top: 15px; border-top: 2px dashed #7f5539;";
        adminSection.innerHTML = `
            <h3 style="color: #e74c3c; font-size: 14px; margin-bottom: 15px; text-transform: uppercase;">Painel do Host 🐝</h3>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
                <button class="btn-admin-time" data-time="6" style="padding:8px; font-size:11px; background:#f1c40f; border:none; border-radius:5px; cursor:pointer; font-weight:bold; color:#000;">☀️ MANHÃ</button>
                <button class="btn-admin-time" data-time="12" style="padding:8px; font-size:11px; background:#e67e22; border:none; border-radius:5px; cursor:pointer; font-weight:bold; color:#fff;">🌞 MEIO-DIA</button>
                <button class="btn-admin-time" data-time="18" style="padding:8px; font-size:11px; background:#9b59b6; border:none; border-radius:5px; cursor:pointer; font-weight:bold; color:white;">🌅 TARDE</button>
                <button class="btn-admin-time" data-time="0" style="padding:8px; font-size:11px; background:#2c3e50; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">🌑 NOITE</button>
            </div>

            <button id="btn-admin-invasion" style="width:100%; padding:10px; background:#c0392b; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; margin-bottom:10px; font-size:12px;">🚨 INVOCAR INVASÃO</button>
            <button id="btn-admin-heal-all" style="width:100%; padding:10px; background:#27ae60; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">✨ CURA GLOBAL</button>
        `;

        // Insere o painel de admin logo antes dos botões de saída
        const btnsContainer = mainPanel.querySelector('.btn-settings-container');
        if (btnsContainer) {
            mainPanel.insertBefore(adminSection, btnsContainer);
        } else {
            mainPanel.appendChild(adminSection);
        }

        // Eventos de tempo
        adminSection.querySelectorAll('.btn-admin-time').forEach(btn => {
            btn.onclick = () => {
                const hour = parseInt(btn.getAttribute('data-time'));
                window.dispatchEvent(new CustomEvent('adminChangeTime', { detail: hour }));
                this.showToast(`Horário alterado para ${hour}:00`, 'success');
            };
        });

        // Evento de Invasão
        document.getElementById('btn-admin-invasion').onclick = () => {
            window.dispatchEvent(new CustomEvent('adminTriggerInvasion'));
            this.toggleSettings(); // Fecha para ver a confusão
        };

        // Evento de Cura Global
        document.getElementById('btn-admin-heal-all').onclick = () => {
            window.dispatchEvent(new CustomEvent('adminHealAll'));
            this.showToast("Onda de cura enviada!", "success");
        };
    }

    /**
     * Cria a UI do Modal de Configurações, Confirmação de Saída e acopla a Engrenagem no Painel do Jogador.
     */
    initSettingsUI() {
        const injectUI = () => {
            // 1. Acopla o botão de configurações DIRETAMENTE dentro do Player Badge
            const nameEl = document.getElementById('hud-name');
            if (nameEl && !document.getElementById('btn-hud-settings')) {
                const badgeContainer = nameEl.parentElement;
                
                // Força o badge container a trabalhar com flexbox para alinhamento horizontal
                badgeContainer.style.display = 'flex';
                badgeContainer.style.alignItems = 'center';
                badgeContainer.style.gap = '6px'; // Espaço sutil entre o botão e o nome

                const btn = document.createElement('button');
                btn.id = 'btn-hud-settings';
                btn.title = 'Configurações';
                btn.innerHTML = '⚙️';
                
                // Estilo transparente e limpo integrado ao badge
                btn.style.cssText = `
                    background: transparent; 
                    border: none; 
                    color: white; 
                    font-size: 16px; 
                    cursor: pointer; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    padding: 0;
                    transition: transform 0.2s;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
                `;
                
                // Injeta o botão EXATAMENTE ANTES do nome
                badgeContainer.insertBefore(btn, nameEl);

                // Varre os nós do HTML para esconder aquele texto estático "LV " se existir fora do hud-lvl
                badgeContainer.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.toUpperCase().includes('LV')) {
                        node.textContent = '';
                    }
                });

                // Animações sutis ao clicar
                btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.8) rotate(45deg)');
                btn.addEventListener('mouseup', () => btn.style.transform = 'scale(1) rotate(0deg)');
                btn.addEventListener('touchstart', () => btn.style.transform = 'scale(0.8) rotate(45deg)', {passive: true});
                btn.addEventListener('touchend', () => btn.style.transform = 'scale(1) rotate(0deg)', {passive: true});

                // Ação de clique
                btn.addEventListener('click', () => {
                    window.dispatchEvent(new CustomEvent('toggleSettings'));
                });
            }

            // 2. Cria o Modal de Configurações e o Painel de Confirmação de Saída
            if (document.getElementById('settings-modal')) return;

            const modal = document.createElement('div');
            modal.id = 'settings-modal';
            modal.style.cssText = `
                display: none;
                position: fixed;
                top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.85);
                z-index: 99999;
                justify-content: center;
                align-items: center;
                backdrop-filter: blur(5px);
            `;
            
            modal.innerHTML = `
                <div id="settings-main-panel" style="
                    background: #1a1a1a; 
                    padding: 25px; 
                    border-radius: 15px; 
                    border: 3px solid #7f5539; 
                    width: 90%; max-width: 320px; 
                    text-align: center; color: white; 
                    pointer-events: auto; 
                    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
                ">
                    <h2 style="margin-top: 0; color: #FFD700; text-transform: uppercase; font-size: 20px; letter-spacing: 1px;">Configurações</h2>
                    
                    <div style="margin: 20px 0; text-align: left;">
                        <label style="font-weight: bold; font-size: 14px; color: #ccc;">🎵 Volume da Música</label>
                        <input type="range" id="vol-music" min="0" max="1" step="0.1" value="0.5" style="width: 100%; margin-top: 10px; cursor: pointer;">
                    </div>

                    <div style="margin: 20px 0; text-align: left;">
                        <label style="font-weight: bold; font-size: 14px; color: #ccc;">🔊 Volume dos Efeitos</label>
                        <input type="range" id="vol-sfx" min="0" max="1" step="0.1" value="0.5" style="width: 100%; margin-top: 10px; cursor: pointer;">
                    </div>

                    <div class="btn-settings-container" style="display: flex; flex-direction: column; gap: 10px; margin-top: 30px;">
                        <button id="btn-settings-close" style="padding: 12px; background: #34495e; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; transition: 0.2s;">VOLTAR AO JOGO</button>
                        <button id="btn-settings-exit-trigger" style="padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; transition: 0.2s;">🚪 SALVAR E SAIR</button>
                    </div>
                </div>

                <div id="settings-confirm-panel" style="
                    display: none;
                    background: #2c1e0f; 
                    padding: 25px; 
                    border-radius: 15px; 
                    border: 3px solid #e74c3c; 
                    width: 90%; max-width: 300px; 
                    text-align: center; color: white; 
                    pointer-events: auto;
                    box-shadow: 0 10px 40px rgba(231, 76, 60, 0.4);
                ">
                    <h3 style="margin-top: 0; color: #fff; font-size: 18px; text-transform: uppercase;">Salvar Colmeia?</h3>
                    <p style="font-size: 14px; color: #bbb; margin-bottom: 25px;">Deseja realmente salvar seu progresso e retornar para o menu inicial?</p>
                    
                    <div style="display: flex; gap: 10px;">
                        <button id="btn-confirm-no" style="flex: 1; padding: 12px; background: #34495e; color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">CANCELAR</button>
                        <button id="btn-confirm-yes" style="flex: 1; padding: 12px; background: #2ecc71; color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">SIM, SALVAR</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const mainPanel = document.getElementById('settings-main-panel');
            const confirmPanel = document.getElementById('settings-confirm-panel');

            // --- Lógica de Navegação dos Modais ---
            
            // Botão "Voltar ao Jogo" no painel principal
            document.getElementById('btn-settings-close').onclick = () => this.toggleSettings();
            
            // Botão "Salvar e Sair" no painel principal -> Abre o painel de confirmação
            document.getElementById('btn-settings-exit-trigger').onclick = () => {
                mainPanel.style.display = 'none';
                confirmPanel.style.display = 'block';
            };

            // Botão "Cancelar" no painel de confirmação -> Volta para o painel principal
            document.getElementById('btn-confirm-no').onclick = () => {
                confirmPanel.style.display = 'none';
                mainPanel.style.display = 'block';
            };

            // Botão "Sim, Salvar" no painel de confirmação -> Dispara a saída real
            document.getElementById('btn-confirm-yes').onclick = () => {
                // Altera o painel para um estado de carregamento amigável
                confirmPanel.innerHTML = `
                    <div style="padding: 20px 0;">
                        <p style="color: #FFD700; font-weight: bold; font-size: 16px; margin: 0;">Salvando colmeia... 🐝</p>
                        <p style="color: #aaa; font-size: 12px; margin-top: 10px;">Aguarde o voo seguro.</p>
                    </div>
                `;
                // Dispara o evento global que o Game.js escuta para salvar com segurança
                window.dispatchEvent(new CustomEvent('requestSaveAndExit'));
            };

            // --- Lógica dos Sliders de Áudio ---
            const volMusic = document.getElementById('vol-music');
            const volSfx = document.getElementById('vol-sfx');

            // Carrega valores salvos anteriormente (se existirem)
            const savedMusic = localStorage.getItem('bgmVolume');
            const savedSfx = localStorage.getItem('sfxVolume');
            if (savedMusic !== null) volMusic.value = savedMusic;
            if (savedSfx !== null) volSfx.value = savedSfx;

            // Emite eventos quando o usuário mexe nas barras
            volMusic.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                localStorage.setItem('bgmVolume', val);
                window.dispatchEvent(new CustomEvent('bgmVolumeChange', { detail: val }));
            });

            volSfx.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                localStorage.setItem('sfxVolume', val);
                window.dispatchEvent(new CustomEvent('sfxVolumeChange', { detail: val }));
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectUI);
        } else {
            injectUI();
        }
    }

    /**
     * Alterna a visibilidade do painel de configurações.
     */
    toggleSettings() {
        const modal = document.getElementById('settings-modal');
        if (!modal) return;
        
        this.isSettingsOpen = !this.isSettingsOpen;
        modal.style.display = this.isSettingsOpen ? 'flex' : 'none';

        // Sempre que o modal for fechado, garantimos que ele resete para a tela principal
        if (!this.isSettingsOpen) {
            const mainPanel = document.getElementById('settings-main-panel');
            const confirmPanel = document.getElementById('settings-confirm-panel');
            if (mainPanel) mainPanel.style.display = 'block';
            if (confirmPanel) confirmPanel.style.display = 'none';
        }
    }
}
