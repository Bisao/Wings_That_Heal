import { NetworkManager } from './network.js';
import { WorldGenerator } from '../world/worldGen.js';
import { WorldState } from '../world/worldState.js';
import { Player } from '../entities/player.js';
import { InputHandler } from './input.js';
import { SaveSystem } from './saveSystem.js';
import { ChatSystem } from './chatSystem.js';
import { SkillTree } from '../player/skillTree.js';
import { Ant } from '../entities/ant.js';
import { Projectile } from '../entities/projectile.js';
import { WaveEffect } from '../entities/WaveEffect.js';
import { ParticleSystem } from '../utils/ParticleSystem.js';
import { UIManager } from './UIManager.js';
import { HostSimulation } from './HostSimulation.js';
import { Tree } from '../entities/tree.js'; // Importação da nova lógica de árvore

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Sistemas Principais
        this.net = new NetworkManager();
        this.input = new InputHandler();
        this.worldState = new WorldState();
        this.saveSystem = new SaveSystem();
        this.chat = new ChatSystem();
        this.particles = new ParticleSystem();
        this.ui = new UIManager();
        this.hostSim = null;

        // Estado do Jogo
        this.world = null;
        this.currentWorldId = null; 
        this.localPlayer = null;
        this.remotePlayers = {};
        this.camera = { x: 0, y: 0 };
        this.enemies = [];
        this.projectiles = [];
        this.activeWaves = [];
        this.hiveTree = null; // Instância lógica da árvore
        
        // Estado de Grupo
        this.partyMembers = [];
        this.localPartyName = "";
        this.localPartyIcon = "";
        
        // Dados Persistentes
        this.guestDataDB = {};
        this.hiveRegistry = {};
        
        // Variáveis de Controle
        this.zoomLevel = 1.5;
        this.lastGridX = -9999;
        this.lastGridY = -9999;
        this.isFainted = false;
        this.faintTimeout = null;
        this.invulnerabilityTimer = 0;
        this.lastManualSaveTime = 0;
        
        // Controle de Resgate
        this.rescueTimer = 0;
        this.currentRescueTarget = null;
        this.RESCUE_DURATION = 180;
        this.RESCUE_POLLEN_COST = 20;

        // Assets
        this.assets = { 
            flower: new Image(),
            treeFrames: [] 
        };
        this.assets.flower.src = 'assets/Flower.png';

        for (let i = 0; i < 34; i++) {
            const img = new Image();
            const frameNum = String(i).padStart(3, '0');
            img.src = `assets/cherryHive/frame_${frameNum}.png`; 
            this.assets.treeFrames.push(img);
        }

        this.treeStructure = [];
        this._buildTreeStructure();

        if (this.input.isMobile && typeof this.input.hideJoystick === 'function') {
            this.input.hideJoystick();
        }

        this.setupEventListeners();
        this.setupDOMEvents();
    }

    _buildTreeStructure() {
        this.treeStructure = [
            [32,  0,  0], [30, -2,  0], [31, -1,  0], [33,  1,  0], [34,  2,  0], 
            [27,  -1, -1], [28,  0, -1], [29,  1, -1],  
            [23,  -1, -2], [24,  0, -2], [25,  1, -2], [26,  2, -2],  
            [16,  -1, -3], [17,  0, -3], [18,  1, -3], 
        ];
    }

    start(seed, id, nick) {
        if (typeof this.input.hideJoystick === 'function') this.input.hideJoystick();
        this.currentWorldId = id;

        let loader = document.getElementById('loading-screen');
        if (!loader) {
            loader = document.createElement('div'); loader.id = 'loading-screen';
            loader.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000 url('assets/loading.png') no-repeat center center; background-size: contain; z-index: 99999; display: block;";
            document.body.appendChild(loader);
        } else loader.style.display = 'block';

        document.getElementById('lobby-overlay').style.display = 'none';
        document.getElementById('rpg-hud').style.display = 'none';
        document.getElementById('chat-toggle-btn').style.display = 'none';
        this.canvas.style.display = 'none'; 

        this.world = new WorldGenerator(seed);
        this.localPlayer = new Player(id, nick, true);
        this.localPlayer.skillPoints = 0;
        this.localPlayer.skillTree = new SkillTree(this.localPlayer);

        const hives = this.world.getHiveLocations();

        if (this.net.isHost) {
            const saved = this.saveSystem.load(id);
            if (saved) { 
                this.hiveRegistry = saved.hiveRegistry || {}; 
                if (this.hiveRegistry[nick] === undefined) this.hiveRegistry[nick] = 0;
                this.worldState.applyFullState(saved.world);
                if (saved.host) {
                    this.localPlayer.deserialize({ stats: saved.host });
                    this.localPlayer.skillPoints = saved.host.skillPoints || 0;
                    if (saved.host.unlockedSkills) this.localPlayer.skillTree.deserialize(saved.host.unlockedSkills);
                    if (saved.host.x !== undefined) { 
                        this.localPlayer.pos.x = saved.host.x; 
                        this.localPlayer.pos.y = saved.host.y; 
                        this.localPlayer.targetPos = { ...this.localPlayer.pos }; 
                    }
                }
                this.guestDataDB = saved.guests || {};
            } else {
                this.hiveRegistry[nick] = 0;
                this.worldState.worldTime = new Date('2074-02-09T06:00:00').getTime();
                if (hives[0]) { 
                    const fx = Math.round(hives[0].x + 2); 
                    const fy = Math.round(hives[0].y + 2); 
                    this.changeTile(fx, fy, 'GRAMA'); 
                    setTimeout(() => this.changeTile(fx, fy, 'FLOR'), 1000); 
                }
            }
        }

        let spawnIdx = this.hiveRegistry[nick] !== undefined ? this.hiveRegistry[nick] : (Math.abs(id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % (hives.length-1))+1;
        if (hives[spawnIdx]) { 
            this.localPlayer.homeBase = { x: hives[spawnIdx].x, y: hives[spawnIdx].y }; 
            this.localPlayer.pos = { x: hives[spawnIdx].x, y: hives[spawnIdx].y }; 
            this.localPlayer.targetPos = { ...this.localPlayer.pos }; 
            // Inicializa a árvore na base
            this.hiveTree = new Tree(hives[spawnIdx].x, hives[spawnIdx].y, nick);
        }

        this.net.sendPayload({ type: 'SPAWN_INFO', id: this.localPlayer.id, nick: this.localPlayer.nickname, x: this.localPlayer.pos.x, y: this.localPlayer.pos.y });
        this.chat.addMessage('SYSTEM', null, `Abelha ${nick} pronta para o voo!`);

        const skillBtn = document.getElementById('btn-skills') || document.createElement('button');
        skillBtn.id = 'btn-skills'; skillBtn.innerText = '⚡'; 
        skillBtn.onclick = () => this.localPlayer.skillTree.toggle(); 
        if (!document.getElementById('btn-skills')) document.body.appendChild(skillBtn);

        this.ui.updateHUD(this.localPlayer);
        this.resize();
        requestAnimationFrame(() => this.loop());
        setInterval(() => this.ui.updateRanking(this.guestDataDB, this.localPlayer, this.remotePlayers), 5000);

        if(this.net.isHost) {
            this.hostSim = new HostSimulation(this.world, this.worldState, this.net);
            this.hostSim.start({
                localPlayer: this.localPlayer,
                remotePlayers: this.remotePlayers,
                enemies: this.enemies,
                activeWaves: this.activeWaves,
                hiveRegistry: this.hiveRegistry,
                guestDataDB: this.guestDataDB,
                fnChangeTile: (x,y,t,o) => this.changeTile(x,y,t,o),
                fnSaveProgress: (f) => this.saveProgress(f),
                fnGainXp: (a) => this.gainXp(a)
            });
        }

        setTimeout(() => {
            const l = document.getElementById('loading-screen');
            if (l) { l.style.opacity = '0'; l.style.transition = 'opacity 1s ease'; setTimeout(() => l.style.display = 'none', 1000); }
            document.getElementById('rpg-hud').style.display = 'block';
            document.getElementById('chat-toggle-btn').style.display = 'flex'; 
            this.canvas.style.display = 'block';
            if (this.input.isMobile && typeof this.input.showJoystick === 'function') this.input.showJoystick(); 
            this.resize(); 
        }, 3000); 
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        if(!this.localPlayer || this.isFainted) return;
        this.ui.updateEnvironment(this.worldState.worldTime);
        if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer--;
        
        const gx = Math.round(this.localPlayer.pos.x);
        const gy = Math.round(this.localPlayer.pos.y);
        
        if (gx !== this.lastGridX || gy !== this.lastGridY) {
            this.lastGridX = gx; this.lastGridY = gy;
            this.ui.updateCoords(gx, gy);
        }

        // Atualiza Árvore (apenas Host processa lógica de cura global)
        if (this.hiveTree && this.net.isHost) {
            this.hiveTree.updateAndHeal(this);
        }

        Object.values(this.remotePlayers).forEach(p => p.update({}));
        this.projectiles.forEach((p, idx) => { if (!p.update()) this.projectiles.splice(idx, 1); });

        this.enemies.forEach((ant, idx) => {
            const players = [this.localPlayer, ...Object.values(this.remotePlayers)];
            ant.update(players, this.world, this.worldState);
            if (this.invulnerabilityTimer <= 0) {
                const dx = ant.x - this.localPlayer.pos.x;
                const dy = ant.y - this.localPlayer.pos.y;
                if (Math.sqrt(dx*dx + dy*dy) < 0.6) {
                    this.localPlayer.hp -= 5;
                    this.localPlayer.pos.x -= dx * 0.5;
                    this.localPlayer.pos.y -= dy * 0.5;
                    this.ui.updateHUD(this.localPlayer);
                    if (this.localPlayer.hp <= 0) this.processFaint();
                }
            }
            this.projectiles.forEach((proj, pIdx) => {
                if (Math.sqrt(Math.pow(proj.x - ant.x, 2) + Math.pow(proj.y - ant.y, 2)) < 0.5) {
                    ant.hp -= proj.damage;
                    this.projectiles.splice(pIdx, 1);
                    this.particles.spawnSmoke(ant.x, ant.y);
                }
            });
            if (ant.hp <= 0) {
                this.enemies.splice(idx, 1);
                this.particles.spawnPollen(ant.x, ant.y);
            }
        });

        Object.values(this.remotePlayers).forEach(p => this.localPlayer.resolveCollision(p));

        this.activeWaves = this.activeWaves.filter(wave => {
            const stillAlive = wave.update();
            if (stillAlive && !wave.curedLocal) {
                const d = Math.sqrt(Math.pow(this.localPlayer.pos.x - wave.x, 2) + Math.pow(this.localPlayer.pos.y - wave.y, 2));
                // Se a onda encostar no player
                if (Math.abs(d - wave.currentRadius) < 0.5) {
                    wave.curedLocal = true;
                    // Lógica de Cura: ondas amarelas ou verdes curam
                    if (this.localPlayer.hp < this.localPlayer.maxHp) {
                        this.localPlayer.applyHeal(wave.healAmount || 10);
                        this.ui.updateHUD(this.localPlayer);
                    }
                }
            }
            return stillAlive;
        });

        const m = this.input.getMovement();
        this.localPlayer.update(m);
        this.processShooting();

        // [NOVO] Verifica qual é o bloco atual embaixo da abelha
        const currentTile = this.worldState.getModifiedTile(gx, gy) || this.world.getTileAt(gx, gy);

        const moving = m.x !== 0 || m.y !== 0;
        if(moving || Math.random() < 0.05) {
            let speedMod = this.invulnerabilityTimer > 0 ? 1.5 : 1.0;
            
            // [ATUALIZADO] Aplica freio de 25% se o chão estiver queimado
            if (currentTile === 'TERRA_QUEIMADA') {
                speedMod *= 0.75; 
            }

            this.localPlayer.pos.x += m.x * this.localPlayer.speed * speedMod;
            this.localPlayer.pos.y += m.y * this.localPlayer.speed * speedMod;
            
            this.net.sendPayload({ 
                type: 'MOVE', 
                id: this.localPlayer.id, nick: this.localPlayer.nickname, 
                x: this.localPlayer.pos.x, y: this.localPlayer.pos.y, dir: this.localPlayer.currentDir, 
                stats: { level: this.localPlayer.level, hp: this.localPlayer.hp, maxHp: this.localPlayer.maxHp, tilesCured: this.localPlayer.tilesCured } 
            });
        }

        if (this.localPlayer.pollen > 0 && moving) {
            this.particles.spawnPollen(this.localPlayer.pos.x, this.localPlayer.pos.y);
            this.net.sendPayload({ type: 'POLLEN_BURST', x: this.localPlayer.pos.x, y: this.localPlayer.pos.y });
        }
        
        this.particles.update();
        this.checkRescue();
        this.checkEnvironmentDamage(gx, gy, moving);

        if (this.localPlayer.homeBase && this.localPlayer.tilesCured >= 400) {
            if (Math.random() < 0.05) {
                 const bx = this.localPlayer.homeBase.x + (Math.random() * 4 - 2);
                 const by = this.localPlayer.homeBase.y - (Math.random() * 3);
                 this.particles.spawnSakuraPetal(bx, by);
            }
        }

        this.camera = { x: this.localPlayer.pos.x, y: this.localPlayer.pos.y };
    }

    draw() {
        this.ctx.fillStyle = "#0d0d0d"; 
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if(!this.world) return;

        const rTileSize = this.world.tileSize * this.zoomLevel;
        const cX = Math.floor(this.localPlayer.pos.x / this.world.chunkSize);
        const cY = Math.floor(this.localPlayer.pos.y / this.world.chunkSize);
        const range = this.zoomLevel < 0.8 ? 2 : 1;

        for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
            this.world.getChunk(cX+x, cY+y).forEach(t => {
                const sX = (t.x - this.camera.x)*rTileSize + this.canvas.width/2;
                const sY = (t.y - this.camera.y)*rTileSize + this.canvas.height/2;
                
                if(sX > -rTileSize && sX < this.canvas.width+rTileSize && sY > -rTileSize && sY < this.canvas.height+rTileSize) {
                    const type = this.worldState.getModifiedTile(t.x, t.y) || t.type;
                    if (type === 'TERRA_QUEIMADA' && Math.random() < 0.015) this.particles.spawnSmoke(t.x, t.y);
                    
                    const isBaseTile = this.localPlayer.homeBase && Math.round(t.x) === Math.round(this.localPlayer.homeBase.x) && Math.round(t.y) === Math.round(this.localPlayer.homeBase.y);
                    
                    if (!isBaseTile || type !== 'COLMEIA') {
                        this.ctx.fillStyle = (type === 'COLMEIA') ? '#f1c40f' : (['GRAMA','GRAMA_SAFE','BROTO','MUDA','FLOR', 'FLOR_COOLDOWN'].includes(type) ? '#2ecc71' : '#34495e');
                        this.ctx.fillRect(sX, sY, rTileSize + 1, rTileSize + 1);
                    }

                    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.05)"; 
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(sX, sY, rTileSize, rTileSize);
                    
                    if (type === 'BROTO') { this.ctx.fillStyle = '#006400'; const sz = 12*this.zoomLevel; this.ctx.fillRect(sX+(rTileSize-sz)/2, sY+(rTileSize-sz)/2, sz, sz); }
                    else if (type === 'MUDA') { this.ctx.fillStyle = '#228B22'; const sz = 20*this.zoomLevel; this.ctx.fillRect(sX+(rTileSize-sz)/2, sY+(rTileSize-sz)/2, sz, sz); }
                    else if (['FLOR','FLOR_COOLDOWN'].includes(type) && this.assets.flower.complete) {
                        if (type === 'FLOR_COOLDOWN') this.ctx.globalAlpha = 0.4;
                        const by = rTileSize * 0.65; 
                        this.ctx.fillStyle = "rgba(0,0,0,0.3)"; this.ctx.beginPath(); this.ctx.ellipse(sX+rTileSize/2, sY+by, 8*this.zoomLevel, 3*this.zoomLevel, 0, 0, Math.PI*2); this.ctx.fill();
                        this.ctx.save(); this.ctx.translate(sX+rTileSize/2, sY+by); this.ctx.rotate(Math.sin(Date.now()/800 + t.x*0.5)*0.1); this.ctx.drawImage(this.assets.flower, -rTileSize/2, -rTileSize, rTileSize, rTileSize); this.ctx.restore(); this.ctx.globalAlpha = 1.0;
                    }
                }
            });
        }

        if (this.localPlayer.homeBase) {
            this.drawFragmentedTree(this.ctx, rTileSize);
        }

        this.activeWaves.forEach(wave => wave.draw(this.ctx, this.camera, this.canvas, rTileSize));
        this.enemies.forEach(ant => ant.draw(this.ctx, this.camera, this.canvas, rTileSize));
        this.projectiles.forEach(p => p.draw(this.ctx, this.camera, this.canvas, rTileSize));
        this.particles.draw(this.ctx, this.camera, this.canvas, rTileSize, this.zoomLevel);

        if (this.localPlayer) {
            Object.values(this.remotePlayers).forEach(p => p.draw(this.ctx, this.camera, this.canvas, rTileSize, this.remotePlayers, this.partyMembers, this.localPartyIcon, this.input.isMobile));
            this.localPlayer.draw(this.ctx, this.camera, this.canvas, rTileSize, this.remotePlayers, this.partyMembers, this.localPartyIcon, this.input.isMobile);
            this.drawRescueUI(rTileSize);
            this.drawInvulnerability(rTileSize);
        }

        if (this.localPlayer && this.localPlayer.homeBase && Math.sqrt(Math.pow(this.localPlayer.homeBase.x-this.localPlayer.pos.x,2)+Math.pow(this.localPlayer.homeBase.y-this.localPlayer.pos.y,2)) > 30) {
            const angle = Math.atan2(this.localPlayer.homeBase.y-this.localPlayer.pos.y, this.localPlayer.homeBase.x-this.localPlayer.pos.x);
            const orbit = 60*this.zoomLevel;
            const ax = this.canvas.width/2 + Math.cos(angle)*orbit;
            const ay = this.canvas.height/2 + Math.sin(angle)*orbit;
            this.ctx.save(); this.ctx.translate(ax, ay); this.ctx.rotate(angle); this.ctx.fillStyle = "#f1c40f"; this.ctx.strokeStyle = "black"; this.ctx.lineWidth = 2; this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.lineTo(-10*this.zoomLevel, -5*this.zoomLevel); this.ctx.lineTo(-10*this.zoomLevel, 5*this.zoomLevel); this.ctx.closePath(); this.ctx.fill(); this.ctx.stroke(); this.ctx.restore();
        }
    }

    drawFragmentedTree(ctx, rTileSize) {
        if (!this.localPlayer || !this.localPlayer.homeBase) return;
        const base = this.localPlayer.homeBase;
        const { x: camX, y: camY } = this.camera;
        ctx.save();
        this.treeStructure.forEach(([frameIdx, offX, offY]) => {
            const img = this.assets.treeFrames[frameIdx];
            if (img && img.complete) {
                const sX = (base.x + offX - camX) * rTileSize + this.canvas.width / 2;
                const sY = (base.y + offY - camY) * rTileSize + this.canvas.height / 2;
                ctx.drawImage(img, sX, sY, rTileSize + 1, rTileSize + 1);
            }
        });
        ctx.restore();
    }

    changeTile(x, y, newType, ownerId = null) {
        if(this.worldState.setTile(x, y, newType)) {
            if (this.net.isHost && newType === 'GRAMA') this.worldState.addGrowingPlant(x, y, ownerId);
            if (this.net.isHost && newType === 'FLOR_COOLDOWN') this.worldState.resetPlantTimer(x, y);
            this.net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType, ownerId: ownerId });
        }
    }

    saveProgress(force = false) {
        if (!this.net.isHost || !this.localPlayer) return;
        const now = Date.now(); 
        if (!force && (now - this.lastManualSaveTime < 15000)) return;
        this.lastManualSaveTime = now;
        Object.values(this.remotePlayers).forEach(p => { 
            if (p.nickname) { 
                const stats = p.serialize().stats; 
                stats.x = p.pos.x; stats.y = p.pos.y; 
                this.guestDataDB[p.nickname] = stats; 
            } 
        });
        const hostStats = this.localPlayer.serialize().stats; 
        hostStats.x = this.localPlayer.pos.x; hostStats.y = this.localPlayer.pos.y;
        hostStats.skillPoints = this.localPlayer.skillPoints; 
        hostStats.unlockedSkills = this.localPlayer.skillTree.serialize();
        
        this.saveSystem.save(this.currentWorldId, { 
            seed: this.world.seed, 
            world: this.worldState.getFullState(), 
            host: hostStats, 
            guests: this.guestDataDB, 
            hiveRegistry: this.hiveRegistry,
            pass: this.currentPass || "" // Salva a senha para o meta do SaveSystem
        });
    }

    gainXp(amount) {
        const old = this.localPlayer.level; 
        this.localPlayer.xp += amount;
        if (this.localPlayer.xp >= this.localPlayer.maxXp) {
            this.localPlayer.xp -= this.localPlayer.maxXp; 
            this.localPlayer.level++; 
            this.localPlayer.skillPoints = (this.localPlayer.skillPoints || 0) + 1;
            this.localPlayer.maxXp = Math.floor(this.localPlayer.maxXp * 1.5); 
            this.localPlayer.maxPollen += 10; 
            this.localPlayer.hp = this.localPlayer.maxHp;
            this.chat.addMessage('SYSTEM', null, `Nível ${this.localPlayer.level}!`); 
            this.ui.showError(`Nível ${this.localPlayer.level}!`);
        }
        if (this.localPlayer.level > old) this.saveProgress(true); 
        this.ui.updateHUD(this.localPlayer);
    }

    processShooting() {
        const aim = this.input.getAim();
        if (aim.isFiring) {
            const proj = this.localPlayer.shootPollen(aim.x, aim.y);
            if (proj) {
                this.projectiles.push(new Projectile(proj.x, proj.y, proj.vx, proj.vy, proj.ownerId, proj.damage));
                this.net.sendPayload({ type: 'SHOOT', ownerId: proj.ownerId, x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy, damage: proj.damage });
            }
        }
    }

    tryShoot() {
        const proj = this.localPlayer.shootPollen();
        if (proj) {
            this.projectiles.push(new Projectile(proj.x, proj.y, proj.vx, proj.vy, proj.ownerId, proj.damage));
            this.net.sendPayload({ type: 'SHOOT', ownerId: proj.ownerId, x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy, damage: proj.damage });
        }
    }

    processFaint() {
        this.isFainted = true;
        document.getElementById('faint-screen').style.display = 'flex';
        this.faintTimeout = setTimeout(() => { this.performRespawn(); }, 60000);
    }

    performRespawn() {
        if (this.faintTimeout) clearTimeout(this.faintTimeout);
        this.localPlayer.respawn();
        if (this.localPlayer.homeBase) { this.localPlayer.pos = {...this.localPlayer.homeBase}; this.localPlayer.targetPos = {...this.localPlayer.pos}; }
        document.getElementById('faint-screen').style.display = 'none';
        this.isFainted = false;
        this.invulnerabilityTimer = 180;
        this.ui.updateHUD(this.localPlayer);
        this.net.sendPayload({ type: 'MOVE', id: this.localPlayer.id, nick: this.localPlayer.nickname, x: this.localPlayer.pos.x, y: this.localPlayer.pos.y, dir: this.localPlayer.currentDir });
    }

    checkRescue() {
        let nearbyFaintedPartner = null;
        this.partyMembers.forEach(memberId => {
            if (memberId === this.localPlayer.id) return;
            const partner = this.remotePlayers[memberId];
            if (partner && partner.hp <= 0 && Math.sqrt(Math.pow(this.localPlayer.pos.x - partner.pos.x, 2) + Math.pow(this.localPlayer.pos.y - partner.pos.y, 2)) < 1.5) {
                nearbyFaintedPartner = { id: memberId, nickname: partner.nickname, obj: partner };
                partner.showRescuePrompt = true;
            }
        });
        if (nearbyFaintedPartner) {
            this.currentRescueTarget = nearbyFaintedPartner;
            const canAfford = this.localPlayer.pollen >= this.RESCUE_POLLEN_COST;
            this.input.updateActionButton(true, canAfford ? "⛑️ RESGATAR" : `FALTA PÓLEN`, canAfford ? "#2ecc71" : "#e74c3c");
            if (this.input.isActionActive() && canAfford) {
                this.rescueTimer++;
                if (this.rescueTimer >= this.RESCUE_DURATION) {
                    this.localPlayer.pollen -= this.RESCUE_POLLEN_COST;
                    this.net.sendPayload({ type: 'PARTY_RESCUE', fromNick: this.localPlayer.nickname }, this.currentRescueTarget.id);
                    this.rescueTimer = 0;
                }
            } else { this.rescueTimer = Math.max(0, this.rescueTimer - 2); }
        } else { this.currentRescueTarget = null; this.rescueTimer = 0; this.input.updateActionButton(false); }
    }

    checkEnvironmentDamage(gx, gy, moving) {
        const tile = this.worldState.getModifiedTile(gx, gy) || this.world.getTileAt(gx, gy);
        const isSafe = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(tile);
        if (!isSafe && this.invulnerabilityTimer <= 0) {
            this.damageFrameCounter = (this.damageFrameCounter || 0) + 1;
            if (this.damageFrameCounter >= 2) {
                this.damageFrameCounter = 0;
                this.localPlayer.hp -= 0.2;
                this.ui.updateHUD(this.localPlayer);
                if (this.localPlayer.hp <= 0) this.processFaint();
            }
        }
        const hpRatio = this.localPlayer.hp / this.localPlayer.maxHp;
        const overlay = document.getElementById('suffocation-overlay');
        if (overlay) overlay.style.opacity = hpRatio < 0.7 ? (0.7 - hpRatio) * 1.4 : 0;
        if (tile === 'FLOR' && this.localPlayer.pollen < this.localPlayer.maxPollen) {
            this.collectionFrameCounter = (this.collectionFrameCounter || 0) + 1;
            if (this.collectionFrameCounter >= 5) {
                this.localPlayer.pollen++; this.collectionFrameCounter = 0; this.gainXp(0.2);
                if (this.localPlayer.pollen >= this.localPlayer.maxPollen) this.changeTile(gx, gy, 'FLOR_COOLDOWN', this.localPlayer.id);
            }
        }
        if (tile === 'TERRA_QUEIMADA' && this.localPlayer.pollen > 0 && moving) {
            this.uiUpdateCounter = (this.uiUpdateCounter || 0) + 1;
            if (this.uiUpdateCounter >= 20) {
                this.uiUpdateCounter = 0; this.localPlayer.pollen--;
                if (Math.random() < 0.01) {
                    this.changeTile(gx, gy, 'GRAMA', this.localPlayer.id);
                    this.localPlayer.tilesCured++; this.gainXp(15); this.saveProgress();
                }
                this.ui.updateHUD(this.localPlayer);
            }
        }
    }

    drawRescueUI(rTileSize) {
        if (this.currentRescueTarget && this.rescueTimer > 0) {
            const tPos = this.currentRescueTarget.obj.pos;
            const tScreenX = (tPos.x - this.camera.x) * rTileSize + this.canvas.width / 2;
            const tScreenY = (tPos.y - this.camera.y) * rTileSize + this.canvas.height / 2;
            this.ctx.strokeStyle = "#ffffff"; this.ctx.lineWidth = 4 * this.zoomLevel; this.ctx.beginPath();
            this.ctx.arc(tScreenX, tScreenY, 30 * this.zoomLevel, -Math.PI/2, (-Math.PI/2) + (Math.PI*2 * (this.rescueTimer/this.RESCUE_DURATION)));
            this.ctx.stroke();
        }
    }

    drawInvulnerability(rTileSize) {
        if (this.invulnerabilityTimer > 0) {
            const pScreenX = this.canvas.width / 2;
            const pScreenY = this.canvas.height / 2;
            this.ctx.strokeStyle = `rgba(46, 204, 113, ${this.invulnerabilityTimer/60})`;
            this.ctx.lineWidth = 2 * this.zoomLevel;
            this.ctx.beginPath();
            this.ctx.arc(pScreenX, pScreenY, 20 * this.zoomLevel, 0, Math.PI*2);
            this.ctx.stroke();
        }
    }

    resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }

    setupEventListeners() {
        window.addEventListener('joined', e => this.onJoined(e.detail));
        window.addEventListener('peerDisconnected', e => this.onPeerDisconnected(e.detail));
        window.addEventListener('netData', e => this.onNetData(e.detail));
        window.addEventListener('chatSend', e => this.onChatSend(e.detail));
    }

    setupDOMEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'k' || e.key === 'K') && this.localPlayer?.skillTree) this.localPlayer.skillTree.toggle();
            if ((e.key === ' ' || e.code === 'Space') && this.localPlayer) this.tryShoot();
        });
        window.addEventListener('wheel', (e) => {
            if (e.deltaY < 0) this.zoomLevel = Math.min(2.0, this.zoomLevel + 0.1);
            else this.zoomLevel = Math.max(0.5, this.zoomLevel - 0.1);
        }, { passive: true });
        const btnRespawn = document.getElementById('btn-immediate-respawn');
        if (btnRespawn) btnRespawn.onclick = (e) => { e.preventDefault(); if (this.isFainted) this.performRespawn(); };
        const btnJoin = document.getElementById('btn-join');
        if (btnJoin) btnJoin.onpointerdown = (e) => {
            e.preventDefault();
            const nick = document.getElementById('join-nickname').value.trim() || "Guest";
            const id = document.getElementById('join-id').value.trim();
            const pass = document.getElementById('join-pass').value.trim();
            if(!id) return this.ui.showError("ID Obrigatório!");
            localStorage.setItem('wings_nick', nick);
            this.net.init(null, (ok) => { if(ok) this.net.joinRoom(id, pass, nick); });
        };
        const btnCreate = document.getElementById('btn-create');
        if (btnCreate) btnCreate.onpointerdown = (e) => {
            e.preventDefault();
            const nick = document.getElementById('host-nickname').value.trim() || "Host";
            const id = document.getElementById('create-id').value.trim();
            const pass = document.getElementById('create-pass').value.trim();
            const seed = document.getElementById('world-seed').value.trim() || Date.now().toString();
            if(!id) return this.ui.showError("ID Obrigatório!");
            
            // Armazena a senha para salvar no meta depois
            this.currentPass = pass;
            
            localStorage.setItem('wings_nick', nick);
            this.net.init(id, (ok) => {
                if(ok) { this.net.hostRoom(id, pass, seed, () => this.worldState.getFullState(), (n) => this.guestDataDB[n], () => this.guestDataDB); this.start(seed, id, nick); }
            });
        };

        // GATILHO PARA RENDERIZAR A LISTA DE SAVES
        const btnOpenLoadMenu = document.querySelector('button[onclick*="modal-load"]');
        if (btnOpenLoadMenu) {
            btnOpenLoadMenu.addEventListener('click', () => {
                this.ui.renderSaveList(this.saveSystem, (id, pass, seed, nick) => {
                    localStorage.setItem('wings_nick', nick);
                    this.currentPass = pass; // Define a senha para o contexto atual
                    this.net.init(id, (ok) => {
                        if(ok) { 
                            this.net.hostRoom(id, pass, seed, () => this.worldState.getFullState(), (n) => this.guestDataDB[n], () => this.guestDataDB); 
                            this.start(seed, id, nick); 
                        } else {
                            this.ui.showError("Falha ao inicializar conexão.");
                        }
                    });
                });
            });
        }

        this.setupPartyEvents();
    }

    setupPartyEvents() {
        window.addEventListener('playerClicked', e => {
            const targetNick = e.detail;
            let targetId = Object.keys(this.remotePlayers).find(id => this.remotePlayers[id].nickname === targetNick);
            if (targetId) {
                this.selectedPlayerId = targetId; 
                const p = this.remotePlayers[targetId];
                document.getElementById('modal-player-name').innerText = p.nickname;
                document.getElementById('modal-player-info').innerText = `Nível: ${p.level || 1}`;
                document.getElementById('player-modal').style.display = 'block';
                const btnWhisper = document.getElementById('btn-whisper-action');
                if (btnWhisper) btnWhisper.onclick = () => { this.chat.openPrivateTab(p.nickname); document.getElementById('player-modal').style.display = 'none'; };
                const btnParty = document.getElementById('btn-party-action');
                if (btnParty) {
                    if (this.partyMembers.includes(targetId)) { btnParty.innerText = "Sair da Party"; btnParty.style.background = "#e74c3c"; }
                    else { btnParty.innerText = "Convidar"; btnParty.style.background = "#f1c40f"; }
                }
            }
        });
        document.getElementById('btn-party-action').onclick = () => {
             if (!this.selectedPlayerId) return;
             if (this.partyMembers.includes(this.selectedPlayerId)) {
                 this.net.sendPayload({ type: 'PARTY_LEAVE', fromId: this.localPlayer.id }, this.partyMembers);
                 this.partyMembers = []; this.chat.closePartyTab();
             } else {
                 if (this.partyMembers.length > 0) { this.net.sendPayload({ type: 'PARTY_INVITE', fromId: this.localPlayer.id, fromNick: this.localPlayer.nickname, pName: this.localPartyName, pIcon: this.localPartyIcon }, this.selectedPlayerId); }
                 else { document.getElementById('party-create-modal').style.display = 'block'; }
             }
             document.getElementById('player-modal').style.display = 'none';
        };
        document.getElementById('btn-confirm-party-create').onclick = () => {
            const pName = document.getElementById('party-name-input').value.toUpperCase().trim() || "ALFA";
            const pIcon = "🛡️"; 
            this.localPartyName = pName; this.localPartyIcon = pIcon;
            this.partyMembers = [this.localPlayer.id];
            if (this.selectedPlayerId) { this.net.sendPayload({ type: 'PARTY_INVITE', fromId: this.localPlayer.id, fromNick: this.localPlayer.nickname, pName, pIcon }, this.selectedPlayerId); this.chat.openPartyTab(pName, pIcon); }
            document.getElementById('party-create-modal').style.display = 'none';
        };
        document.getElementById('btn-accept-invite').onclick = () => {
            if (this.pendingInviteFrom) {
                if (!this.partyMembers.includes(this.pendingInviteFrom)) this.partyMembers.push(this.pendingInviteFrom);
                this.localPartyName = this.pendingInviteData.pName; this.localPartyIcon = this.pendingInviteData.pIcon;
                this.net.sendPayload({ type: 'PARTY_ACCEPT', fromId: this.localPlayer.id, fromNick: this.localPlayer.nickname, pName: this.localPartyName, pIcon: this.localPartyIcon }, this.pendingInviteFrom);
                this.chat.openPartyTab(this.localPartyName, this.localPartyIcon);
                document.getElementById('party-invite-popup').style.display = 'none';
            }
        };
    }

    onJoined(data) {
        if (data.worldState) this.worldState.applyFullState(data.worldState);
        if (data.guests) this.guestDataDB = data.guests; 
        this.start(data.seed, this.net.peer.id, document.getElementById('join-nickname').value.trim() || "Guest");
        if (data.playerData) { this.localPlayer.deserialize(data.playerData); this.ui.updateHUD(this.localPlayer); }
    }

    onPeerDisconnected(data) {
        const peerId = data.peerId;
        if (this.remotePlayers[peerId]) {
            const p = this.remotePlayers[peerId];
            this.chat.addMessage('SYSTEM', null, `${p.nickname} saiu.`);
            if (this.partyMembers.includes(peerId)) { this.partyMembers = this.partyMembers.filter(id => id !== peerId); if (this.partyMembers.length === 0) this.chat.closePartyTab(); }
            if (p.nickname) { const stats = p.serialize().stats; stats.x = p.pos.x; stats.y = p.pos.y; this.guestDataDB[p.nickname] = stats; }
            this.saveProgress(true); delete this.remotePlayers[peerId];
        }
    }

    onChatSend(data) {
        if (!this.localPlayer) return;
        if (data.type === 'GLOBAL') this.net.sendPayload({ type: 'CHAT_MSG', id: this.localPlayer.id, nick: this.localPlayer.nickname, text: data.text });
        else if (data.type === 'PARTY') { if (this.partyMembers.length > 0) this.net.sendPayload({ type: 'PARTY_MSG', fromNick: this.localPlayer.nickname, text: data.text }, this.partyMembers); }
        else if (data.type === 'WHISPER') { const targetId = Object.keys(this.remotePlayers).find(id => this.remotePlayers[id].nickname === data.target); if (targetId) this.net.sendPayload({ type: 'WHISPER', fromNick: this.localPlayer.nickname, text: data.text }, targetId); }
    }

    onNetData(d) {
        if (d.type === 'TIME_SYNC') { this.worldState.worldTime = d.time; }
        if (d.type === 'WHISPER') this.chat.addMessage('WHISPER', d.fromNick, d.text);
        if (d.type === 'CHAT_MSG') this.chat.addMessage('GLOBAL', d.nick, d.text);
        if (d.type === 'PARTY_MSG') this.chat.addMessage('PARTY', d.fromNick, d.text);
        if (d.type === 'POLLEN_BURST') this.particles.spawnPollen(d.x, d.y);
        if (d.type === 'SHOOT') this.projectiles.push(new Projectile(d.x, d.y, d.vx, d.vy, d.ownerId, d.damage));
        if (d.type === 'SPAWN_ENEMY') this.enemies.push(new Ant(d.id, d.x, d.y, d.type));
        
        if (d.type === 'WAVE_SPAWN') {
            const wave = new WaveEffect(d.x, d.y, d.radius, d.color || "rgba(241, 196, 15, ALPHA)", d.amount);
            if (d.color && (d.color.includes('241, 196, 15') || d.color.includes('46, 204, 113'))) {
                wave.isHeal = true;
            }
            this.activeWaves.push(wave);
        }

        if (d.type === 'PLAYER_HEAL') {
            this.localPlayer.applyHeal(d.amount || 10);
            this.ui.updateHUD(this.localPlayer);
            this.particles.spawnPollen(this.localPlayer.pos.x, this.localPlayer.pos.y);
        }

        if (d.type === 'PARTY_INVITE') { this.pendingInviteFrom = d.fromId; this.pendingInviteData = d; document.getElementById('invite-msg').innerText = `${d.fromNick} convidou você!`; document.getElementById('party-invite-popup').style.display = 'block'; }
        if (d.type === 'PARTY_ACCEPT') { if (!this.partyMembers.includes(d.fromId)) this.partyMembers.push(d.fromId); this.localPartyName = d.pName; this.localPartyIcon = d.pIcon; this.chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou.`); this.chat.openPartyTab(d.pName, d.pIcon); if (this.partyMembers.length > 1) this.net.sendPayload({ type: 'PARTY_SYNC', members: this.partyMembers, pName: d.pName, pIcon: d.pIcon }, d.fromId); }
        if (d.type === 'PARTY_SYNC') { this.localPartyName = d.pName; this.localPartyIcon = d.pIcon; d.members.forEach(id => { if (!this.partyMembers.includes(id)) this.partyMembers.push(id); }); this.chat.openPartyTab(d.pName, d.pIcon); this.ui.updateHUD(this.localPlayer); }
        if (d.type === 'PARTY_LEAVE') { this.chat.addMessage('SYSTEM', null, `Alguém saiu.`); this.partyMembers = this.partyMembers.filter(id => id !== d.fromId); if (this.partyMembers.length === 0) this.chat.closePartyTab(); }
        
        if (d.type === 'PARTY_RESCUE') {
            if (this.isFainted) {
                clearTimeout(this.faintTimeout);
                this.isFainted = false;
                this.localPlayer.hp = 25;
                this.localPlayer.pollen = Math.max(0, this.localPlayer.pollen - 10);
                this.invulnerabilityTimer = 180;
                document.getElementById('faint-screen').style.display = 'none';
            } else {
                this.localPlayer.applyHeal(d.amount || 15);
            }
            this.ui.updateHUD(this.localPlayer);
        }

        if (d.type === 'SPAWN_INFO') { if (!this.remotePlayers[d.id]) this.remotePlayers[d.id] = new Player(d.id, d.nick || "Guest"); this.remotePlayers[d.id].pos = { x: d.x, y: d.y }; this.remotePlayers[d.id].targetPos = { x: d.x, y: d.y }; if (this.net.isHost && d.nick && this.guestDataDB[d.nick]) { const savedStats = this.guestDataDB[d.nick]; this.remotePlayers[d.id].deserialize({ stats: savedStats }); this.net.sendPayload({ type: 'RESTORE_STATS', stats: savedStats }, d.id); } }
        if (d.type === 'RESTORE_STATS') { if (this.localPlayer) { this.localPlayer.deserialize({ stats: d.stats }); if (d.stats.x !== undefined) { this.localPlayer.pos.x = d.stats.x; this.localPlayer.pos.y = d.stats.y; this.localPlayer.targetPos = { ...this.localPlayer.pos }; } this.ui.updateHUD(this.localPlayer); } }
        if (d.type === 'FLOWER_CURE') { if (this.localPlayer && d.ownerId === this.localPlayer.id) { this.localPlayer.tilesCured++; } if (this.remotePlayers[d.ownerId]) this.remotePlayers[d.ownerId].tilesCured++; }
        if(d.type === 'MOVE') { if (this.net.isHost && !this.net.authenticatedPeers.has(d.id)) return; if(!this.remotePlayers[d.id]) { this.remotePlayers[d.id] = new Player(d.id, d.nick || "Guest"); } this.remotePlayers[d.id].targetPos = { x: d.x, y: d.y }; this.remotePlayers[d.id].currentDir = d.dir; if (d.stats) this.remotePlayers[d.id].deserialize({ stats: d.stats }); }
        if(d.type === 'TILE_CHANGE') this.changeTile(d.x, d.y, d.tileType, d.ownerId);
    }
}
