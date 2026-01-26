import { WorldGenerator } from '../world/worldGen.js';
import { Player } from '../entities/player.js';

// --- CONSTANTES DE CONFIGURAÇÃO (Futuro: src/config/constants.js) ---
const CONFIG = {
    ZOOM: { MIN: 0.5, MAX: 1.5, DEFAULT: 1.0 },
    PLANT_SPAWN_CHANCE: 0.01,
    CURE_ATTEMPT_RATE: 20,
    FLOWER_COOLDOWN_TIME: 10000,
    COLLECTION_RATE: 5,
    DAMAGE: { RATE: 2, AMOUNT: 0.2 },
    XP: { PER_CURE: 15, PER_POLLEN: 0.2, PASSIVE_CURE: 5 },
    GROWTH: { BROTO: 5000, MUDA: 10000, FLOR: 15000 }
};

export class GameManager {
    /**
     * @param {NetworkManager} netManager 
     * @param {InputHandler} inputHandler 
     * @param {WorldState} worldState 
     * @param {SaveSystem} saveSystem 
     * @param {ChatSystem} chatSystem 
     */
    constructor(netManager, inputHandler, worldState, saveSystem, chatSystem) {
        // Dependências Injetadas
        this.net = netManager;
        this.input = inputHandler;
        this.worldState = worldState;
        this.saveSystem = saveSystem;
        this.chat = chatSystem;

        // Contexto de Renderização
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Estado do Jogo
        this.world = null;
        this.localPlayer = null;
        this.remotePlayers = {};
        this.camera = { x: 0, y: 0 };
        this.zoomLevel = CONFIG.ZOOM.DEFAULT;
        
        // Sistemas de Partículas
        this.pollenParticles = [];
        this.smokeParticles = [];

        // Estado Social e UI
        this.currentPartyPartner = null;
        this.guestDataDB = {}; // Ranking Cache
        this.lastGridX = -9999;
        this.lastGridY = -9999;

        // Contadores de Frame (Throttle)
        this.counters = {
            collection: 0,
            cure: 0,
            damage: 0,
            uiUpdate: 0
        };

        // Estado Local
        this.isFainted = false;
        this.faintTimeout = null;
        this.isRunning = false;

        // Assets
        this.assets = { flower: new Image() };
        this.assets.flower.src = 'assets/Flower.png';

        // Bindings para Event Listeners
        this._loop = this.loop.bind(this);
        this._resize = this.resize.bind(this);
        this._handleNetData = this.handleNetData.bind(this);
        this._handlePeerDisconnect = this.handlePeerDisconnect.bind(this);
        this._handlePlayerJoin = this.handlePlayerJoin.bind(this);

        this.initListeners();
    }

    initListeners() {
        window.addEventListener('resize', this._resize);
        window.addEventListener('netData', this._handleNetData);
        window.addEventListener('peerDisconnected', this._handlePeerDisconnect);
        window.addEventListener('joined', this._handlePlayerJoin);
        this.resize();
    }

    // --- CICLO DE VIDA ---

    /**
     * Inicia o jogo, carrega o mundo e começa o loop.
     */
    startGame(seed, id, nick, isHost = false) {
        // UI Cleanup (Idealmente isso iria para UIManager)
        document.getElementById('lobby-overlay').style.display = 'none';
        document.getElementById('rpg-hud').style.display = 'block';
        document.getElementById('chat-toggle-btn').style.display = 'block';
        this.canvas.style.display = 'block';

        // Inicialização Lógica
        this.world = new WorldGenerator(seed);
        this.localPlayer = new Player(id, nick, true);
        
        this.setupSpawnPoint(id, isHost);

        // Carregar Save se for Host
        if (isHost) {
            this.loadHostSave();
            this.startHostSimulation();
        }

        this.chat.addMessage('SYSTEM', null, `Abelha ${nick} pronta para o voo!`);
        this.updateUI();
        
        if (!this.isRunning) {
            this.isRunning = true;
            requestAnimationFrame(this._loop);
        }
    }

    setupSpawnPoint(id, isHost) {
        const hives = this.world.getHiveLocations();
        // Sincronização determinística de spawn baseada no ID
        let spawnIdx = isHost ? 0 : (Math.abs(id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % (hives.length-1)) + 1;

        if (hives[spawnIdx]) {
            this.localPlayer.homeBase = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
            this.localPlayer.pos = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
            this.localPlayer.targetPos = { ...this.localPlayer.pos };

            // Host cria a primeira flor para garantir gameplay inicial
            if (isHost) {
                const fx = Math.round(this.localPlayer.pos.x + 2);
                const fy = Math.round(this.localPlayer.pos.y + 2);
                this.changeTile(fx, fy, 'GRAMA');
                setTimeout(() => this.changeTile(fx, fy, 'FLOR'), 1000);
            }

            // Notifica rede
            this.net.sendPayload({ 
                type: 'SPAWN_INFO', 
                id: this.localPlayer.id, 
                nick: this.localPlayer.nickname, 
                x: this.localPlayer.pos.x, 
                y: this.localPlayer.pos.y 
            });
        }
    }

    loadHostSave() {
        const saved = this.saveSystem.load();
        if (saved) {
            this.worldState.applyFullState(saved.world);
            if (saved.host) this.localPlayer.deserialize({ stats: saved.host });
            this.guestDataDB = saved.guests || {};
        }
    }

    // --- GAME LOOP ---

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        requestAnimationFrame(this._loop);
    }

    update() {
        if (!this.localPlayer || this.isFainted) return;

        // Otimização de UI: Atualiza HUD de coords apenas se mudou de grid
        const gx = Math.round(this.localPlayer.pos.x);
        const gy = Math.round(this.localPlayer.pos.y);
        
        if (gx !== this.lastGridX || gy !== this.lastGridY) {
            this.lastGridX = gx; this.lastGridY = gy;
            const el = document.getElementById('hud-coords');
            if(el) el.innerText = `${gx}, ${gy}`;
        }

        // Movimento
        const m = this.input.getMovement();
        this.localPlayer.update(m);
        const moving = m.x !== 0 || m.y !== 0;

        // Networking de Movimento (Throttle simples via Math.random para não saturar)
        if (moving || Math.random() < 0.05) {
            this.localPlayer.pos.x += m.x * this.localPlayer.speed;
            this.localPlayer.pos.y += m.y * this.localPlayer.speed;
            
            this.net.sendPayload({ 
                type: 'MOVE', 
                id: this.localPlayer.id, 
                nick: this.localPlayer.nickname, 
                x: this.localPlayer.pos.x, 
                y: this.localPlayer.pos.y, 
                dir: this.localPlayer.currentDir, 
                stats: { 
                    level: this.localPlayer.level, 
                    hp: this.localPlayer.hp, 
                    maxHp: this.localPlayer.maxHp, 
                    tilesCured: this.localPlayer.tilesCured 
                } 
            });
        }

        // Partículas e Efeitos
        if (this.localPlayer.pollen > 0 && moving) this.spawnPollenParticle();
        this.updateParticles();

        // Lógica de Interação com Mundo
        const tile = this.worldState.getModifiedTile(gx, gy) || this.world.getTileAt(gx, gy);
        this.handleTileInteraction(tile, gx, gy, moving);

        // Lógica de Dano e Cura Passiva
        this.handleHealthLogic(tile);

        // Party Rescue Logic
        this.handlePartyLogic();

        // Ranking Update (Throttle)
        if (++this.counters.damage > 60) {
            this.updateRanking();
            this.counters.damage = 0;
        }

        // Atualizar Câmera
        this.camera = { x: this.localPlayer.pos.x, y: this.localPlayer.pos.y };
    }

    handleTileInteraction(tile, gx, gy, moving) {
        // Coletar Pólen
        if (tile === 'FLOR' && this.localPlayer.pollen < this.localPlayer.maxPollen) {
            if (++this.counters.collection >= CONFIG.COLLECTION_RATE) {
                this.localPlayer.pollen++;
                this.counters.collection = 0;
                this.gainXp(CONFIG.XP.PER_POLLEN);
                if (this.localPlayer.pollen >= this.localPlayer.maxPollen) {
                    this.changeTile(gx, gy, 'FLOR_COOLDOWN', this.localPlayer.id);
                }
            }
        }

        // Curar Terra
        if (tile === 'TERRA_QUEIMADA' && this.localPlayer.pollen > 0 && moving) {
            if (++this.counters.uiUpdate >= CONFIG.CURE_ATTEMPT_RATE) {
                this.counters.uiUpdate = 0;
                this.localPlayer.pollen--;
                
                if (Math.random() < CONFIG.PLANT_SPAWN_CHANCE) {
                    this.changeTile(gx, gy, 'GRAMA', this.localPlayer.id);
                    this.localPlayer.tilesCured++;
                    this.gainXp(CONFIG.XP.PER_CURE);
                    this.saveProgress();
                }
                this.updateUI();
            }
        }
    }

    handleHealthLogic(tile) {
        const isSafe = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(tile);
        
        // Dano Ambiental
        if (!isSafe) {
            this.counters.damage++;
            if (this.counters.damage >= CONFIG.DAMAGE.RATE) {
                this.counters.damage = 0;
                this.localPlayer.hp -= CONFIG.DAMAGE.AMOUNT;
                this.updateUI();
                if (this.localPlayer.hp <= 0) this.processFaint();
            }
        }

        // Efeito Visual de Sufocamento
        const hpRatio = this.localPlayer.hp / this.localPlayer.maxHp;
        const overlay = document.getElementById('suffocation-overlay');
        if (overlay) overlay.style.opacity = hpRatio < 0.7 ? (0.7 - hpRatio) * 1.4 : 0;

        // Cura na Colmeia
        if (this.localPlayer.homeBase && this.localPlayer.hp < this.localPlayer.maxHp) {
            const dist = Math.sqrt(
                Math.pow(this.localPlayer.pos.x - this.localPlayer.homeBase.x, 2) + 
                Math.pow(this.localPlayer.pos.y - this.localPlayer.homeBase.y, 2)
            );
            
            let healTickRate = (dist <= 1.5) ? 60 : (dist <= 2.5 ? 120 : (dist <= 3.5 ? 240 : 0));
            if (healTickRate > 0 && ++this.counters.cure >= healTickRate) {
                this.counters.cure = 0;
                this.localPlayer.hp = Math.min(this.localPlayer.maxHp, this.localPlayer.hp + 1);
                this.updateUI();
            }
        }
    }

    handlePartyLogic() {
        if (this.currentPartyPartner && this.remotePlayers[this.currentPartyPartner]) {
            const partner = this.remotePlayers[this.currentPartyPartner];
            // Se parceiro está caído e estou perto com pólen suficiente
            if (partner.hp <= 0 && this.localPlayer.pollen >= 20) {
                const d = Math.sqrt(
                    Math.pow(this.localPlayer.pos.x - partner.pos.x, 2) + 
                    Math.pow(this.localPlayer.pos.y - partner.pos.y, 2)
                );
                
                if (d < 1.0) {
                    this.localPlayer.pollen -= 20;
                    this.net.sendPayload({ type: 'PARTY_RESCUE', fromNick: this.localPlayer.nickname }, this.currentPartyPartner);
                    this.chat.addMessage('SYSTEM', null, `Você salvou ${partner.nickname}!`);
                    this.updateUI();
                }
            }
        }
    }

    // --- EVENTOS DE REDE & HANDLERS ---

    handleNetData(e) {
        const d = e.detail;

        // Chat
        if (d.type === 'WHISPER') this.chat.addMessage('WHISPER', d.fromNick, d.text);
        if (d.type === 'CHAT_MSG') this.chat.addMessage('GLOBAL', d.nick, d.text);
        if (d.type === 'PARTY_MSG') this.chat.addMessage('PARTY', d.fromNick, d.text);

        // Party
        if (d.type === 'PARTY_INVITE') {
            this.pendingInviteFrom = d.fromId;
            document.getElementById('invite-msg').innerText = `${d.fromNick} convidou você para o grupo!`;
            document.getElementById('party-invite-popup').style.display = 'block';
        }
        if (d.type === 'PARTY_ACCEPT') { 
            this.currentPartyPartner = d.fromId; 
            this.chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou o convite.`); 
            this.chat.openPartyTab();
        }
        if (d.type === 'PARTY_LEAVE' && this.currentPartyPartner === d.fromId) { 
            this.chat.addMessage('SYSTEM', null, `Seu parceiro saiu do grupo.`); 
            this.currentPartyPartner = null; 
            this.chat.closePartyTab();
        }
        if (d.type === 'PARTY_RESCUE' && this.isFainted) {
            this.recoverFromFaint(d.fromNick);
        }

        // Sync de Entidades
        if (d.type === 'SPAWN_INFO') {
            if (!this.remotePlayers[d.id]) this.remotePlayers[d.id] = new Player(d.id, d.nick || "Guest");
            this.remotePlayers[d.id].pos = { x: d.x, y: d.y };
            this.remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
        }

        if (d.type === 'MOVE') {
            // Se sou Host, ignoro dados de quem não está autenticado
            if (this.net.isHost && !this.net.authenticatedPeers.has(d.id)) return;
            
            if(!this.remotePlayers[d.id]) { 
                this.remotePlayers[d.id] = new Player(d.id, d.nick || "Guest"); 
                this.chat.addMessage('SYSTEM', null, `${d.nick || 'Alguém'} entrou.`); 
            }
            this.remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
            this.remotePlayers[d.id].currentDir = d.dir;
            if (d.stats) this.remotePlayers[d.id].deserialize({ stats: d.stats });
        }

        // Gameplay
        if (d.type === 'FLOWER_CURE') {
            if (this.localPlayer && d.ownerId === this.localPlayer.id) { 
                this.localPlayer.tilesCured++; 
                this.gainXp(CONFIG.XP.PASSIVE_CURE); 
            }
            if (this.remotePlayers[d.ownerId]) this.remotePlayers[d.ownerId].tilesCured++;
        }

        if(d.type === 'TILE_CHANGE') {
            this.changeTile(d.x, d.y, d.tileType, d.ownerId, false); // False = não retransmitir loopback
        }
    }

    handlePeerDisconnect(e) {
        const peerId = e.detail.peerId;
        if (this.remotePlayers[peerId]) {
            const p = this.remotePlayers[peerId];
            this.chat.addMessage('SYSTEM', null, `${p.nickname || 'Alguém'} saiu.`);
            
            if (this.currentPartyPartner === peerId) {
                this.currentPartyPartner = null;
                this.chat.closePartyTab();
            }
            
            // Salvar dados do Guest antes de remover
            this.guestDataDB[p.nickname] = p.serialize().stats;
            this.saveProgress();
            
            delete this.remotePlayers[peerId];
            this.updateRanking();
        }
    }

    handlePlayerJoin(e) {
        // Quando entramos em uma sala como Guest
        const data = e.detail;
        
        // Log de Debug (compatível com a função global do index.html)
        if(window.logDebug) window.logDebug("Conexão estabelecida! Sincronizando mundo...");
        
        if (data.worldState) this.worldState.applyFullState(data.worldState);
        if (data.guests) this.guestDataDB = data.guests; 
        
        const myNick = document.getElementById('join-nickname').value.trim() || "Guest";
        this.startGame(data.seed, this.net.peer.id, myNick, false);
        
        if (data.playerData) { 
            this.localPlayer.deserialize(data.playerData); 
            this.updateUI(); 
        }
    }

    // --- HELPERS E UTILITÁRIOS ---

    changeTile(x, y, newType, ownerId = null, shouldSend = true) {
        if (this.worldState.setTile(x, y, newType)) {
            // Se sou Host, inicio a simulação de crescimento
            if (this.net.isHost && newType === 'GRAMA') {
                this.worldState.addGrowingPlant(x, y, ownerId);
            }
            // Envia para rede se fui eu quem mudou
            if (shouldSend) {
                this.net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType, ownerId: ownerId });
            }
        }
    }

    processFaint() {
        this.isFainted = true;
        const faintScreen = document.getElementById('faint-screen');
        if(faintScreen) faintScreen.style.display = 'flex';
        
        if (this.currentPartyPartner) {
            this.net.sendPayload({ type: 'PARTY_MSG', fromNick: 'SINAL', text: `${this.localPlayer.nickname} caiu! Precisa de ajuda!` }, this.currentPartyPartner);
        }

        this.faintTimeout = setTimeout(() => {
            this.recoverFromFaint(null); // Respawn normal
        }, 4000);
    }

    recoverFromFaint(rescuerNick) {
        if (this.faintTimeout) clearTimeout(this.faintTimeout);
        
        this.localPlayer.respawn();
        if (this.localPlayer.homeBase) { 
            this.localPlayer.pos = {...this.localPlayer.homeBase}; 
            this.localPlayer.targetPos = {...this.localPlayer.pos}; 
        }
        
        const faintScreen = document.getElementById('faint-screen');
        if(faintScreen) faintScreen.style.display = 'none';
        
        this.isFainted = false;
        if (rescuerNick) {
            this.chat.addMessage('SYSTEM', null, `Reanimado por ${rescuerNick}!`);
            this.localPlayer.hp = 25; // Bonus de HP por resgate
        }
        
        this.updateUI();
        this.net.sendPayload({ type: 'MOVE', id: this.localPlayer.id, nick: this.localPlayer.nickname, x: this.localPlayer.pos.x, y: this.localPlayer.pos.y, dir: this.localPlayer.currentDir });
    }

    gainXp(amount) {
        const oldLevel = this.localPlayer.level;
        this.localPlayer.xp += amount;
        if (this.localPlayer.xp >= this.localPlayer.maxXp) {
            this.localPlayer.xp -= this.localPlayer.maxXp;
            this.localPlayer.level++;
            this.localPlayer.maxXp = Math.floor(this.localPlayer.maxXp * 1.5);
            this.localPlayer.maxPollen += 10;
            this.localPlayer.hp = this.localPlayer.maxHp; 
            this.chat.addMessage('SYSTEM', null, `Nível ${this.localPlayer.level}! Suas asas estão mais fortes.`);
        }
        if (this.localPlayer.level > oldLevel) this.saveProgress();
        this.updateUI();
    }

    saveProgress() {
        if (!this.net.isHost || !this.localPlayer) return;
        // Atualiza DB de Guests com os dados online atuais
        Object.values(this.remotePlayers).forEach(p => { 
            if (p.nickname) this.guestDataDB[p.nickname] = p.serialize().stats; 
        });
        
        this.saveSystem.save({ 
            seed: this.world.seed, 
            world: this.worldState.getFullState(), 
            host: this.localPlayer.serialize().stats, 
            guests: this.guestDataDB 
        });
    }

    startHostSimulation() {
        setInterval(() => {
            const now = Date.now();
            let changed = false;
            const plants = this.worldState.growingPlants;
            
            for (const [key, plantData] of Object.entries(plants)) {
                const startTime = plantData.time || plantData;
                const ownerId = plantData.owner || null;
                const [x, y] = key.split(',').map(Number);
                const elapsed = now - startTime;
                const currentType = this.worldState.getModifiedTile(x, y);
                
                let nextType = null;
                if (currentType === 'GRAMA' && elapsed > CONFIG.GROWTH.BROTO) nextType = 'BROTO';
                else if (currentType === 'BROTO' && elapsed > CONFIG.GROWTH.MUDA) nextType = 'MUDA';
                else if (currentType === 'MUDA' && elapsed > CONFIG.GROWTH.FLOR) nextType = 'FLOR';
                
                if (nextType) this.changeTile(x, y, nextType, ownerId);

                // Espalhamento de Flores (Spread)
                if (currentType === 'FLOR' && Math.random() < 0.10) {
                    const dx = Math.floor(Math.random() * 3) - 1;
                    const dy = Math.floor(Math.random() * 3) - 1;
                    if (dx === 0 && dy === 0) continue;
                    
                    const tx = x + dx, ty = y + dy;
                    const target = this.worldState.getModifiedTile(tx, ty) || this.world.getTileAt(tx, ty);
                    
                    if (target === 'TERRA_QUEIMADA') { 
                        this.changeTile(tx, ty, 'GRAMA_SAFE', null, true); 
                        if (ownerId) this.net.sendPayload({ type: 'FLOWER_CURE', ownerId: ownerId, x: tx, y: ty }); 
                        changed = true; 
                    }
                }
            }
            if (changed) this.saveProgress();
        }, 1000);
    }

    // --- VISUAL & RENDERIZAÇÃO ---

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    draw() {
        // Limpar
        this.ctx.fillStyle = "#0d0d0d";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (!this.world) return;

        const rTileSize = this.world.tileSize * this.zoomLevel;
        const cX = Math.floor(this.localPlayer.pos.x / this.world.chunkSize);
        const cY = Math.floor(this.localPlayer.pos.y / this.world.chunkSize);
        const range = this.zoomLevel < 0.8 ? 2 : 1; 

        // Renderização de Tiles (Culling Otimizado)
        for(let x = -range; x <= range; x++) {
            for(let y = -range; y <= range; y++) {
                this.world.getChunk(cX + x, cY + y).forEach(t => {
                    const sX = (t.x - this.camera.x) * rTileSize + this.canvas.width / 2;
                    const sY = (t.y - this.camera.y) * rTileSize + this.canvas.height / 2;
                    
                    // Verifica se está visível na tela
                    if (sX > -rTileSize && sX < this.canvas.width + rTileSize && 
                        sY > -rTileSize && sY < this.canvas.height + rTileSize) {
                        
                        this.drawTile(t, sX, sY, rTileSize);
                    }
                });
            }
        }

        this.drawParticles(rTileSize);
        this.drawEntities(rTileSize);
        this.drawCompass(rTileSize);
    }

    drawTile(t, sX, sY, size) {
        const type = this.worldState.getModifiedTile(t.x, t.y) || t.type;
        
        // Fumaça Aleatória
        if (type === 'TERRA_QUEIMADA' && Math.random() < 0.015) this.spawnSmokeParticle(t.x, t.y);

        // Cor do Fundo
        if (type === 'COLMEIA') this.ctx.fillStyle = '#f1c40f';
        else if (['GRAMA','GRAMA_SAFE','BROTO','MUDA','FLOR', 'FLOR_COOLDOWN'].includes(type)) this.ctx.fillStyle = '#2ecc71';
        else this.ctx.fillStyle = '#34495e';
        
        this.ctx.fillRect(sX, sY, size, size);

        // Detalhes (Plantas)
        if (type === 'BROTO') { 
            this.ctx.fillStyle = '#006400'; 
            const sz = 12 * this.zoomLevel; 
            this.ctx.fillRect(sX + (size - sz)/2, sY + (size - sz)/2, sz, sz); 
        }
        else if (type === 'MUDA') { 
            this.ctx.fillStyle = '#228B22'; 
            const sz = 20 * this.zoomLevel; 
            this.ctx.fillRect(sX + (size - sz)/2, sY + (size - sz)/2, sz, sz); 
        }
        else if (['FLOR','FLOR_COOLDOWN'].includes(type) && this.assets.flower.complete) {
            if (type === 'FLOR_COOLDOWN') this.ctx.globalAlpha = 0.4;
            
            const by = size * 0.65;
            // Sombra
            this.ctx.fillStyle = "rgba(0,0,0,0.3)"; 
            this.ctx.beginPath(); 
            this.ctx.ellipse(sX + size/2, sY + by, 8 * this.zoomLevel, 3 * this.zoomLevel, 0, 0, Math.PI*2); 
            this.ctx.fill();
            
            // Sprite com oscilação
            this.ctx.save(); 
            this.ctx.translate(sX + size/2, sY + by);
            this.ctx.rotate(Math.sin(Date.now()/800 + t.x * 0.5) * 0.1);
            this.ctx.drawImage(this.assets.flower, -size/2, -size, size, size);
            this.ctx.restore(); 
            
            this.ctx.globalAlpha = 1.0;
        }
    }

    drawParticles(rTileSize) {
        // Fumaça
        this.smokeParticles.forEach(p => { 
            const psX = (p.wx - this.camera.x) * rTileSize + this.canvas.width / 2;
            const psY = (p.wy - this.camera.y) * rTileSize + this.canvas.height / 2; 
            
            if (p.isEmber) this.ctx.fillStyle = `rgba(231, 76, 60, ${p.life})`; 
            else this.ctx.fillStyle = `rgba(${p.grayVal},${p.grayVal},${p.grayVal},${p.life * 0.4})`;
            
            this.ctx.fillRect(psX, psY, p.size * this.zoomLevel, p.size * this.zoomLevel); 
        });

        // Pólen
        this.pollenParticles.forEach(p => { 
            const psX = (p.wx - this.camera.x) * rTileSize + this.canvas.width / 2;
            const psY = (p.wy - this.camera.y) * rTileSize + this.canvas.height / 2; 
            
            this.ctx.fillStyle = `rgba(241,196,15,${p.life})`; 
            this.ctx.fillRect(psX, psY, p.size * this.zoomLevel, p.size * this.zoomLevel); 
        });
    }

    drawEntities(rTileSize) {
        if (!this.localPlayer) return;

        Object.values(this.remotePlayers).forEach(p => {
            p.draw(this.ctx, this.camera, this.canvas, rTileSize, this.currentPartyPartner);
        });
        
        this.localPlayer.draw(this.ctx, this.camera, this.canvas, rTileSize, this.currentPartyPartner);
    }

    drawCompass(rTileSize) {
        // Se estiver longe da colmeia
        if (this.localPlayer && this.localPlayer.homeBase) {
            const dist = Math.sqrt(
                Math.pow(this.localPlayer.homeBase.x - this.localPlayer.pos.x, 2) + 
                Math.pow(this.localPlayer.homeBase.y - this.localPlayer.pos.y, 2)
            );

            if (dist > 30) {
                const angle = Math.atan2(
                    this.localPlayer.homeBase.y - this.localPlayer.pos.y, 
                    this.localPlayer.homeBase.x - this.localPlayer.pos.x
                );
                const orbit = 60 * this.zoomLevel;
                const ax = this.canvas.width / 2 + Math.cos(angle) * orbit;
                const ay = this.canvas.height / 2 + Math.sin(angle) * orbit;

                this.ctx.save(); 
                this.ctx.translate(ax, ay); 
                this.ctx.rotate(angle); 
                this.ctx.fillStyle = "#f1c40f"; 
                this.ctx.strokeStyle = "black"; 
                this.ctx.lineWidth = 2;
                this.ctx.beginPath(); 
                this.ctx.moveTo(0,0); 
                this.ctx.lineTo(-10 * this.zoomLevel, -5 * this.zoomLevel); 
                this.ctx.lineTo(-10 * this.zoomLevel, 5 * this.zoomLevel); 
                this.ctx.closePath(); 
                this.ctx.fill(); 
                this.ctx.stroke(); 
                this.ctx.restore();
            }
        }
    }

    // --- PARTÍCULAS ---

    spawnPollenParticle() { 
        this.pollenParticles.push({ 
            wx: this.localPlayer.pos.x + (Math.random() * 0.4 - 0.2), 
            wy: this.localPlayer.pos.y + (Math.random() * 0.4 - 0.2), 
            size: Math.random() * 3 + 2, 
            speedY: Math.random() * 0.02 + 0.01, 
            life: 1.0 
        }); 
    }

    spawnSmokeParticle(tx, ty) {
        const isEmber = Math.random() < 0.15;
        this.smokeParticles.push({ 
            wx: tx + Math.random(), 
            wy: ty + Math.random(), 
            isEmber: isEmber, 
            size: isEmber ? (Math.random() * 3 + 1) : (Math.random() * 5 + 2), 
            speedY: -(Math.random() * 0.03 + 0.01), 
            wobbleTick: Math.random() * 100, 
            wobbleSpeed: Math.random() * 0.05 + 0.02, 
            wobbleAmp: 0.01, 
            life: Math.random() * 0.6 + 0.4, 
            decay: 0.006, 
            grayVal: Math.floor(Math.random() * 60) 
        });
    }

    updateParticles() {
        // Pólen
        this.pollenParticles.forEach(p => { p.wy += p.speedY; p.life -= 0.02; });
        this.pollenParticles = this.pollenParticles.filter(p => p.life > 0);
        
        // Fumaça
        this.smokeParticles.forEach(p => { 
            p.wy += p.speedY; 
            p.life -= p.decay; 
            p.wobbleTick += p.wobbleSpeed; 
            p.wx += Math.sin(p.wobbleTick) * p.wobbleAmp; 
            if(!p.isEmber) p.size += 0.03; 
        });
        this.smokeParticles = this.smokeParticles.filter(p => p.life > 0);
    }

    // --- UI HELPERS ---

    updateUI() {
        if (!this.localPlayer) return;
        document.getElementById('hud-name').innerText = this.localPlayer.nickname;
        document.getElementById('hud-lvl').innerText = this.localPlayer.level;
        document.getElementById('bar-hp-fill').style.width = `${(this.localPlayer.hp / this.localPlayer.maxHp) * 100}%`;
        document.getElementById('bar-hp-text').innerText = `${Math.ceil(this.localPlayer.hp)}/${this.localPlayer.maxHp}`;
        document.getElementById('bar-xp-fill').style.width = `${(this.localPlayer.xp / this.localPlayer.maxXp) * 100}%`;
        document.getElementById('bar-xp-text').innerText = `${Math.floor(this.localPlayer.xp)}/${this.localPlayer.maxXp}`;
        document.getElementById('bar-pollen-fill').style.width = `${(this.localPlayer.pollen / this.localPlayer.maxPollen) * 100}%`;
        document.getElementById('bar-pollen-text').innerText = `${this.localPlayer.pollen}/${this.localPlayer.maxPollen}`;
        
        const dist = this.localPlayer.homeBase ? Math.sqrt(
            Math.pow(this.localPlayer.pos.x - this.localPlayer.homeBase.x, 2) + 
            Math.pow(this.localPlayer.pos.y - this.localPlayer.homeBase.y, 2)
        ) : 0;
        
        document.getElementById('rpg-hud').classList.toggle('healing-active', dist <= 3.5 && this.localPlayer.hp < this.localPlayer.maxHp);
    }

    updateRanking() {
        const listEl = document.getElementById('ranking-list');
        if (!listEl) return;

        let allPlayersData = Object.keys(this.guestDataDB).map(nick => ({
            nickname: nick,
            tilesCured: this.guestDataDB[nick].tilesCured || 0
        }));

        if (!allPlayersData.find(p => p.nickname === this.localPlayer.nickname)) {
            allPlayersData.push({ nickname: this.localPlayer.nickname, tilesCured: this.localPlayer.tilesCured || 0 });
        }

        allPlayersData.sort((a, b) => b.tilesCured - a.tilesCured);
        listEl.innerHTML = '';
        allPlayersData.slice(0, 5).forEach((p, index) => {
            const div = document.createElement('div');
            div.className = 'rank-item';
            const isOnline = Object.values(this.remotePlayers).some(rp => rp.nickname === p.nickname) || p.nickname === this.localPlayer.nickname;
            div.innerHTML = `<span>${index + 1}. ${p.nickname} ${isOnline ? '●' : ''}</span><span class="rank-val">${p.tilesCured}</span>`;
            listEl.appendChild(div);
        });
    }
}
