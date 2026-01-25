import { NetworkManager } from './core/network.js';
import { WorldGenerator } from './world/worldGen.js';
import { WorldState } from './world/worldState.js';
import { Player } from './entities/player.js';
import { InputHandler } from './core/input.js';
import { SaveSystem } from './core/saveSystem.js';
import { ChatSystem } from './core/chatSystem.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const net = new NetworkManager();
const input = new InputHandler(); 
const worldState = new WorldState();
const saveSystem = new SaveSystem();
const chat = new ChatSystem();

let world, localPlayer;
let remotePlayers = {};
let pollenParticles = [];
let smokeParticles = []; 
let camera = { x: 0, y: 0 };

// Banco de dados em memória para ranking de offline players
let guestDataDB = {}; 

let zoomLevel = 1.0; 
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

const PLANT_SPAWN_CHANCE = 0.20; 
const CURE_ATTEMPT_RATE = 60;    
const FLOWER_COOLDOWN_TIME = 10000;
const COLLECTION_RATE = 5; 

// --- BALANCEAMENTO ---
const DAMAGE_RATE = 2; 
const DAMAGE_AMOUNT = 0.2; 
const HEAL_RATE = 1;    
const HEAL_AMOUNT = 1;   
const XP_PER_CURE = 15;    
const XP_PER_POLLEN = 0.2;
const XP_PASSIVE_CURE = 5; // XP que ganha quando sua flor cura sozinha

const GROWTH_TIMES = { BROTO: 5000, MUDA: 10000, FLOR: 15000 };

let collectionFrameCounter = 0;
let cureFrameCounter = 0;
let damageFrameCounter = 0;
let uiUpdateCounter = 0; 

const assets = { flower: new Image() };
assets.flower.src = 'assets/Flower.png';

// --- UI HANDLERS ---
document.getElementById('btn-create').onclick = () => {
    const nick = document.getElementById('host-nickname').value || "Host";
    const id = document.getElementById('create-id').value;
    const pass = document.getElementById('create-pass').value;
    const seed = document.getElementById('world-seed').value || Date.now().toString();
    if(!id) return alert("ID obrigatório");
    
    net.init(id, (ok) => {
        if(ok) {
            net.hostRoom(id, pass, seed, 
                () => worldState.getFullState(), 
                (guestNick) => guestDataDB[guestNick] 
            );
            startGame(seed, id, nick);
            if(net.isHost) startHostSimulation();
        } else { document.getElementById('status-msg').innerText = "Erro ao criar sala."; }
    });
};

document.getElementById('btn-join').onclick = () => {
    const nick = document.getElementById('join-nickname').value || "Guest";
    const id = document.getElementById('join-id').value;
    const pass = document.getElementById('join-pass').value;
    if(!id) return alert("ID obrigatório");

    net.init(null, (ok) => { 
        if(ok) net.joinRoom(id, pass, nick); 
        else document.getElementById('status-msg').innerText = "Erro ao conectar.";
    });
};

// --- CONTROLES DE ZOOM ---
window.addEventListener('wheel', (e) => {
    if (!localPlayer) return;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    zoomLevel += delta;
    if (zoomLevel < MIN_ZOOM) zoomLevel = MIN_ZOOM;
    if (zoomLevel > MAX_ZOOM) zoomLevel = MAX_ZOOM;
    const slider = document.getElementById('zoom-slider');
    if (slider) slider.value = zoomLevel;
}, { passive: true });

const zoomSlider = document.getElementById('zoom-slider');
if(zoomSlider) { zoomSlider.addEventListener('input', (e) => { zoomLevel = parseFloat(e.target.value); }); }

// --- CHAT ---
window.addEventListener('chatSend', e => {
    const msgText = e.detail;
    if (!localPlayer) return;
    chat.addMessage('SELF', localPlayer.nickname, msgText);
    net.sendPayload({ type: 'CHAT_MSG', id: localPlayer.id, nick: localPlayer.nickname, text: msgText });
});

// --- EVENTOS DE REDE ---

window.addEventListener('joined', e => {
    const data = e.detail;
    if (data.worldState) worldState.applyFullState(data.worldState);
    const nick = document.getElementById('join-nickname').value || "Guest";
    startGame(data.seed, net.peer.id, nick);
    if (data.playerData) {
        console.log("📥 Carregando save recuperado do Host...");
        localPlayer.deserialize(data.playerData);
        updateUI();
    }
});

window.addEventListener('peerDisconnected', e => {
    const peerId = e.detail.peerId;
    if (remotePlayers[peerId]) {
        const p = remotePlayers[peerId];
        console.log(`🔌 Jogador ${p.nickname} desconectou.`);
        chat.addMessage('SYSTEM', null, `${p.nickname || 'Alguém'} saiu do jogo.`);
        
        // Salva dados ao sair
        guestDataDB[p.nickname] = p.serialize().stats;
        saveProgress(); // Salva DB no disco

        delete remotePlayers[peerId];
        updateRanking(); 
    }
});

window.addEventListener('netData', e => {
    const d = e.detail;

    if (d.type === 'CHAT_MSG') {
        chat.addMessage('GLOBAL', d.nick, d.text);
    }

    // EVENTO DE CURA PASSIVA (Flor curou sozinha)
    if (d.type === 'FLOWER_CURE') {
        // Se eu sou o dono da flor que curou, ganho pontos e XP
        if (localPlayer && d.ownerId === localPlayer.id) {
            localPlayer.tilesCured++;
            gainXp(XP_PASSIVE_CURE);
            // Efeito visual no player ou som poderia vir aqui
        }
        // Se foi outro player, atualizamos o ranking visualmente se tivermos o objeto dele
        if (remotePlayers[d.ownerId]) {
            remotePlayers[d.ownerId].tilesCured = (remotePlayers[d.ownerId].tilesCured || 0) + 1;
        }
    }

    if(d.type === 'MOVE') {
        if(!remotePlayers[d.id]) {
            remotePlayers[d.id] = new Player(d.id, d.nick);
            chat.addMessage('SYSTEM', null, `${d.nick} entrou no mundo.`);
        }
        remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
        remotePlayers[d.id].currentDir = d.dir;
        if (d.stats) remotePlayers[d.id].deserialize({ stats: d.stats });
    }

    if(d.type === 'TILE_CHANGE') {
        // Agora passamos o ownerId se vier no pacote
        changeTile(d.x, d.y, d.tileType, d.ownerId); 
    }
});

// --- LÓGICA DE JOGO ---

function startGame(seed, id, nick) {
    document.getElementById('lobby-overlay').style.display = 'none';
    document.getElementById('rpg-hud').style.display = 'block';
    document.getElementById('chat-toggle-btn').style.display = 'block';
    
    chat.addMessage('SYSTEM', null, "Bem-vindo ao Wings That Heal!");
    chat.addMessage('SYSTEM', null, "Flores maduras curam a terra ao redor automaticamente!");

    canvas.style.display = 'block';
    if (input.isMobile) {
        document.getElementById('zoom-controls').style.display = 'flex';
        document.getElementById('mobile-controls').style.display = 'block';
    }

    world = new WorldGenerator(seed);
    localPlayer = new Player(id, nick, true);

    if (net.isHost) {
        const savedGame = saveSystem.load();
        if (savedGame) {
            worldState.applyFullState(savedGame.world);
            if (savedGame.host) localPlayer.deserialize({ stats: savedGame.host });
            guestDataDB = savedGame.guests || {};
            if (savedGame.seed && savedGame.seed !== seed) {
                console.warn("Atenção: Carregando save com seed diferente.");
                world = new WorldGenerator(savedGame.seed);
            }
        }
    }
    
    updateUI(); 
    resize();
    requestAnimationFrame(loop);
}

function startHostSimulation() {
    // Loop de Crescimento e Cura Passiva
    setInterval(() => {
        const now = Date.now();
        let changed = false;

        for (const [key, plantData] of Object.entries(worldState.growingPlants)) {
            // Suporte a save antigo (se plantData for número, converte)
            const startTime = plantData.time || plantData;
            const ownerId = plantData.owner || null;

            const [x, y] = key.split(',').map(Number);
            const elapsed = now - startTime;
            const currentType = worldState.getModifiedTile(x, y);

            // Estágios de crescimento
            if (currentType === 'GRAMA' && elapsed > GROWTH_TIMES.BROTO) changeTile(x, y, 'BROTO', ownerId);
            else if (currentType === 'BROTO' && elapsed > GROWTH_TIMES.MUDA) changeTile(x, y, 'MUDA', ownerId);
            else if (currentType === 'MUDA' && elapsed > GROWTH_TIMES.FLOR) {
                changeTile(x, y, 'FLOR', ownerId);
                // Não removemos do growingPlants aqui para ela continuar ativa curando!
                // Mas precisamos marcar que ela já é adulta para não tentar virar flor de novo?
                // O check 'currentType === MUDA' já resolve.
            }

            // MECÂNICA DE CURA 3x3 (Apenas Flores Maduras)
            if (currentType === 'FLOR') {
                // 10% de chance por segundo de tentar curar um vizinho
                if (Math.random() < 0.10) {
                    // Escolhe um vizinho aleatório
                    const dx = Math.floor(Math.random() * 3) - 1;
                    const dy = Math.floor(Math.random() * 3) - 1;
                    if (dx === 0 && dy === 0) continue;

                    const tx = x + dx;
                    const ty = y + dy;
                    
                    const targetType = worldState.getModifiedTile(tx, ty) || world.getTileAt(tx, ty);
                    
                    if (targetType === 'TERRA_QUEIMADA') {
                        // Cura para GRAMA_SAFE (Não gera novas plantas para evitar infinito)
                        changeTile(tx, ty, 'GRAMA_SAFE');
                        
                        // Notifica rede sobre a cura (para dar XP/Score ao dono)
                        if (ownerId) {
                            net.sendPayload({ type: 'FLOWER_CURE', ownerId: ownerId, x: tx, y: ty });
                            
                            // Se o dono sou eu (Host), ganho aqui mesmo
                            if (ownerId === localPlayer.id) {
                                localPlayer.tilesCured++;
                                gainXp(XP_PASSIVE_CURE);
                            } 
                            // Se for guest offline, atualiza DB
                            else if (guestDataDB[ownerId]) { // TODO: Usar nick ou ID no DB? Estamos usando Nick no main, mas ID aqui. 
                                // Simplificação: Atualiza se estiver online via remotePlayers no netData, 
                                // mas se estiver offline o Host precisaria achar pelo ID.
                                // Por enquanto, foca nos online.
                            }
                        }
                        
                        changed = true; // Marca para salvar
                    }
                }
            }
        }
        
        // Se houve cura automática, salva o jogo
        if (changed) saveProgress();

    }, 1000);

    // Auto-Save periódico de segurança (30s)
    setInterval(() => {
        saveProgress();
    }, 30000); 
}

function saveProgress() {
    if (!net.isHost || !localPlayer) return;
    
    // Atualiza DB com players online
    Object.values(remotePlayers).forEach(p => {
        if (p.nickname) guestDataDB[p.nickname] = p.serialize().stats;
    });

    const fullData = {
        seed: world.seed,
        world: worldState.getFullState(),
        host: localPlayer.serialize().stats,
        guests: guestDataDB
    };
    saveSystem.save(fullData);
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

function update() {
    if(!localPlayer) return;

    const m = input.getMovement();
    if (input.isMobile && input.rightStick) {
        const aim = input.rightStick.vector;
        if (aim.x !== 0 || aim.y !== 0) {
            if (Math.abs(aim.x) > Math.abs(aim.y)) localPlayer.currentDir = aim.x > 0 ? 'Right' : 'Left';
            else localPlayer.currentDir = aim.y > 0 ? 'Down' : 'Up';
        }
    }

    localPlayer.update(m);
    const isMoving = m.x !== 0 || m.y !== 0;

    if(isMoving || Math.random() < 0.05) { 
        localPlayer.pos.x += m.x * localPlayer.speed;
        localPlayer.pos.y += m.y * localPlayer.speed;
        
        const payload = { 
            type: 'MOVE', 
            id: localPlayer.id, 
            nick: localPlayer.nickname, 
            x: localPlayer.pos.x, 
            y: localPlayer.pos.y, 
            dir: localPlayer.currentDir,
            stats: { 
                level: localPlayer.level, 
                hp: localPlayer.hp, 
                maxHp: localPlayer.maxHp,
                tilesCured: localPlayer.tilesCured 
            }
        };
        net.sendPayload(payload);
    }

    if (localPlayer.pollen > 0) {
        if (isMoving || Math.random() < 0.3) spawnPollenParticle();
    }
    updateParticles();

    const gridX = Math.round(localPlayer.pos.x);
    const gridY = Math.round(localPlayer.pos.y);
    const currentTile = worldState.getModifiedTile(gridX, gridY) || world.getTileAt(gridX, gridY);
    const isSafeZone = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(currentTile);

    // Dano e Cura
    if (!isSafeZone) {
        damageFrameCounter++;
        if (damageFrameCounter >= DAMAGE_RATE) {
            damageFrameCounter = 0;
            localPlayer.hp -= DAMAGE_AMOUNT;
            updateUI();
            if (localPlayer.hp <= 0) {
                localPlayer.respawn();
                updateUI();
                net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir });
            }
        }
    } else {
        damageFrameCounter++;
        if (damageFrameCounter >= HEAL_RATE) {
            damageFrameCounter = 0;
            if (localPlayer.hp < localPlayer.maxHp) {
                localPlayer.hp += HEAL_AMOUNT;
                if (localPlayer.hp > localPlayer.maxHp) localPlayer.hp = localPlayer.maxHp;
                updateUI();
            }
        }
    }

    // Coleta
    if (currentTile === 'FLOR' && localPlayer.pollen < localPlayer.maxPollen) {
        collectionFrameCounter++;
        if (collectionFrameCounter >= COLLECTION_RATE) {
            localPlayer.pollen++; 
            collectionFrameCounter = 0; 
            gainXp(XP_PER_POLLEN);
            if (localPlayer.pollen >= localPlayer.maxPollen) changeTile(gridX, gridY, 'FLOR_COOLDOWN', localPlayer.id);
        }
    } else { collectionFrameCounter = 0; }

    // Plantio (Cura Manual)
    if (currentTile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0 && isMoving) {
        cureFrameCounter++;
        if (cureFrameCounter >= CURE_ATTEMPT_RATE) {
            cureFrameCounter = 0; localPlayer.pollen--; 
            
            if (Math.random() < PLANT_SPAWN_CHANCE) {
                // SUCESSO NO PLANTIO!
                changeTile(gridX, gridY, 'GRAMA', localPlayer.id); // Registra dono
                
                localPlayer.tilesCured++; 
                gainXp(XP_PER_CURE);
                
                // GATILHO DE SAVE ROBUSTO: Plantou flor? Salva!
                saveProgress();
            }
            updateUI();
        }
    } else { cureFrameCounter = 0; }

    uiUpdateCounter++;
    if(uiUpdateCounter > 60) {
        updateRanking();
        uiUpdateCounter = 0;
    }

    camera.x = localPlayer.pos.x;
    camera.y = localPlayer.pos.y;
    Object.values(remotePlayers).forEach(p => p.update({x:0, y:0}));
}

function gainXp(amount) {
    const oldLevel = localPlayer.level;
    localPlayer.xp += amount;
    
    if (localPlayer.xp >= localPlayer.maxXp) {
        localPlayer.xp -= localPlayer.maxXp; 
        localPlayer.level++;
        localPlayer.maxXp = Math.floor(localPlayer.maxXp * 1.5); 
        localPlayer.maxPollen += 10; 
        localPlayer.hp = localPlayer.maxHp; 
        
        chat.addMessage('SYSTEM', null, `Você alcançou o Nível ${localPlayer.level}!`);
    }

    // GATILHO DE SAVE ROBUSTO: Subiu de nível? Salva!
    if (localPlayer.level > oldLevel) {
        saveProgress();
    }

    updateUI();
}

/**
 * Altera um tile e propaga pela rede.
 * @param {number} x 
 * @param {number} y 
 * @param {string} newType 
 * @param {string|null} ownerId - ID do jogador dono da planta (opcional)
 */
function changeTile(x, y, newType, ownerId = null) {
    if(worldState.setTile(x, y, newType)) {
        // Se for grama, adiciona planta com dono
        if (net.isHost && newType === 'GRAMA') {
            worldState.addGrowingPlant(x, y, ownerId);
        }
        
        // Envia para a rede com ownerId
        net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType, ownerId: ownerId });
    }
}

// --- VISUAL E UTILITÁRIOS ---

function spawnPollenParticle() {
    pollenParticles.push({
        wx: localPlayer.pos.x + (Math.random() * 0.4 - 0.2),
        wy: localPlayer.pos.y + (Math.random() * 0.4 - 0.2),
        size: Math.random() * 3 + 2, speedY: Math.random() * 0.02 + 0.01, life: 1.0
    });
}

function spawnSmokeParticle(tileX, tileY) {
    const offsetX = Math.random();
    const offsetY = Math.random();
    const isEmber = Math.random() < 0.15;
    smokeParticles.push({
        wx: tileX + offsetX, wy: tileY + offsetY, isEmber: isEmber, 
        size: isEmber ? (Math.random() * 3 + 1) : (Math.random() * 5 + 2),
        speedY: -(Math.random() * 0.03 + 0.01), wobbleTick: Math.random() * 100, wobbleSpeed: Math.random() * 0.05 + 0.02, wobbleAmp: 0.01, 
        life: Math.random() * 0.6 + 0.4, decay: Math.random() * 0.008 + 0.005, grayVal: Math.floor(Math.random() * 60)
    });
}

function updateParticles() {
    for (let i = pollenParticles.length - 1; i >= 0; i--) {
        let p = pollenParticles[i];
        p.wy += p.speedY; p.life -= 0.02;
        if (p.life <= 0) pollenParticles.splice(i, 1);
    }
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        let p = smokeParticles[i];
        p.wy += p.speedY; p.life -= p.decay; p.wobbleTick += p.wobbleSpeed; p.wx += Math.sin(p.wobbleTick) * p.wobbleAmp;
        if (!p.isEmber) p.size += 0.03; 
        if (p.life <= 0) smokeParticles.splice(i, 1);
    }
}

function updateUI() {
    document.getElementById('hud-name').innerText = localPlayer.nickname;
    document.getElementById('hud-lvl').innerText = localPlayer.level;
    const hpPct = Math.max(0, (localPlayer.hp / localPlayer.maxHp) * 100);
    document.getElementById('bar-hp-fill').style.width = `${hpPct}%`;
    document.getElementById('bar-hp-text').innerText = `${Math.ceil(localPlayer.hp)}/${localPlayer.maxHp}`;
    const xpPct = Math.max(0, (localPlayer.xp / localPlayer.maxXp) * 100);
    document.getElementById('bar-xp-fill').style.width = `${xpPct}%`;
    document.getElementById('bar-xp-text').innerText = `${Math.floor(localPlayer.xp)}/${localPlayer.maxXp}`;
    const polPct = Math.max(0, (localPlayer.pollen / localPlayer.maxPollen) * 100);
    document.getElementById('bar-pollen-fill').style.width = `${polPct}%`;
    document.getElementById('bar-pollen-text').innerText = `${localPlayer.pollen}/${localPlayer.maxPollen}`;
}

function updateRanking() {
    const listEl = document.getElementById('ranking-list');
    if (listEl.style.display === 'none') return;

    const allPlayers = [localPlayer, ...Object.values(remotePlayers)];
    allPlayers.sort((a, b) => (b.tilesCured || 0) - (a.tilesCured || 0));

    listEl.innerHTML = '';
    allPlayers.slice(0, 5).forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'rank-item';
        div.innerHTML = `<span>${index + 1}. ${p.nickname}</span><span class="rank-val">${p.tilesCured || 0}</span>`;
        listEl.appendChild(div);
    });
}

function draw() {
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(!world) return;
    const rTileSize = world.tileSize * zoomLevel;
    const cX = Math.floor(localPlayer.pos.x / world.chunkSize);
    const cY = Math.floor(localPlayer.pos.y / world.chunkSize);
    const range = zoomLevel < 0.8 ? 2 : 1; 

    for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x) * rTileSize + canvas.width/2;
            const sY = (t.y - camera.y) * rTileSize + canvas.height/2;
            if(sX > -rTileSize && sX < canvas.width+rTileSize && sY > -rTileSize && sY < canvas.height+rTileSize) {
                const finalType = worldState.getModifiedTile(t.x, t.y) || t.type;
                let color = '#34495e'; 
                if (finalType === 'TERRA_QUEIMADA') { if (Math.random() < 0.015) spawnSmokeParticle(t.x, t.y); }
                if(['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN'].includes(finalType)) color = '#2ecc71';
                if(finalType === 'COLMEIA') color = '#f1c40f';
                ctx.fillStyle = color; ctx.fillRect(sX, sY, rTileSize, rTileSize);
                if (finalType === 'BROTO') { ctx.fillStyle = '#006400'; const size = 12 * zoomLevel; const offset = (rTileSize - size) / 2; ctx.fillRect(sX + offset, sY + offset, size, size); }
                else if (finalType === 'MUDA') { ctx.fillStyle = '#228B22'; const size = 20 * zoomLevel; const offset = (rTileSize - size) / 2; ctx.fillRect(sX + offset, sY + offset, size, size); }
                else if ((finalType === 'FLOR' || finalType === 'FLOR_COOLDOWN') && assets.flower.complete) {
                    if (finalType === 'FLOR_COOLDOWN') ctx.globalAlpha = 0.4;
                    const baseOffsetY = rTileSize * 0.65; 
                    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(sX + rTileSize/2, sY + baseOffsetY, 8 * zoomLevel, 3 * zoomLevel, 0, 0, Math.PI*2); ctx.fill();
                    ctx.save(); ctx.translate(sX + rTileSize/2, sY + baseOffsetY);
                    const windAngle = Math.sin(Date.now() / 800 + t.x * 0.5) * 0.1; 
                    ctx.rotate(windAngle);
                    ctx.drawImage(assets.flower, -rTileSize/2, -rTileSize, rTileSize, rTileSize);
                    ctx.restore();
                    ctx.globalAlpha = 1.0;
                }
            }
        });
    }
    smokeParticles.forEach(p => { const psX = (p.wx - camera.x) * rTileSize + canvas.width/2; const psY = (p.wy - camera.y) * rTileSize + canvas.height/2; if (p.isEmber) ctx.fillStyle = `rgba(231, 76, 60, ${p.life})`; else ctx.fillStyle = `rgba(${p.grayVal}, ${p.grayVal}, ${p.grayVal}, ${p.life * 0.4})`; ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel); });
    pollenParticles.forEach(p => { const psX = (p.wx - camera.x) * rTileSize + canvas.width/2; const psY = (p.wy - camera.y) * rTileSize + canvas.height/2; ctx.fillStyle = `rgba(241, 196, 15, ${p.life})`; ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel); });
    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize));
    localPlayer.draw(ctx, camera, canvas, rTileSize);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
