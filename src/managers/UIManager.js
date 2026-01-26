export class UIManager {
    constructor() {
        // Cache de elementos do HUD
        this.hud = document.getElementById('rpg-hud');
        this.bars = {
            hp: document.getElementById('bar-hp-fill'),
            xp: document.getElementById('bar-xp-fill'),
            pollen: document.getElementById('bar-pollen-fill'),
            hpText: document.getElementById('bar-hp-text'),
            xpText: document.getElementById('bar-xp-text'),
            pollenText: document.getElementById('bar-pollen-text')
        };
        this.stats = {
            name: document.getElementById('hud-name'),
            lvl: document.getElementById('hud-lvl'),
            coords: document.getElementById('hud-coords')
        };

        // Overlays e Telas
        this.lobby = document.getElementById('lobby-overlay');
        this.faintScreen = document.getElementById('faint-screen');
        this.suffocation = document.getElementById('suffocation-overlay');
        
        // Modais e Popups
        this.playerModal = document.getElementById('player-modal');
        this.partyInvite = document.getElementById('party-invite-popup');
        this.rankingList = document.getElementById('ranking-list');
    }

    /**
     * Mostra a interface do jogo e esconde o menu inicial
     */
    showGameInterface() {
        if (this.lobby) this.lobby.style.display = 'none';
        if (this.hud) this.hud.style.display = 'block';
        // Mostra o canvas (o gameCanvas está no seu HTML como display:none)
        const canvas = document.getElementById('gameCanvas');
        if (canvas) canvas.style.display = 'block';
        
        // Ativa o botão do chat
        const chatBtn = document.getElementById('chat-toggle-btn');
        if (chatBtn) chatBtn.style.display = 'block';
    }

    /**
     * Atualiza todas as informações do jogador local no HUD
     */
    updateStats(player) {
        if (!player) return;

        // Texto
        if (this.stats.name) this.stats.name.innerText = player.nickname;
        if (this.stats.lvl) this.stats.lvl.innerText = player.level;
        if (this.stats.coords) {
            this.stats.coords.innerText = `${Math.round(player.pos.x)}, ${Math.round(player.pos.y)}`;
        }

        // Barras (%)
        if (this.bars.hp) this.bars.hp.style.width = `${(player.hp / player.maxHp) * 100}%`;
        if (this.bars.xp) this.bars.xp.style.width = `${(player.xp / player.maxXp) * 100}%`;
        if (this.bars.pollen) this.bars.pollen.style.width = `${(player.pollen / player.maxPollen) * 100}%`;

        // Textos das Barras (Ex: 80/100)
        if (this.bars.hpText) this.bars.hpText.innerText = `${Math.ceil(player.hp)}/${player.maxHp}`;
        if (this.bars.xpText) this.bars.xpText.innerText = `${Math.floor(player.xp)}/${player.maxXp}`;
        if (this.bars.pollenText) this.bars.pollenText.innerText = `${player.pollen}/${player.maxPollen}`;
    }

    /**
     * Efeito visual de sufocamento (vinheta vermelha/preta)
     */
    updateSuffocation(hpPercent) {
        if (!this.suffocation) return;
        // Começa a aparecer quando HP < 50%
        const intensity = Math.max(0, (0.5 - hpPercent) * 2);
        this.suffocation.style.opacity = intensity;
    }

    /**
     * Atualiza a lista de classificação de curadores
     */
    updateRanking(playersArray) {
        if (!this.rankingList) return;
        
        // playersArray esperado: [{nickname, tilesCured, isOnline}...]
        this.rankingList.innerHTML = playersArray.map((p, index) => `
            <div class="rank-item" style="opacity: ${p.isOnline ? 1 : 0.5}">
                <span>${index + 1}. ${p.nickname} ${p.isOnline ? '' : '(OFF)'}</span>
                <span style="color:var(--primary)">${p.tilesCured}🌻</span>
            </div>
        `).join('');
    }

    // --- CONTROLE DE TELAS ---

    displayStatus(msg) {
        const statusEl = document.getElementById('status-msg');
        if (statusEl) statusEl.innerText = msg;
    }

    showFaintScreen() {
        if (this.faintScreen) {
            this.faintScreen.style.display = 'flex';
            this.faintScreen.style.opacity = '1';
        }
    }

    hideFaintScreen() {
        if (this.faintScreen) this.faintScreen.style.display = 'none';
    }

    // --- MODAIS ---

    openPlayerModal(nickname, level, isPartner) {
        if (!this.playerModal) return;
        document.getElementById('modal-player-name').innerText = nickname;
        document.getElementById('modal-player-info').innerText = `Nível: ${level}`;
        
        const partyBtn = document.getElementById('btn-party-action');
        if (partyBtn) {
            partyBtn.innerText = isPartner ? "SAIR DO GRUPO" : "CONVIDAR";
            partyBtn.style.background = isPartner ? "var(--danger)" : "var(--primary)";
        }

        this.playerModal.style.display = 'block';
    }

    closePlayerModal() {
        if (this.playerModal) this.playerModal.style.display = 'none';
    }

    showPartyInvite(fromNick, fromId) {
        if (!this.partyInvite) return;
        document.getElementById('invite-msg').innerText = `CONVITE DE ${fromNick.toUpperCase()}`;
        this.partyInvite.style.display = 'block';
    }

    closePartyInvite() {
        if (this.partyInvite) this.partyInvite.style.display = 'none';
    }
}
