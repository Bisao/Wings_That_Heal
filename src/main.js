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

// --- ESTADO SOCIAL ---
let currentPartyPartner = null; 
let selectedPlayerId = null;    
let pendingInviteFrom = null;   

let lastGridX = -9999;
let lastGridY = -9999;
let guestDataDB = {}; 

let zoomLevel = 1.0; 
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

const PLANT_SPAWN_CHANCE = 0.20; 
const CURE_ATTEMPT_RATE = 60;    
const COLLECTION_RATE = 5; 

// --- BALANCEAMENTO ---
const DAMAGE_RATE = 2; 
const DAMAGE_AMOUNT = 0.2; 
const HEAL_RATE = 1;    
const HEAL_AMOUNT = 1;   
const XP_PER_CURE = 15;    
const XP_PER_POLLEN = 0.2;
const XP_PASSIVE_CURE = 5; 

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

// --- LOGICA DE INTERAÇÃO SOCIAL ---

window.addEventListener('playerClicked', e => {
    const targetNick = e.detail;
    const targetId = Object.keys(remotePlayers).find(id => remotePlayers[id].nickname === targetNick);
    
    if (targetId) {
        selectedPlayerId = targetId;
        const p = remotePlayers[targetId];
        document.getElementById('modal-player-name').innerText = p.nickname;
        document.getElementById('modal-player-info').innerText = `Nível: ${p.level || 1}`;
        
        const partyBtn = document.getElementById('btn-party-action');
        if (currentPartyPartner === targetId) {
            partyBtn.innerText = "Sair da Party";
            partyBtn.style.background = "#e74c3c";
        } else {
            partyBtn.innerText = "Convidar para Party";
            partyBtn.style.background = "#3498db";
        }
        document.getElementById('player-modal').style.display = 'block';
    }
});

document.getElementById('btn-party-action').onclick = () => {
    if (!selectedPlayerId) return;
    if (currentPartyPartner === selectedPlayerId) {
        net.sendPayload({ type: 'PARTY_LEAVE', fromId: localPlayer.id }, selectedPlayerId);
        chat.addMessage('SYSTEM', null, `Você desfez a party com ${remotePlayers[selectedPlayerId].nickname}.`);
        currentPartyPartner = null;
    } else {
        net.sendPayload({ type: 'PARTY_INVITE', fromId: localPlayer.id, fromNick: localPlayer.nickname }, selectedPlayerId);
        chat.addMessage('SYSTEM', null, `Convite enviado para ${remotePlayers[selectedPlayerId].nickname}.`);
    }
    document.getElementById('player-modal').style.display = 'none';
};

document.getElementById('btn-whisper-action').onclick = () => {
    if (!selectedPlayerId) return;
    chat.openPrivateTab(remotePlayers[selectedPlayerId].nickname);
    document.getElementById('player-modal').style.display = 'none';
};

document.getElementById('btn-accept-invite').onclick = () => {
    if (pendingInviteFrom) {
        currentPartyPartner = pendingInviteFrom;
        net.sendPayload({ type: 'PARTY_ACCEPT', fromId: localPlayer.id, fromNick: localPlayer.nickname }, pendingInviteFrom);
        chat.addMessage('SYSTEM', null, `Você entrou na party.`);
        document.getElementById('party-invite-popup').style.display = 'none';
        pendingInviteFrom = null;
    }
};

// --- CONTROLES DE ZOOM ---
window.addEventListener('wheel', (e) => {
    if (!localPlayer) return;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + delta));
    const slider = document.getElementById('zoom-slider');
    if (slider) slider.value = zoomLevel;
}, { passive: true });

const zoomSlider = document.getElementById('zoom-slider');
if(zoomSlider) { zoomSlider.addEventListener('input', (e) => { zoomLevel = parseFloat(e.target.value); }); }

// --- CHAT SEND (INTEGRADO COM ABAS) ---
window.addEventListener('chatSend', e => {
    const data = e.detail; 
    if (!localPlayer) return;

    if (data.type === 'GLOBAL') {
        chat.addMessage('SELF', localPlayer.nickname, data.text);
        net.sendPayload({ type: 'CHAT_MSG', id: localPlayer.id, nick: localPlayer.nickname, text: data.text });
    } else if (data.type === 'WHISPER') {
        const targetId = Object.keys(remotePlayers).find(id => remotePlayers[id].nickname === data.target);
        if (targetId) {
            net.sendPayload({ type: 'WHISPER', fromNick: localPlayer.nickname, text: data.text }, targetId);
        } else {
            chat.addMessage('SYSTEM', null, `Erro: ${data.target} não encontrado.`);
        }
    }
});

// --- EVENTOS DE REDE ---

window.addEventListener('joined', e => {
    const data = e.detail;
    if (data.worldState) worldState.applyFullState(data.worldState);
    const nick = document.getElementById('join-nickname').value || "Guest";
    startGame(data.seed, net.peer.id, nick);
    if (data.playerData) {
        localPlayer.deserialize(data.playerData);
        updateUI();
    }
});

window.addEventListener('peerDisconnected', e => {
    const peerId = e.detail.peerId;
    if (remotePlayers[peerId]) {
        const p = remotePlayers[peerId];
        chat.addMessage('SYSTEM', null, `${p.nickname || 'Alguém'} saiu do jogo.`);
        if (currentPartyPartner === peerId) currentPartyPartner = null;
        guestDataDB[p.nickname] = p.serialize().stats;
        saveProgress(); 
        delete remotePlayers[peerId];
        updateRanking(); 
    }
});

window.addEventListener('netData', e => {
    const d = e.detail;

    if (d.type === 'WHISPER') {
        chat.addMessage('WHISPER', d.fromNick, d.text);
    }

    if (d.type === 'PARTY_INVITE') {
        pendingInviteFrom = d.fromId;
        document.getElementById('invite-msg').innerText = `${d.fromNick} convidou você para uma party!`;
        document.getElementById('party-invite-popup').style.display = 'block';
    }

    if (d.type === 'PARTY_ACCEPT') {
        currentPartyPartner = d.fromId;
        chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou o convite de party!`);
    }

    if (d.type === 'PARTY_LEAVE') {
        if (currentPartyPartner === d.fromId) {
            chat.addMessage('SYSTEM', null, `Sua party foi desfeita.`);
            currentPartyPartner = null;
        }
    }

    if (d.type === 'CHAT_MSG') chat.addMessage('GLOBAL', d.nick, d.text);

    if (d.type === 'FLOWER_CURE') {
        if (localPlayer && d.ownerId === localPlayer.id) {
            localPlayer.tilesCured++;
            gainXp(XP_PASSIVE_CURE);
        }
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

    if(d.type === 'TILE_CHANGE') changeTile(d.x, d.y, d.tileType, d.ownerId); 
});

// --- LÓGICA DE JOGO ---

function startGame(seed, id, nick) {
    document.getElementById('lobby-overlay').style.display = 'none';
    document.getElementById('rpg-hud').style.display = 'block';
    document.getElementById('chat-toggle-btn').style.display = 'block';
    chat.addMessage('SYSTEM', null, "Bem-vindo ao Wings That Heal!");
    canvas.style.display = 'block';
    
    if (input.isMobile) {
        document.getElementById('zoom-controls').style.display = 'flex';
        document.getElementById('mobile-controls').style.display = 'block';
    }

    world = new WorldGenerator(seed);
    localPlayer = new Player(id, nick, true);

    const hives = world.getHiveLocations(); 
    let spawnIndex = 0;
    if (net.isHost) {
        spawnIndex = 0;
    } else {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        spawnIndex = (Math.abs(hash) % (hives.length - 1)) + 1;
    }

    if (hives[spawnIndex]) {
        localPlayer.homeBase = { x: hives[spawnIndex].x, y: hives[spawnIndex].y };
        localPlayer.pos.x = localPlayer.homeBase.x;
        localPlayer.pos.y = localPlayer.homeBase.y;
        localPlayer.targetPos = { ...localPlayer.pos };
        chat.addMessage('SYSTEM', null, `Você está na Colmeia #${spawnIndex}.`);
    }

    if (net.isHost) {
        const savedGame = saveSystem.load();
        if (savedGame) {
            worldState.applyFullState(savedGame.world);
            if (savedGame.host) localPlayer.deserialize({ stats: savedGame.host });
            guestDataDB = savedGame.guests || {};
        }
    }
    
    updateUI(); 
    resize();
    requestAnimationFrame(loop);
}

function startHostSimulation() {
    setInterval(() => {
        const now = Date.now();
        let changed = false;

        for (const [key, plantData] of Object.entries(worldState.growingPlants)) {
            const startTime = plantData.time || plantData;
            const ownerId = plantData.owner || null;
            const [x, y] = key.split(',').map(Number);
            const elapsed = now - startTime;
            const currentType = worldState.getModifiedTile(x, y);

            if (currentType === 'GRAMA' && elapsed > GROWTH_TIMES.BROTO) changeTile(x, y, 'BROTO', ownerId);
            else if (currentType === 'BROTO' && elapsed > GROWTH_TIMES.MUDA) changeTile(x, y, 'MUDA', ownerId);
            else if (currentType === 'MUDA' && elapsed > GROWTH_TIMES.FLOR) changeTile(x, y, 'FLOR', ownerId);

            if (currentType === 'FLOR' && Math.random() < 0.10) {
                const dx = Math.floor(Math.random() * 3) - 1;
                const dy = Math.floor(Math.random() * 3) - 1;
                if (dx === 0 && dy === 0) continue;
                const tx = x + dx, ty = y + dy;
                const targetType = worldState.getModifiedTile(tx, ty) || world.getTileAt(tx, ty);
                if (targetType === 'TERRA_QUEIMADA') {
                    changeTile(tx, ty, 'GRAMA_SAFE');
                    if (ownerId) net.sendPayload({ type: 'FLOWER_CURE', ownerId: ownerId, x: tx, y: ty });
                    changed = true; 
                }
            }
        }
        if (changed) saveProgress();
    }, 1000);
    setInterval(() => { saveProgress(); }, 30000); 
}

function saveProgress() {
    if (!net.isHost || !localPlayer) return;
    Object.values(remotePlayers).forEach(p => {
        if (p.nickname) guestDataDB[p.nickname] = p.serialize().stats;
    });
    saveSystem.save({
        seed: world.seed,
        world: worldState.getFullState(),
        host: localPlayer.serialize().stats,
        guests: guestDataDB
    });
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

function update() {
    if(!localPlayer) return;

    const gx = Math.round(localPlayer.pos.x);
    const gy = Math.round(localPlayer.pos.y);
    if (gx !== lastGridX || gy !== lastGridY) {
        lastGridX = gx; lastGridY = gy;
        const el = document.getElementById('hud-coords');
        if(el) el.innerText = `${gx}, ${gy}`;
    }

    const m = input.getMovement();
    localPlayer.update(m);
    const moving = m.x !== 0 || m.y !== 0;

    if(moving || Math.random() < 0.05) { 
        localPlayer.pos.x += m.x * localPlayer.speed;
        localPlayer.pos.y += m.y * localPlayer.speed;
        net.sendPayload({ 
            type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, 
            x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir,
            stats: { level: localPlayer.level, hp: localPlayer.hp, maxHp: localPlayer.maxHp, tilesCured: localPlayer.tilesCured }
        });
    }

    if (localPlayer.pollen > 0 && moving) spawnPollenParticle();
    updateParticles();

    const tile = worldState.getModifiedTile(gx, gy) || world.getTileAt(gx, gy);
    const safe = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(tile);

    if (!safe) {
        if (++damageFrameCounter >= DAMAGE_RATE) {
            damageFrameCounter = 0; localPlayer.hp -= DAMAGE_AMOUNT; updateUI();
            if (localPlayer.hp <= 0) {
                localPlayer.respawn();
                if (localPlayer.homeBase) { localPlayer.pos.x = localPlayer.homeBase.x; localPlayer.pos.y = localPlayer.homeBase.y; }
                updateUI();
                net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir });
            }
        }
    } else if (++damageFrameCounter >= HEAL_RATE) {
        damageFrameCounter = 0;
        if (localPlayer.hp < localPlayer.maxHp) { localPlayer.hp = Math.min(localPlayer.maxHp, localPlayer.hp + HEAL_AMOUNT); updateUI(); }
    }

    if (tile === 'FLOR' && localPlayer.pollen < localPlayer.maxPollen && ++collectionFrameCounter >= COLLECTION_RATE) {
        localPlayer.pollen++; collectionFrameCounter = 0; gainXp(XP_PER_POLLEN);
        if (localPlayer.pollen >= localPlayer.maxPollen) changeTile(gx, gy, 'FLOR_COOLDOWN', localPlayer.id);
    }

    if (tile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0 && moving && ++cureFrameCounter >= CURE_ATTEMPT_RATE) {
        cureFrameCounter = 0; localPlayer.pollen--; 
        if (Math.random() < PLANT_SPAWN_CHANCE) {
            changeTile(gx, gy, 'GRAMA', localPlayer.id);
            localPlayer.tilesCured++; gainXp(XP_PER_CURE); saveProgress();
        }
        updateUI();
    }

    uiUpdateCounter++;
    if(uiUpdateCounter > 60) { updateRanking(); uiUpdateCounter = 0; }

    camera.x = localPlayer.pos.x; camera.y = localPlayer.pos.y;
    Object.values(remotePlayers).forEach(p => p.update({x:0, y:0}));
}

function gainXp(amount) {
    const old = localPlayer.level;
    localPlayer.xp += amount;
    if (localPlayer.xp >= localPlayer.maxXp) {
        localPlayer.xp -= localPlayer.maxXp; localPlayer.level++;
        localPlayer.maxXp = Math.floor(localPlayer.maxXp * 1.5); 
        localPlayer.maxPollen += 10; localPlayer.hp = localPlayer.maxHp; 
        chat.addMessage('SYSTEM', null, `Você alcançou o Nível ${localPlayer.level}!`);
    }
    if (localPlayer.level > old) saveProgress();
    updateUI();
}

function changeTile(x, y, newType, ownerId = null) {
    if(worldState.setTile(x, y, newType)) {
        if (net.isHost && newType === 'GRAMA') worldState.addGrowingPlant(x, y, ownerId);
        net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType, ownerId: ownerId });
    }
}

function spawnPollenParticle() {
    pollenParticles.push({ wx: localPlayer.pos.x + (Math.random()*0.4-0.2), wy: localPlayer.pos.y + (Math.random()*0.4-0.2), size: Math.random()*3+2, speedY: Math.random()*0.02+0.01, life: 1.0 });
}

function spawnSmokeParticle(tx, ty) {
    smokeParticles.push({ wx: tx + Math.random(), wy: ty + Math.random(), size: Math.random()*5+2, speedY: -(Math.random()*0.03+0.01), life: Math.random()*0.6+0.4, decay: 0.006, grayVal: Math.floor(Math.random()*60) });
}

function updateParticles() {
    pollenParticles = pollenParticles.filter(p => (p.life -= 0.02) > 0);
    smokeParticles = smokeParticles.filter(p => (p.life -= p.decay) > 0);
}

function updateUI() {
    document.getElementById('hud-name').innerText = localPlayer.nickname;
    document.getElementById('hud-lvl').innerText = localPlayer.level;
    document.getElementById('bar-hp-fill').style.width = `${(localPlayer.hp/localPlayer.maxHp)*100}%`;
    document.getElementById('bar-hp-text').innerText = `${Math.ceil(localPlayer.hp)}/${localPlayer.maxHp}`;
    document.getElementById('bar-xp-fill').style.width = `${(localPlayer.xp/localPlayer.maxXp)*100}%`;
    document.getElementById('bar-xp-text').innerText = `${Math.floor(localPlayer.xp)}/${localPlayer.maxXp}`;
    document.getElementById('bar-pollen-fill').style.width = `${(localPlayer.pollen/localPlayer.maxPollen)*100}%`;
    document.getElementById('bar-pollen-text').innerText = `${localPlayer.pollen}/${localPlayer.maxPollen}`;
}

function updateRanking() {
    const list = document.getElementById('ranking-list'); if (!list || list.style.display === 'none') return;
    const all = [localPlayer, ...Object.values(remotePlayers)].sort((a,b) => (b.tilesCured||0)-(a.tilesCured||0));
    list.innerHTML = all.slice(0, 5).map((p, i) => `<div class="rank-item"><span>${i+1}. ${p.nickname}</span><span class="rank-val">${p.tilesCured||0}</span></div>`).join('');
}

function draw() {
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(!world) return;
    const rTileSize = world.tileSize * zoomLevel;
    const cX = Math.floor(localPlayer.pos.x / world.chunkSize), cY = Math.floor(localPlayer.pos.y / world.chunkSize);
    
    for(let x=-2; x<=2; x++) for(let y=-2; y<=2; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x)*rTileSize + canvas.width/2, sY = (t.y - camera.y)*rTileSize + canvas.height/2;
            if(sX > -rTileSize && sX < canvas.width+rTileSize && sY > -rTileSize && sY < canvas.height+rTileSize) {
                const type = worldState.getModifiedTile(t.x, t.y) || t.type;
                if (type === 'TERRA_QUEIMADA' && Math.random() < 0.01) spawnSmokeParticle(t.x, t.y);
                ctx.fillStyle = (type === 'COLMEIA') ? '#f1c40f' : (['GRAMA','GRAMA_SAFE','BROTO','MUDA','FLOR'].includes(type) ? '#2ecc71' : '#34495e');
                ctx.fillRect(sX, sY, rTileSize, rTileSize);
                if (['FLOR','FLOR_COOLDOWN'].includes(type) && assets.flower.complete) ctx.drawImage(assets.flower, sX, sY, rTileSize, rTileSize);
            }
        });
    }

    smokeParticles.forEach(p => { 
        const psX = (p.wx - camera.x) * rTileSize + canvas.width / 2;
        const psY = (p.wy - camera.y) * rTileSize + canvas.height / 2; 
        ctx.fillStyle = `rgba(${p.grayVal},${p.grayVal},${p.grayVal},${p.life})`; 
        ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel); 
    });
    
    pollenParticles.forEach(p => { 
        const psX = (p.wx - camera.x) * rTileSize + canvas.width / 2;
        const psY = (p.wy - camera.y) * rTileSize + canvas.height / 2; 
        ctx.fillStyle = `rgba(241,196,15,${p.life})`; 
        ctx.fillRect(psX, psY, 2 * zoomLevel, 2 * zoomLevel); 
    });
    
    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize, currentPartyPartner));
    localPlayer.draw(ctx, camera, canvas, rTileSize, currentPartyPartner);

    if (localPlayer.homeBase && Math.sqrt(Math.pow(localPlayer.homeBase.x-localPlayer.pos.x,2)+Math.pow(localPlayer.homeBase.y-localPlayer.pos.y,2)) > 30) {
        const angle = Math.atan2(localPlayer.homeBase.y-localPlayer.pos.y, localPlayer.homeBase.x-localPlayer.pos.x), orbit = 60*zoomLevel;
        ctx.save(); ctx.translate(canvas.width/2+Math.cos(angle)*orbit, canvas.height/2+Math.sin(angle)*orbit); ctx.rotate(angle);
        ctx.fillStyle = "#f1c40f"; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-10*zoomLevel, -5*zoomLevel); ctx.lineTo(-10*zoomLevel, 5*zoomLevel); ctx.fill(); ctx.restore();
    }
}

// Desenhando outros jogadores passando o ID do seu parceiro de grupo
Object.values(remotePlayers).forEach(p => {
    p.draw(ctx, camera, canvas, rTileSize, currentPartyPartner);
});

// Desenhando você mesmo
localPlayer.draw(ctx, camera, canvas, rTileSize, currentPartyPartner);
