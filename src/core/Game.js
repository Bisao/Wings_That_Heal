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
        this.localPlayer = null;
        this.remotePlayers = {};
        this.camera = { x: 0, y: 0 };
        this.enemies = [];
        this.projectiles = [];
        this.activeWaves = [];
        
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
            treeFrames: [] // Array para os 34 frames fatiados
        };
        this.assets.flower.src = 'assets/Flower.png';
        
        // Carregamento automático dos 34 frames (frame_000.png até frame_033.png)
        for(let i = 0; i < 34; i++) {
            const img = new Image();
            const frameNum = String(i).padStart(3, '0');
            img.src = `assets/frame_${frameNum}.png`; 
            this.assets.treeFrames.push(img);
        }

        // Mapeamento da estrutura da Árvore (Relativo ao tile da Colmeia)
        // Formato: [index_do_frame, offset_x, offset_y]
        // Frame 032 é a base/colmeia central.
        this.treeStructure = [
            [32, 0, 0],   // Colmeia Base
            [31, -1, 0],  // Exemplo de peças adjacentes
            [33, 1, 0],
            [28, 0, -1],  // Exemplo de tronco acima
            // Nota: Adicione aqui as coordenadas para os outros frames
        ];

        if (this.input.isMobile && typeof this.input.hideJoystick === 'function') {
            this.input.hideJoystick();
        }

        this.setupEventListeners();
        this.setupDOMEvents();
    }

    start(seed, id, nick) {
        if (typeof this.input.hideJoystick === 'function') this.input.hideJoystick();
        
        let loader = document.getElementById('loading-screen');
        if (!loader) {
            loader = document.createElement('div'); loader.id = 'loading-screen';
            loader.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 99999; display: block;";
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
            const saved = this.saveSystem.load();
            if (saved) { 
                this.hiveRegistry = saved.hiveRegistry || {}; 
                if (this.hiveRegistry[nick] === undefined) this.hiveRegistry[nick] = 0;
                this.worldState.applyFullState(saved.world);
                if (saved.host) {
                    this.localPlayer.deserialize({ stats: saved.host });
                }
                this.guestDataDB = saved.guests || {};
            }
        }

        let spawnIdx = 0;
        if (hives[spawnIdx]) { 
            this.localPlayer.homeBase = { x: hives[spawnIdx].x, y: hives[spawnIdx].y }; 
            this.localPlayer.pos = { x: hives[spawnIdx].x, y: hives[spawnIdx].y }; 
            this.localPlayer.targetPos = { ...this.localPlayer.pos }; 
        }

        this.net.sendPayload({ type: 'SPAWN_INFO', id: this.localPlayer.id, nick: this.localPlayer.nickname, x: this.localPlayer.pos.x, y: this.localPlayer.pos.y });
        
        this.resize();
        requestAnimationFrame(() => this.loop());

        setTimeout(() => {
            if (loader) loader.style.display = 'none';
            document.getElementById('rpg-hud').style.display = 'block';
            document.getElementById('chat-toggle-btn').style.display = 'flex'; 
            this.canvas.style.display = 'block';
            this.resize(); 
        }, 2500); 
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
                    this.ui.updateHUD(this.localPlayer);
                    if (this.localPlayer.hp <= 0) this.processFaint();
                }
            }
        });

        const m = this.input.getMovement();
        this.localPlayer.update(m);
        this.processShooting();

        if(m.x !== 0 || m.y !== 0) {
            this.localPlayer.pos.x += m.x * this.localPlayer.speed;
            this.localPlayer.pos.y += m.y * this.localPlayer.speed;
            this.net.sendPayload({ type: 'MOVE', id: this.localPlayer.id, x: this.localPlayer.pos.x, y: this.localPlayer.pos.y, dir: this.localPlayer.currentDir });
        }

        if (this.localPlayer.pollen > 0 && (m.x !== 0 || m.y !== 0)) {
            this.particles.spawnPollen(this.localPlayer.pos.x, this.localPlayer.pos.y);
        }
        
        this.particles.update();
        this.checkRescue();
        this.checkEnvironmentDamage(gx, gy, (m.x !== 0 || m.y !== 0));

        // Partículas Sakura na Base
        if (this.localPlayer.homeBase && this.localPlayer.tilesCured >= 400) {
            if (Math.random() < 0.05) {
                 this.particles.spawnSakuraPetal(this.localPlayer.homeBase.x + (Math.random()*4-2), this.localPlayer.homeBase.y - Math.random()*3);
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

        // 1. Desenha Terreno e Linhas do Grid
        for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
            this.world.getChunk(cX+x, cY+y).forEach(t => {
                const sX = (t.x - this.camera.x)*rTileSize + this.canvas.width/2;
                const sY = (t.y - this.camera.y)*rTileSize + this.canvas.height/2;
                
                if(sX > -rTileSize && sX < this.canvas.width+rTileSize && sY > -rTileSize && sY < this.canvas.height+rTileSize) {
                    const type = this.worldState.getModifiedTile(t.x, t.y) || t.type;
                    
                    // Desenha o Tile
                    this.ctx.fillStyle = (type === 'COLMEIA') ? '#f1c40f' : (['GRAMA','GRAMA_SAFE','FLOR'].includes(type) ? '#2ecc71' : '#34495e');
                    this.ctx.fillRect(sX, sY, rTileSize + 1, rTileSize + 1);

                    // ATIVAÇÃO DAS LINHAS DO GRID
                    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(sX, sY, rTileSize, rTileSize);
                    
                    if (['FLOR'].includes(type) && this.assets.flower.complete) {
                        this.ctx.drawImage(this.assets.flower, sX, sY, rTileSize, rTileSize);
                    }
                }
            });
        }

        // 2. Desenha a Árvore de Sakura Montada (Fragmentada)
        if (this.localPlayer.homeBase) {
            this.drawFragmentedTree(this.ctx, rTileSize);
        }

        // 3. Desenha Efeitos e Jogadores
        this.activeWaves.forEach(wave => wave.draw(this.ctx, this.camera, this.canvas, rTileSize));
        this.enemies.forEach(ant => ant.draw(this.ctx, this.camera, this.canvas, rTileSize));
        this.projectiles.forEach(p => p.draw(this.ctx, this.camera, this.canvas, rTileSize));
        this.particles.draw(this.ctx, this.camera, this.canvas, rTileSize, this.zoomLevel);

        if (this.localPlayer) {
            Object.values(this.remotePlayers).forEach(p => p.draw(this.ctx, this.camera, this.canvas, rTileSize));
            this.localPlayer.draw(this.ctx, this.camera, this.canvas, rTileSize);
            this.drawRescueUI(rTileSize);
            this.drawInvulnerability(rTileSize);
        }
    }

    // SISTEMA DE MONTAGEM DA ÁRVORE TILE POR TILE
    drawFragmentedTree(ctx, rTileSize) {
        const basePos = this.localPlayer.homeBase;
        const progress = Math.min(this.localPlayer.tilesCured / 500, 1);
        
        ctx.save();
        // Filtro de cura baseado no progresso mundial
        ctx.filter = `grayscale(${100 - (progress * 100)}%) brightness(${0.7 + (progress * 0.3)})`;

        this.treeStructure.forEach(([frameIdx, offX, offY]) => {
            const frameImg = this.assets.treeFrames[frameIdx];
            if (!frameImg || !frameImg.complete) return;

            // Calcula a posição do fragmento no grid
            const sX = (basePos.x + offX - this.camera.x) * rTileSize + this.canvas.width / 2;
            const sY = (basePos.y + offY - this.camera.y) * rTileSize + this.canvas.height / 2;

            // Renderiza o frame 32x32 preenchendo exatamente um tile
            ctx.drawImage(frameImg, sX, sY, rTileSize + 1, rTileSize + 1);
        });

        ctx.restore();
    }

    changeTile(x, y, newType, ownerId = null) {
        if(this.worldState.setTile(x, y, newType)) {
            this.net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType, ownerId: ownerId });
        }
    }

    saveProgress(force = false) {
        if (!this.net.isHost || !this.localPlayer) return;
        const hostStats = this.localPlayer.serialize().stats; 
        this.saveSystem.save({ seed: this.world.seed, world: this.worldState.getFullState(), host: hostStats, guests: this.guestDataDB, hiveRegistry: this.hiveRegistry });
    }

    gainXp(amount) {
        this.localPlayer.xp += amount;
        if (this.localPlayer.xp >= this.localPlayer.maxXp) {
            this.localPlayer.level++;
            this.localPlayer.xp = 0;
            this.ui.updateHUD(this.localPlayer);
        }
    }

    processShooting() {
        const aim = this.input.getAim();
        if (aim.isFiring) {
            const proj = this.localPlayer.shootPollen(aim.x, aim.y);
            if (proj) {
                this.projectiles.push(new Projectile(proj.x, proj.y, proj.vx, proj.vy, proj.ownerId, proj.damage));
                this.net.sendPayload({ type: 'SHOOT', x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy });
            }
        }
    }

    tryShoot() {
        const proj = this.localPlayer.shootPollen();
        if (proj) {
            this.projectiles.push(new Projectile(proj.x, proj.y, proj.vx, proj.vy, proj.ownerId, proj.damage));
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
        document.getElementById('faint-screen').style.display = 'none';
        this.isFainted = false;
        this.invulnerabilityTimer = 180;
    }

    checkRescue() {
        // Implementação simplificada de resgate
        if (this.currentRescueTarget) {
            this.rescueTimer++;
            if (this.rescueTimer >= this.RESCUE_DURATION) {
                this.rescueTimer = 0;
            }
        }
    }

    checkEnvironmentDamage(gx, gy, moving) {
        const tile = this.worldState.getModifiedTile(gx, gy) || this.world.getTileAt(gx, gy);
        const isSafe = ['GRAMA', 'FLOR', 'COLMEIA'].includes(tile);
        if (!isSafe && this.invulnerabilityTimer <= 0) {
            this.localPlayer.hp -= 0.1;
            this.ui.updateHUD(this.localPlayer);
            if (this.localPlayer.hp <= 0) this.processFaint();
        }
        if (tile === 'FLOR' && this.localPlayer.pollen < this.localPlayer.maxPollen) {
            this.localPlayer.pollen += 0.2;
            this.gainXp(0.1);
        }
        if (tile === 'TERRA_QUEIMADA' && this.localPlayer.pollen > 0 && moving) {
            if (Math.random() < 0.01) {
                this.changeTile(gx, gy, 'GRAMA', this.localPlayer.id);
                this.localPlayer.tilesCured++;
                this.gainXp(10);
            }
        }
    }

    drawRescueUI(rTileSize) {
        if (this.currentRescueTarget && this.rescueTimer > 0) {
             // Desenha círculo de progresso
        }
    }

    drawInvulnerability(rTileSize) {
        if (this.invulnerabilityTimer > 0) {
            this.ctx.strokeStyle = "rgba(46, 204, 113, 0.5)";
            this.ctx.beginPath();
            this.ctx.arc(this.canvas.width/2, this.canvas.height/2, 20*this.zoomLevel, 0, Math.PI*2);
            this.ctx.stroke();
        }
    }

    resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }

    setupEventListeners() {
        window.addEventListener('joined', e => this.onJoined(e.detail));
        window.addEventListener('netData', e => this.onNetData(e.detail));
    }

    setupDOMEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => {
            if (e.key === ' ' && this.localPlayer) this.tryShoot();
        });
        window.addEventListener('wheel', (e) => {
            if (e.deltaY < 0) this.zoomLevel = Math.min(2.0, this.zoomLevel + 0.1);
            else this.zoomLevel = Math.max(0.5, this.zoomLevel - 0.1);
        }, { passive: true });
        
        const btnJoin = document.getElementById('btn-join');
        if (btnJoin) btnJoin.onpointerdown = () => {
            const nick = document.getElementById('join-nickname').value || "Guest";
            const id = document.getElementById('join-id').value;
            this.net.init(null, (ok) => { if(ok) this.net.joinRoom(id, "", nick); });
        };
        const btnCreate = document.getElementById('btn-create');
        if (btnCreate) btnCreate.onpointerdown = () => {
            const nick = document.getElementById('host-nickname').value || "Host";
            const id = document.getElementById('create-id').value;
            this.net.init(id, (ok) => {
                if(ok) { this.net.hostRoom(id, "", "SEED", () => {}, () => {}); this.start("SEED", id, nick); }
            });
        };
        this.setupPartyEvents();
    }

    setupPartyEvents() {
        // Implementação de eventos de grupo
    }

    onJoined(data) {
        this.start(data.seed, this.net.peer.id, "Player");
    }

    onNetData(d) {
        if(d.type === 'MOVE') {
            if(!this.remotePlayers[d.id]) this.remotePlayers[d.id] = new Player(d.id, "Guest");
            this.remotePlayers[d.id].pos = { x: d.x, y: d.y };
        }
        if(d.type === 'TILE_CHANGE') this.changeTile(d.x, d.y, d.tileType);
    }
}
