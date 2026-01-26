export class UIManager {
    constructor() {
        // Cache de Elementos DOM (Melhora performance no mobile)
        this.screens = {
            lobby: document.getElementById('lobby-overlay'),
            hud: document.getElementById('rpg-hud'),
            faint: document.getElementById('faint-screen'),
            chatBtn: document.getElementById('chat-toggle-btn'),
            canvas: document.getElementById('gameCanvas')
        };

        this.hudElements = {
            name: document.getElementById('hud-name'),
            coords: document.getElementById('hud-coords'),
            lvl: document.getElementById('hud-lvl'),
            hpBar: document.getElementById('bar-hp-fill'),
            hpText: document.getElementById('bar-hp-text'),
            xpBar: document.getElementById('bar-xp-fill'),
            xpText: document.getElementById('bar-xp-text'),
            pollenBar: document.getElementById('bar-pollen-fill'),
            pollenText: document.getElementById('bar-pollen-text'),
            rankingList: document.getElementById('ranking-list')
        };

        this.modals = {
            player: document.getElementById('player-modal'),
            playerName: document.getElementById('modal-player-name'),
            playerInfo: document.getElementById('modal-player-info'),
            partyBtn: document.getElementById('btn-party-action'),
            invitePopup: document.getElementById('party-invite-popup'),
            inviteMsg: document.getElementById('invite-msg'),
            statusMsg: document.getElementById('status-msg')
        };

        this.suffocationOverlay = document.getElementById('suffocation-overlay');
    }

    // --- GERENCIAMENTO DE TELAS ---

    showGameInterface() {
        this.screens.lobby.style.display = 'none';
        this.screens.hud.style.display = 'block';
        this.screens.chatBtn.style.display = 'block';
        this.screens.canvas.style.display = 'block';
    }

    showFaintScreen() {
        this.screens.faint.style.display = 'flex';
    }

    hideFaintScreen() {
        this.screens.faint.style.display = 'none';
    }

    updateSuffocation(hpRatio) {
        if (this.suffocationOverlay) {
            this.suffocationOverlay.style.opacity = hpRatio < 0.7 ? (0.7 - hpRatio) * 1.4 : 0;
        }
    }

    displayStatus(msg) {
        if (this.modals.statusMsg) this.modals.statusMsg.innerText = msg;
    }

    // --- ATUALIZAÇÃO DO HUD ---

    /**
     * Atualiza todas as barras e textos do HUD baseado no estado do jogador local.
     * @param {Player} player 
     */
    updateStats(player) {
        if (!player) return;

        // Textos Básicos
        this.hudElements.name.innerText = player.nickname;
        this.hudElements.lvl.innerText = player.level;
        
        // Coordenadas (Otimizado no GameManager, aqui só exibe)
        const gx = Math.round(player.pos.x);
        const gy = Math.round(player.pos.y);
        this.hudElements.coords.innerText = `${gx}, ${gy}`;

        // Barra HP
        const hpPct = (player.hp / player.maxHp) * 100;
        this.hudElements.hpBar.style.width = `${hpPct}%`;
        this.hudElements.hpText.innerText = `${Math.ceil(player.hp)}/${player.maxHp}`;

        // Barra XP
        const xpPct = (player.xp / player.maxXp) * 100;
        this.hudElements.xpBar.style.width = `${xpPct}%`;
        this.hudElements.xpText.innerText = `${Math.floor(player.xp)}/${player.maxXp}`;

        // Barra Pólen
        const pollenPct = (player.pollen / player.maxPollen) * 100;
        this.hudElements.pollenBar.style.width = `${pollenPct}%`;
        this.hudElements.pollenText.innerText = `${player.pollen}/${player.maxPollen}`;

        // Efeito visual de cura ativa
        const dist = player.homeBase ? Math.sqrt(
            Math.pow(player.pos.x - player.homeBase.x, 2) + 
            Math.pow(player.pos.y - player.homeBase.y, 2)
        ) : 0;
        
        this.screens.hud.classList.toggle('healing-active', dist <= 3.5 && player.hp < player.maxHp);
    }

    /**
     * Renderiza a lista de ranking.
     * @param {Array} sortedPlayers - Array de objetos {nickname, tilesCured, isOnline}
     */
    updateRanking(sortedPlayers) {
        this.hudElements.rankingList.innerHTML = '';
        
        sortedPlayers.slice(0, 5).forEach((p, index) => {
            const div = document.createElement('div');
            div.className = 'rank-item';
            div.innerHTML = `<span>${index + 1}. ${p.nickname} ${p.isOnline ? '●' : ''}</span><span class="rank-val">${p.tilesCured}</span>`;
            this.hudElements.rankingList.appendChild(div);
        });
    }

    // --- MODAIS E POPUPS ---

    openPlayerModal(nickname, level, isPartner) {
        this.modals.playerName.innerText = nickname;
        this.modals.playerInfo.innerText = `Nível: ${level}`;
        
        if (isPartner) {
            this.modals.partyBtn.innerText = "Sair da Party";
            this.modals.partyBtn.style.background = "#e74c3c";
        } else {
            this.modals.partyBtn.innerText = "Convidar para Party";
            this.modals.partyBtn.style.background = "#f1c40f";
        }
        
        this.modals.player.style.display = 'block';
    }

    closePlayerModal() {
        this.modals.player.style.display = 'none';
    }

    showPartyInvite(fromNick) {
        this.modals.inviteMsg.innerText = `${fromNick} convidou você para o grupo!`;
        this.modals.invitePopup.style.display = 'block';
    }

    closePartyInvite() {
        this.modals.invitePopup.style.display = 'none';
    }
}
