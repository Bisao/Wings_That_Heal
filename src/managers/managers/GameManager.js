import { WorldGenerator } from '../world/worldGen.js';
import { Player } from '../entities/player.js';

const CONFIG = {
    ZOOM: { MIN: 0.5, MAX: 1.5, DEFAULT: 1.0 },
    PLANT_SPAWN_CHANCE: 0.015,
    CURE_ATTEMPT_RATE: 15,
    COLLECTION_RATE: 5,
    DAMAGE: { RATE: 2, AMOUNT: 0.25 },
    XP: { PER_CURE: 20, PER_POLLEN: 0.5, PASSIVE_CURE: 5 },
    GROWTH: { BROTO: 5000, MUDA: 10000, FLOR: 15000 }
};

export class GameManager {
    constructor(netManager, inputHandler, worldState, saveSystem, chatSystem, uiManager) {
        this.net = netManager;
        this.input = inputHandler;
        this.worldState = worldState;
        this.saveSystem = saveSystem;
        this.chat = chatSystem;
        this.ui = uiManager;

        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.world = null;
        this.localPlayer = null;
        this.remotePlayers = {};
        this.camera = { x: 0, y: 0 };
        this.zoomLevel = CONFIG.ZOOM.DEFAULT;
        
        this.isRunning = false;
        this.isFainted = false;
        this.currentPartyPartner = null;
        this.pendingInviteFrom = null;
        this.guestDataDB = {};

        this.counters = { collection: 0, cure: 0, damage: 0, uiUpdate: 0 };

        this.assets = { flower: new Image() };
        this.assets.flower.src = 'assets/Flower.png';

        this.initListeners();
    }

    initListeners() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('netData', (e) => this.handleNetData(e.detail));
        window.addEventListener('peerDisconnected', (e) => this.handlePeerDisconnect(e.detail));
        window.addEventListener('joined', (e) => this.onJoinedRoom(e.detail));
        window.addEventListener('chatSend', (e) => this.handleChatSend(e.detail));
        this.resize();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    // --- CICLO DE INÍCIO ---

    startGame(seed, id, nick, isHost = false) {
        this.ui.showGameInterface();
        this.world = new WorldGenerator(seed);
        this.localPlayer = new Player(id, nick, true);
        
        // Define ponto de nascimento baseado na seed/id
        const hives = this.world.getHiveLocations();
        const spawn = isHost ? hives[0] : hives[1 % hives.length];
        this.localPlayer.homeBase = { x: spawn.x, y: spawn.y };
        this.localPlayer.pos = { x: spawn.x, y: spawn.y };

        if (isHost) {
            const saved = this.saveSystem.load();
            if (saved) {
                this.worldState.applyFullState(saved.world);
                this.localPlayer.deserialize({ stats: saved.host });
                this.guestDataDB = saved.guests || {};
            }
            this.startHostSimulation();
        }

        this.isRunning = true;
        requestAnimationFrame(() => this.loop());
    }

    onJoinedRoom(data) {
        const myNick = document.getElementById('join-nickname').value.trim() || "Zangão";
        this.worldState.applyFullState(data.worldState);
        this.guestDataDB = data.guests || {};
        this.startGame(data.seed, this.net.peer.id, myNick, false);
        if (data.playerData) this.localPlayer.deserialize(data.playerData);
    }

    // --- LOOP PRINCIPAL ---

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        if (!this.localPlayer || this.isFainted) return;

        const move = this.input.getMovement();
        this.localPlayer.update(move);

        if (move.x !== 0 || move.y !== 0) {
            this.localPlayer.pos.x += move.x * this.localPlayer.speed;
            this.localPlayer.pos.y += move.y * this.localPlayer.speed;
            
            // Avisar rede
            this.net.sendPayload({
                type: 'MOVE',
                x: this.localPlayer.pos.x,
                y: this.localPlayer.pos.y,
                dir: this.localPlayer.currentDir,
                stats: this.localPlayer.serialize().stats
            });
        }

        this.camera = { x: this.localPlayer.pos.x, y: this.localPlayer.pos.y };
        this.checkInteractions();
    }

    checkInteractions() {
        const gx = Math.round(this.localPlayer.pos.x);
        const gy = Math.round(this.localPlayer.pos.y);
        const tile = this.worldState.getModifiedTile(gx, gy) || this.world.getTileAt(gx, gy);

        // 1. Dano por Poluição
        const isSafe = ['GRAMA_SAFE', 'GRAMA', 'COLMEIA', 'FLOR', 'BROTO', 'MUDA'].includes(tile);
        if (!isSafe) {
            this.counters.damage++;
            if (this.counters.damage >= CONFIG.DAMAGE.RATE) {
                this.localPlayer.hp -= CONFIG.DAMAGE.AMOUNT;
                this.counters.damage = 0;
                if (this.localPlayer.hp <= 0) this.faint();
            }
        }
        this.ui.updateSuffocation(this.localPlayer.hp / this.localPlayer.maxHp);

        // 2. Coleta de Pólen
        if (tile === 'FLOR' && this.localPlayer.pollen < this.localPlayer.maxPollen) {
            if (++this.counters.collection >= CONFIG.COLLECTION_RATE) {
                this.localPlayer.pollen++;
                this.counters.collection = 0;
                this.ui.updateStats(this.localPlayer);
            }
        }

        // 3. Cura de Terra
        if (tile === 'TERRA_QUEIMADA' && this.localPlayer.pollen > 0) {
            if (++this.counters.cure >= CONFIG.CURE_ATTEMPT_RATE) {
                this.localPlayer.pollen--;
                this.counters.cure = 0;
                if (Math.random() < CONFIG.PLANT_SPAWN_CHANCE) {
                    this.requestTileChange(gx, gy, 'GRAMA');
                    this.localPlayer.tilesCured++;
                    this.gainXP(CONFIG.XP.PER_CURE);
                }
                this.ui.updateStats(this.localPlayer);
            }
        }

        // 4. Cura na Colmeia
        if (tile === 'COLMEIA' && this.localPlayer.hp < this.localPlayer.maxHp) {
            this.localPlayer.hp = Math.min(this.localPlayer.maxHp, this.localPlayer.hp + 0.5);
            this.ui.updateStats(this.localPlayer);
        }

        this.ui.updateStats(this.localPlayer);
    }

    // --- COMANDOS E REDE ---

    handleChatSend(data) {
        if (data.type === 'SYSTEM') return;
        this.net.sendPayload({
            type: data.type === 'GLOBAL' ? 'CHAT_MSG' : 'PARTY_MSG',
            nick: this.localPlayer.nickname,
            text: data.text
        }, data.target);
    }

    handleNetData(data) {
        if (data.type === 'MOVE') {
            if (!this.remotePlayers[data.fromId]) {
                this.remotePlayers[data.fromId] = new Player(data.fromId, data.nick);
            }
            this.remotePlayers[data.fromId].deserialize(data);
        }
        if (data.type === 'TILE_CHANGE') {
            this.worldState.setTile(data.x, data.y, data.tileType);
        }
        if (data.type === 'CHAT_MSG') this.chat.addMessage('GLOBAL', data.nick, data.text);
        if (data.type === 'PARTY_INVITE') {
            this.pendingInviteFrom = data.fromId;
            this.ui.showPartyInvite(data.fromNick);
        }
        if (data.type === 'PARTY_RESCUE' && this.isFainted) {
            this.isFainted = false;
            this.localPlayer.hp = 30;
            this.ui.hideFaintScreen();
            this.chat.addMessage('SYSTEM', null, `Resgatado por ${data.fromNick}!`);
        }
    }

    requestTileChange(x, y, type) {
        this.worldState.setTile(x, y, type);
        this.net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: type });
    }

    gainXP(amt) {
        this.localPlayer.xp += amt;
        if (this.localPlayer.xp >= this.localPlayer.maxXp) {
            this.localPlayer.level++;
            this.localPlayer.xp = 0;
            this.localPlayer.maxXp *= 1.2;
            this.chat.addMessage('SYSTEM', null, `Nível aumentado para ${this.localPlayer.level}!`);
        }
    }

    faint() {
        this.isFainted = true;
        this.ui.showFaintScreen();
        if (this.currentPartyPartner) {
            this.net.sendPayload({ type: 'PARTY_MSG', fromNick: 'SINAL', text: '🆘 ESTOU CAÍDO!' }, this.currentPartyPartner);
        }
    }

    startHostSimulation() {
        setInterval(() => {
            // Lógica de crescimento das plantas no servidor (Host)
            // ... (Simulação de tempo e flores conforme worldState)
            this.saveSystem.save({
                world: this.worldState.getFullState(),
                host: this.localPlayer.serialize().stats,
                guests: this.guestDataDB
            });
        }, 10000);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const size = this.world.tileSize * this.zoomLevel;

        // Desenhar Chunks visíveis
        const startX = Math.floor(this.camera.x) - 15;
        const endX = Math.floor(this.camera.x) + 15;
        const startY = Math.floor(this.camera.y) - 10;
        const endY = Math.floor(this.camera.y) + 10;

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const type = this.worldState.getModifiedTile(x, y) || this.world.getTileAt(x, y);
                const sX = (x - this.camera.x) * size + this.canvas.width / 2;
                const sY = (y - this.camera.y) * size + this.canvas.height / 2;

                // Cores básicas por tipo
                this.ctx.fillStyle = type === 'TERRA_QUEIMADA' ? '#2c3e50' : '#27ae60';
                if (type === 'COLMEIA') this.ctx.fillStyle = '#f1c40f';
                if (type === 'FLOR') this.ctx.fillStyle = '#e91e63';
                
                this.ctx.fillRect(sX, sY, size, size);
            }
        }

        // Desenhar Jogadores
        Object.values(this.remotePlayers).forEach(p => p.draw(this.ctx, this.camera, this.canvas, size, this.currentPartyPartner));
        this.localPlayer.draw(this.ctx, this.camera, this.canvas, size, this.currentPartyPartner);
    }
}
