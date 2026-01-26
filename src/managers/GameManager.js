import { WorldGenerator } from '../world/worldGen.js';
import { Player } from '../entities/player.js';

const CONFIG = {
    ZOOM: { MIN: 0.5, MAX: 1.5, DEFAULT: 1.0 },
    PLANT_SPAWN_CHANCE: 0.01,
    CURE_ATTEMPT_RATE: 20,
    COLLECTION_RATE: 5,
    DAMAGE: { RATE: 2, AMOUNT: 0.2 },
    XP: { PER_CURE: 15, PER_POLLEN: 0.2, PASSIVE_CURE: 5 },
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
        
        this.pollenParticles = [];
        this.smokeParticles = [];

        this.currentPartyPartner = null;
        this.guestDataDB = {};
        this.lastGridX = -9999;
        this.lastGridY = -9999;

        this.counters = { collection: 0, cure: 0, damage: 0, uiUpdate: 0 };
        this.isFainted = false;
        this.faintTimeout = null;
        this.isRunning = false;

        this.assets = { flower: new Image() };
        this.assets.flower.src = 'assets/Flower.png';

        // Bindings
        this._loop = this.loop.bind(this);
        this._resize = this.resize.bind(this);
        this._handleNetData = this.handleNetData.bind(this);
        this._handlePeerDisconnect = this.handlePeerDisconnect.bind(this);
        this._handlePlayerJoin = this.handlePlayerJoin.bind(this);
        this._handlePlayerClick = this.handlePlayerClick.bind(this);
        this._handleChatSend = this.handleChatSend.bind(this); // IMPORTANTE

        this.initListeners();
    }

    initListeners() {
        window.addEventListener('resize', this._resize);
        window.addEventListener('netData', this._handleNetData);
        window.addEventListener('peerDisconnected', this._handlePeerDisconnect);
        window.addEventListener('joined', this._handlePlayerJoin);
        window.addEventListener('playerClicked', this._handlePlayerClick);
        window.addEventListener('chatSend', this._handleChatSend); // LIGANDO O CHAT À REDE
        this.resize();
    }

    // --- CORREÇÃO DO CHAT ---
    handleChatSend(e) {
        const data = e.detail; 
        if (!this.localPlayer) return;

        // O GameManager pega o evento do ChatSystem e manda pro NetworkManager
        if (data.type === 'GLOBAL') {
            this.net.sendPayload({ type: 'CHAT_MSG', id: this.localPlayer.id, nick: this.localPlayer.nickname, text: data.text });
        } else if (data.type === 'PARTY') {
            if (this.currentPartyPartner) {
                this.net.sendPayload({ type: 'PARTY_MSG', fromNick: this.localPlayer.nickname, text: data.text }, this.currentPartyPartner);
            } else {
                this.chat.addMessage('SYSTEM', null, "Você não está em um grupo.");
            }
        } else if (data.type === 'WHISPER') {
            let targetId = data.target;
            // Se o chat mandou o Nick, tentamos achar o ID
            const targetPlayer = Object.values(this.remotePlayers).find(p => p.nickname === data.target);
            if (targetPlayer) targetId = targetPlayer.id;

            if (targetId) {
                this.net.sendPayload({ type: 'WHISPER', fromNick: this.localPlayer.nickname, text: data.text }, targetId);
            } else {
                this.chat.addMessage('SYSTEM', null, "Jogador não encontrado.");
            }
        }
    }

    startGame(seed, id, nick, isHost = false) {
        this.ui.showGameInterface();
        this.world = new WorldGenerator(seed);
        this.localPlayer = new Player(id, nick, true);
        this.setupSpawnPoint(id, isHost);
        if (isHost) {
            this.loadHostSave();
            this.startHostSimulation();
        }
        this.chat.addMessage('SYSTEM', null, `Abelha ${nick} pronta para o voo!`);
        this.ui.updateStats(this.localPlayer);
        if (!this.isRunning) {
            this.isRunning = true;
            requestAnimationFrame(this._loop);
        }
    }

    setupSpawnPoint(id, isHost) {
        const hives = this.world.getHiveLocations();
        let spawnIdx = isHost ? 0 : (Math.abs(id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % (hives.length-1)) + 1;
        if (hives[spawnIdx]) {
            this.localPlayer.homeBase = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
            this.localPlayer.pos = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
            this.localPlayer.targetPos = { ...this.localPlayer.pos };
            if (isHost) {
                const fx = Math.round(this.localPlayer.pos.x + 2);
                const fy = Math.round(this.localPlayer.pos.y + 2);
                this.changeTile(fx, fy, 'GRAMA');
                setTimeout(() => this.changeTile(fx, fy, 'FLOR'), 1000);
            }
            this.net.sendPayload({ type: 'SPAWN_INFO', id: this.localPlayer.id, nick: this.localPlayer.nickname, x: this.localPlayer.pos.x, y: this.localPlayer.pos.y });
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

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        requestAnimationFrame(this._loop);
    }

    update() {
        if (!this.localPlayer || this.isFainted) return;
        const gx = Math.round(this.localPlayer.pos.x);
        const gy = Math.round(this.localPlayer.pos.y);
        if (gx !== this.lastGridX || gy !== this.lastGridY) {
            this.lastGridX = gx; this.lastGridY = gy;
            this.ui.updateStats(this.localPlayer);
        }
        const m = this.input.getMovement();
        this.localPlayer.update(m);
        const moving = m.x !== 0 || m.y !== 0;
        if (moving || Math.random() < 0.05) {
            this.localPlayer.pos.x += m.x * this.localPlayer.speed;
            this.localPlayer.pos.y += m.y * this.localPlayer.speed;
            this.net.sendPayload({ type: 'MOVE', id: this.localPlayer.id, nick: this.localPlayer.nickname, x: this.localPlayer.pos.x, y: this.localPlayer.pos.y, dir: this.localPlayer.currentDir, stats: { level: this.localPlayer.level, hp: this.localPlayer.hp, maxHp: this.localPlayer.maxHp, tilesCured: this.localPlayer.tilesCured } });
        }
        if (this.localPlayer.pollen > 0 && moving) this.spawnPollenParticle();
        this.updateParticles();
        const tile = this.worldState.getModifiedTile(gx, gy) || this.world.getTileAt(gx, gy);
        this.handleInteractions(tile, gx, gy, moving);
        if (++this.counters.damage > 60) {
            this.calculateRanking();
            this.counters.damage = 0;
        }
        this.camera = { x: this.localPlayer.pos.x, y: this.localPlayer.pos.y };
    }

    handleInteractions(tile, gx, gy, moving) {
        if (tile === 'FLOR' && this.localPlayer.pollen < this.localPlayer.maxPollen) {
            if (++this.counters.collection >= CONFIG.COLLECTION_RATE) {
                this.localPlayer.pollen++;
                this.counters.collection = 0;
                this.gainXp(CONFIG.XP.PER_POLLEN);
                if (this.localPlayer.pollen >= this.localPlayer.maxPollen) this.changeTile(gx, gy, 'FLOR_COOLDOWN', this.localPlayer.id);
            }
        }
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
                this.ui.updateStats(this.localPlayer);
            }
        }
        const isSafe = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(tile);
        if (!isSafe) {
            this.counters.damage++;
            if (this.counters.damage >= CONFIG.DAMAGE.RATE) {
                this.counters.damage = 0;
                this.localPlayer.hp -= CONFIG.DAMAGE.AMOUNT;
                this.ui.updateStats(this.localPlayer);
                if (this.localPlayer.hp <= 0) this.processFaint();
            }
        }
        this.ui.updateSuffocation(this.localPlayer.hp / this.localPlayer.maxHp);
        if (this.localPlayer.homeBase && this.localPlayer.hp < this.localPlayer.maxHp) {
            const dist = Math.sqrt(Math.pow(this.localPlayer.pos.x - this.localPlayer.homeBase.x, 2) + Math.pow(this.localPlayer.pos.y - this.localPlayer.homeBase.y, 2));
            let healRate = (dist <= 1.5) ? 60 : (dist <= 3.5 ? 240 : 0);
            if (healRate > 0 && ++this.counters.cure >= healRate) {
                this.counters.cure = 0;
                this.localPlayer.hp = Math.min(this.localPlayer.maxHp, this.localPlayer.hp + 1);
                this.ui.updateStats(this.localPlayer);
            }
        }
        if (this.currentPartyPartner && this.remotePlayers[this.currentPartyPartner]) {
            const partner = this.remotePlayers[this.currentPartyPartner];
            if (partner.hp <= 0 && this.localPlayer.pollen >= 20) {
                const d = Math.sqrt(Math.pow(this.localPlayer.pos.x - partner.pos.x, 2) + Math.pow(this.localPlayer.pos.y - partner.pos.y, 2));
                if (d < 1.0) {
                    this.localPlayer.pollen -= 20;
                    this.net.sendPayload({ type: 'PARTY_RESCUE', fromNick: this.localPlayer.nickname }, this.currentPartyPartner);
                    this.chat.addMessage('SYSTEM', null, `Você salvou ${partner.nickname}!`);
                    this.ui.updateStats(this.localPlayer);
                }
            }
        }
    }

    handleNetData(e) {
        const d = e.detail;
        if (d.type === 'WHISPER') this.chat.addMessage('WHISPER', d.fromNick, d.text);
        if (d.type === 'CHAT_MSG') this.chat.addMessage('GLOBAL', d.nick, d.text);
        if (d.type === 'PARTY_MSG') this.chat.addMessage('PARTY', d.fromNick, d.text);
        if (d.type === 'PARTY_INVITE') this.ui.showPartyInvite(d.fromNick, d.fromId);
        if (d.type === 'PARTY_ACCEPT') { this.currentPartyPartner = d.fromId; this.chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou.`); this.chat.openPartyTab(); }
        if (d.type === 'PARTY_LEAVE' && this.currentPartyPartner === d.fromId) { this.chat.addMessage('SYSTEM', null, `Parceiro saiu.`); this.currentPartyPartner = null; this.chat.closePartyTab(); }
        if (d.type === 'PARTY_RESCUE' && this.isFainted) this.recoverFromFaint(d.fromNick);
        if (d.type === 'SPAWN_INFO') {
            if (!this.remotePlayers[d.id]) this.remotePlayers[d.id] = new Player(d.id, d.nick || "Guest");
            this.remotePlayers[d.id].pos = { x: d.x, y: d.y };
        }
        if (d.type === 'MOVE') {
            if (this.net.isHost && !this.net.authenticatedPeers.has(d.id)) return;
            if(!this.remotePlayers[d.id]) { this.remotePlayers[d.id] = new Player(d.id, d.nick || "Guest"); this.chat.addMessage('SYSTEM', null, `${d.nick || 'Alguém'} entrou.`); }
            this.remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
            this.remotePlayers[d.id].currentDir = d.dir;
            if (d.stats) this.remotePlayers[d.id].deserialize({ stats: d.stats });
        }
        if (d.type === 'FLOWER_CURE') {
            if (this.localPlayer && d.ownerId === this.localPlayer.id) { this.localPlayer.tilesCured++; this.gainXp(CONFIG.XP.PASSIVE_CURE); }
            if (this.remotePlayers[d.ownerId]) this.remotePlayers[d.ownerId].tilesCured++;
        }
        if(d.type === 'TILE_CHANGE') this.changeTile(d.x, d.y, d.tileType, d.ownerId, false);
    }

    handlePeerDisconnect(e) {
        const peerId = e.detail.peerId;
        if (this.remotePlayers[peerId]) {
            const p = this.remotePlayers[peerId];
            this.chat.addMessage('SYSTEM', null, `${p.nickname || 'Alguém'} saiu.`);
            if (this.currentPartyPartner === peerId) { this.currentPartyPartner = null; this.chat.closePartyTab(); }
            this.guestDataDB[p.nickname] = p.serialize().stats;
            this.saveProgress();
            delete this.remotePlayers[peerId];
            this.calculateRanking();
        }
    }

    handlePlayerJoin(e) {
        const data = e.detail;
        if(window.logDebug) window.logDebug("Conectado! Iniciando...");
        if (data.worldState) this.worldState.applyFullState(data.worldState);
        if (data.guests) this.guestDataDB = data.guests; 
        const myNick = document.getElementById('join-nickname').value.trim() || "Guest";
        this.startGame(data.seed, this.net.peer.id, myNick, false);
        if (data.playerData) { this.localPlayer.deserialize(data.playerData); this.ui.updateStats(this.localPlayer); }
    }

    handlePlayerClick(e) {
        const targetNick = e.detail;
        const targetId = Object.keys(this.remotePlayers).find(id => this.remotePlayers[id].nickname === targetNick);
        if (targetId) {
            this.selectedPlayerId = targetId; 
            const p = this.remotePlayers[targetId];
            const isPartner = this.currentPartyPartner === targetId;
            this.ui.openPlayerModal(p.nickname, p.level || 1, isPartner);
        }
    }

    changeTile(x, y, newType, ownerId = null, shouldSend = true) {
        if (this.worldState.setTile(x, y, newType)) {
            if (this.net.isHost && newType === 'GRAMA') this.worldState.addGrowingPlant(x, y, ownerId);
            if (shouldSend) this.net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType, ownerId: ownerId });
        }
    }

    processFaint() {
        this.isFainted = true;
        this.ui.showFaintScreen();
        if (this.currentPartyPartner) this.net.sendPayload({ type: 'PARTY_MSG', fromNick: 'SINAL', text: `SOS: Caí!` }, this.currentPartyPartner);
        this.faintTimeout = setTimeout(() => this.recoverFromFaint(null), 4000);
    }

    recoverFromFaint(rescuerNick) {
        if (this.faintTimeout) clearTimeout(this.faintTimeout);
        this.localPlayer.respawn();
        if (this.localPlayer.homeBase) this.localPlayer.pos = {...this.localPlayer.homeBase};
        this.ui.hideFaintScreen();
        this.isFainted = false;
        if (rescuerNick) { this.chat.addMessage('SYSTEM', null, `Salvo por ${rescuerNick}!`); this.localPlayer.hp = 25; }
        this.ui.updateStats(this.localPlayer);
        this.net.sendPayload({ type: 'MOVE', id: this.localPlayer.id, nick: this.localPlayer.nickname, x: this.localPlayer.pos.x, y: this.localPlayer.pos.y, dir: this.localPlayer.currentDir });
    }

    gainXp(amount) {
        const old = this.localPlayer.level;
        this.localPlayer.xp += amount;
        if (this.localPlayer.xp >= this.localPlayer.maxXp) {
            this.localPlayer.xp -= this.localPlayer.maxXp;
            this.localPlayer.level++;
            this.localPlayer.maxXp = Math.floor(this.localPlayer.maxXp * 1.5);
            this.localPlayer.maxPollen += 10;
            this.localPlayer.hp = this.localPlayer.maxHp; 
            this.chat.addMessage('SYSTEM', null, `Level Up! Nível ${this.localPlayer.level}`);
        }
        if (this.localPlayer.level > old) this.saveProgress();
        this.ui.updateStats(this.localPlayer);
    }

    calculateRanking() {
        let allPlayersData = Object.keys(this.guestDataDB).map(nick => ({ nickname: nick, tilesCured: this.guestDataDB[nick].tilesCured || 0, isOnline: false }));
        if (!allPlayersData.find(p => p.nickname === this.localPlayer.nickname)) { allPlayersData.push({ nickname: this.localPlayer.nickname, tilesCured: this.localPlayer.tilesCured || 0, isOnline: true }); }
        allPlayersData.forEach(p => { if (Object.values(this.remotePlayers).some(rp => rp.nickname === p.nickname) || p.nickname === this.localPlayer.nickname) { p.isOnline = true; } });
        allPlayersData.sort((a, b) => b.tilesCured - a.tilesCured);
        this.ui.updateRanking(allPlayersData);
    }

    saveProgress() {
        if (!this.net.isHost || !this.localPlayer) return;
        Object.values(this.remotePlayers).forEach(p => { if (p.nickname) this.guestDataDB[p.nickname] = p.serialize().stats; });
        this.saveSystem.save({ seed: this.world.seed, world: this.worldState.getFullState(), host: this.localPlayer.serialize().stats, guests: this.guestDataDB });
    }

    startHostSimulation() {
        setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const [key, plantData] of Object.entries(this.worldState.growingPlants)) {
                const startTime = plantData.time || plantData, ownerId = plantData.owner || null;
                const [x, y] = key.split(',').map(Number), elapsed = now - startTime, currentType = this.worldState.getModifiedTile(x, y);
                let next = null;
                if (currentType === 'GRAMA' && elapsed > CONFIG.GROWTH.BROTO) next = 'BROTO';
                else if (currentType === 'BROTO' && elapsed > CONFIG.GROWTH.MUDA) next = 'MUDA';
                else if (currentType === 'MUDA' && elapsed > CONFIG.GROWTH.FLOR) next = 'FLOR';
                if (next) this.changeTile(x, y, next, ownerId);
                if (currentType === 'FLOR' && Math.random() < 0.10) {
                    const dx = Math.floor(Math.random()*3)-1, dy = Math.floor(Math.random()*3)-1;
                    if (dx===0 && dy===0) continue;
                    const tx = x+dx, ty = y+dy, target = this.worldState.getModifiedTile(tx, ty) || this.world.getTileAt(tx, ty);
                    if (target === 'TERRA_QUEIMADA') { this.changeTile(tx, ty, 'GRAMA_SAFE', null, true); if (ownerId) this.net.sendPayload({ type: 'FLOWER_CURE', ownerId: ownerId, x: tx, y: ty }); changed = true; }
                }
            }
            if (changed) this.saveProgress();
        }, 1000);
    }

    resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }

    draw() {
        this.ctx.fillStyle = "#0d0d0d"; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.world) return;
        const rTileSize = this.world.tileSize * this.zoomLevel;
        const cX = Math.floor(this.localPlayer.pos.x / this.world.chunkSize), cY = Math.floor(this.localPlayer.pos.y / this.world.chunkSize);
        const range = this.zoomLevel < 0.8 ? 2 : 1; 
        for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
            this.world.getChunk(cX+x, cY+y).forEach(t => {
                const sX = (t.x - this.camera.x)*rTileSize + this.canvas.width/2, sY = (t.y - this.camera.y)*rTileSize + this.canvas.height/2;
                if(sX > -rTileSize && sX < this.canvas.width+rTileSize && sY > -rTileSize && sY < this.canvas.height+rTileSize) {
                    this.drawTile(t, sX, sY, rTileSize);
                }
            });
        }
        this.drawParticles(rTileSize);
        if (this.localPlayer) {
            Object.values(this.remotePlayers).forEach(p => p.draw(this.ctx, this.camera, this.canvas, rTileSize, this.currentPartyPartner));
            this.localPlayer.draw(this.ctx, this.camera, this.canvas, rTileSize, this.currentPartyPartner);
        }
        this.drawCompass(rTileSize);
    }

    drawTile(t, sX, sY, size) {
        const type = this.worldState.getModifiedTile(t.x, t.y) || t.type;
        if (type === 'TERRA_QUEIMADA' && Math.random() < 0.015) this.spawnSmokeParticle(t.x, t.y);
        this.ctx.fillStyle = (type === 'COLMEIA') ? '#f1c40f' : (['GRAMA','GRAMA_SAFE','BROTO','MUDA','FLOR', 'FLOR_COOLDOWN'].includes(type) ? '#2ecc71' : '#34495e');
        this.ctx.fillRect(sX, sY, size, size);
        if (['FLOR','FLOR_COOLDOWN'].includes(type) && this.assets.flower.complete) {
            if (type === 'FLOR_COOLDOWN') this.ctx.globalAlpha = 0.4;
            this.ctx.drawImage(this.assets.flower, sX, sY - size/2, size, size); 
            this.ctx.globalAlpha = 1.0;
        } else if (type === 'BROTO') { this.ctx.fillStyle = '#006400'; this.ctx.fillRect(sX+size*0.4, sY+size*0.4, size*0.2, size*0.2);
        } else if (type === 'MUDA') { this.ctx.fillStyle = '#228B22'; this.ctx.fillRect(sX+size*0.3, sY+size*0.3, size*0.4, size*0.4); }
    }

    drawParticles(rTileSize) {
        this.pollenParticles.forEach(p => { const psX = (p.wx - this.camera.x) * rTileSize + this.canvas.width / 2; const psY = (p.wy - this.camera.y) * rTileSize + this.canvas.height / 2; this.ctx.fillStyle = `rgba(241,196,15,${p.life})`; this.ctx.fillRect(psX, psY, p.size * this.zoomLevel, p.size * this.zoomLevel); });
        this.smokeParticles.forEach(p => { const psX = (p.wx - this.camera.x) * rTileSize + this.canvas.width / 2; const psY = (p.wy - this.camera.y) * rTileSize + this.canvas.height / 2; this.ctx.fillStyle = p.isEmber ? `rgba(231,76,60,${p.life})` : `rgba(${p.grayVal},${p.grayVal},${p.grayVal},${p.life*0.4})`; this.ctx.fillRect(psX, psY, p.size * this.zoomLevel, p.size * this.zoomLevel); });
    }

    drawCompass(rTileSize) {
        if (this.localPlayer && this.localPlayer.homeBase) {
            const dist = Math.sqrt(Math.pow(this.localPlayer.homeBase.x-this.localPlayer.pos.x,2)+Math.pow(this.localPlayer.homeBase.y-this.localPlayer.pos.y,2));
            if (dist > 30) {
                const angle = Math.atan2(this.localPlayer.homeBase.y-this.localPlayer.pos.y, this.localPlayer.homeBase.x-this.localPlayer.pos.x);
                const orbit = 60*this.zoomLevel;
                const ax = this.canvas.width/2 + Math.cos(angle)*orbit, ay = this.canvas.height/2 + Math.sin(angle)*orbit;
                this.ctx.save(); this.ctx.translate(ax, ay); this.ctx.rotate(angle); this.ctx.fillStyle = "#f1c40f"; this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.lineTo(-10,-5); this.ctx.lineTo(-10,5); this.ctx.fill(); this.ctx.restore();
            }
        }
    }

    spawnPollenParticle() { this.pollenParticles.push({ wx: this.localPlayer.pos.x + (Math.random()*0.4-0.2), wy: this.localPlayer.pos.y + (Math.random()*0.4-0.2), size: Math.random()*3+2, speedY: Math.random()*0.02+0.01, life: 1.0 }); }
    spawnSmokeParticle(tx, ty) { this.smokeParticles.push({ wx: tx + Math.random(), wy: ty + Math.random(), isEmber: Math.random() < 0.15, size: Math.random()*4+2, speedY: -(Math.random()*0.03+0.01), wobbleTick: Math.random()*100, wobbleSpeed: 0.05, wobbleAmp: 0.01, life: Math.random()*0.6+0.4, decay: 0.006, grayVal: Math.floor(Math.random()*60) }); }
    updateParticles() {
        this.pollenParticles.forEach(p => { p.wy += p.speedY; p.life -= 0.02; }); this.pollenParticles = this.pollenParticles.filter(p => p.life > 0);
        this.smokeParticles.forEach(p => { p.wy += p.speedY; p.life -= p.decay; p.wobbleTick += p.wobbleSpeed; p.wx += Math.sin(p.wobbleTick)*p.wobbleAmp; }); this.smokeParticles = this.smokeParticles.filter(p => p.life > 0);
    }
}
