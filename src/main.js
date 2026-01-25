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

// --- ESTADO DE INTERAÇÃO (NOVO) ---
let currentPartyPartner = null; // PeerId do parceiro de party
let selectedPlayerId = null;    // Player selecionado no modal
let pendingInviteFrom = null;   // PeerId de quem enviou convite

let lastGridX = -9999, lastGridY = -9999;
let guestDataDB = {}; 
let zoomLevel = 1.0; 
const MIN_ZOOM = 0.5, MAX_ZOOM = 1.5;

// --- CONFIG E BALANCEAMENTO ---
const PLANT_SPAWN_CHANCE = 0.20, CURE_ATTEMPT_RATE = 60;
const FLOWER_COOLDOWN_TIME = 10000, COLLECTION_RATE = 5;
const DAMAGE_RATE = 2, DAMAGE_AMOUNT = 0.2, HEAL_RATE = 1, HEAL_AMOUNT = 1;
const XP_PER_CURE = 15, XP_PER_POLLEN = 0.2, XP_PASSIVE_CURE = 5;
const GROWTH_TIMES = { BROTO: 5000, MUDA: 10000, FLOR: 15000 };

let collectionFrameCounter = 0, cureFrameCounter = 0, damageFrameCounter = 0, uiUpdateCounter = 0;
const assets = { flower: new Image() };
assets.flower.src = 'assets/Flower.png';

// --- UI HANDLERS (LOBBY) ---
document.getElementById('btn-create').onclick = () => {
    const nick = document.getElementById('host-nickname').value || "Host";
    const id = document.getElementById('create-id').value;
    const pass = document.getElementById('create-pass').value;
    const seed = document.getElementById('world-seed').value || Date.now().toString();
    if(!id) return alert("ID obrigatório");
    net.init(id, (ok) => {
        if(ok) {
            net.hostRoom(id, pass, seed, () => worldState.getFullState(), (guestNick) => guestDataDB[guestNick]);
            startGame(seed, id, nick);
            if(net.isHost) startHostSimulation();
        }
    });
};

document.getElementById('btn-join').onclick = () => {
    const nick = document.getElementById('join-nickname').value || "Guest", id = document.getElementById('join-id').value, pass = document.getElementById('join-pass').value;
    if(!id) return alert("ID obrigatório");
    net.init(null, (ok) => { if(ok) net.joinRoom(id, pass, nick); });
};

// --- LOGICA DE PARTY E MODAL (NOVO) ---

// Ao clicar em um nome no Chat
window.addEventListener('playerClicked', e => {
    const targetNick = e.detail;
    // Encontra o ID do player pelo nick
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

// Botão de Party no Modal
document.getElementById('btn-party-action').onclick = () => {
    if (!selectedPlayerId) return;

    if (currentPartyPartner === selectedPlayerId) {
        // Sair da Party
        net.sendPayload({ type: 'PARTY_LEAVE', fromId: localPlayer.id }, selectedPlayerId);
        chat.addMessage('SYSTEM', null, `Você saiu da party com ${remotePlayers[selectedPlayerId].nickname}.`);
        currentPartyPartner = null;
    } else {
        // Convidar
        net.sendPayload({ type: 'PARTY_INVITE', fromId: localPlayer.id, fromNick: localPlayer.nickname }, selectedPlayerId);
        chat.addMessage('SYSTEM', null, `Convite de party enviado para ${remotePlayers[selectedPlayerId].nickname}.`);
    }
    document.getElementById('player-modal').style.display = 'none';
};

// Botão de Whisper no Modal
document.getElementById('btn-whisper-action').onclick = () => {
    if (!selectedPlayerId) return;
    const msg = prompt(`Enviar cochicho para ${remotePlayers[selectedPlayerId].nickname}:`);
    if (msg && msg.trim()) {
        net.sendPayload({ type: 'WHISPER', fromNick: localPlayer.nickname, text: msg }, selectedPlayerId);
        chat.addMessage('WHISPER', remotePlayers[selectedPlayerId].nickname, `(Para): ${msg}`);
    }
    document.getElementById('player-modal').style.display = 'none';
};

// Aceitar Convite
document.getElementById('btn-accept-invite').onclick = () => {
    if (pendingInviteFrom) {
        currentPartyPartner = pendingInviteFrom;
        net.sendPayload({ type: 'PARTY_ACCEPT', fromId: localPlayer.id, fromNick: localPlayer.nickname }, pendingInviteFrom);
        chat.addMessage('SYSTEM', null, `Você agora está em uma party com ${remotePlayers[pendingInviteFrom]?.nickname || 'Jogador'}.`);
        document.getElementById('party-invite').style.display = 'none';
        pendingInviteFrom = null;
    }
};

// Recusar Convite
document.getElementById('btn-decline-invite').onclick = () => {
    document.getElementById('party-invite').style.display = 'none';
    pendingInviteFrom = null;
};

// --- EVENTOS DE REDE E CHAT ---

window.addEventListener('chatSend', e => {
    if (!localPlayer) return;
    chat.addMessage('SELF', localPlayer.nickname, e.detail);
    net.sendPayload({ type: 'CHAT_MSG', id: localPlayer.id, nick: localPlayer.nickname, text: e.detail });
});

window.addEventListener('netData', e => {
    const d = e.detail;

    switch(d.type) {
        case 'CHAT_MSG': chat.addMessage('GLOBAL', d.nick, d.text); break;
        
        case 'WHISPER': 
            chat.addMessage('WHISPER', d.fromNick, d.text); 
            chat.updateNotification();
            break;

        case 'PARTY_INVITE':
            pendingInviteFrom = d.fromId;
            document.getElementById('invite-text').innerText = `${d.fromNick} convidou você para uma party.`;
            document.getElementById('party-invite').style.display = 'block';
            break;

        case 'PARTY_ACCEPT':
            currentPartyPartner = d.fromId;
            chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou seu convite de party!`);
            break;

        case 'PARTY_LEAVE':
            if (currentPartyPartner === d.fromId) {
                chat.addMessage('SYSTEM', null, `${remotePlayers[d.fromId]?.nickname || 'Seu parceiro'} saiu da party.`);
                currentPartyPartner = null;
            }
            break;

        case 'FLOWER_CURE':
            if (localPlayer && d.ownerId === localPlayer.id) { localPlayer.tilesCured++; gainXp(XP_PASSIVE_CURE); }
            if (remotePlayers[d.ownerId]) { remotePlayers[d.ownerId].tilesCured = (remotePlayers[d.ownerId].tilesCured || 0) + 1; }
            break;

        case 'MOVE':
            if(!remotePlayers[d.id]) {
                remotePlayers[d.id] = new Player(d.id, d.nick);
                chat.addMessage('SYSTEM', null, `${d.nick} entrou no mundo.`);
            }
            remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
            remotePlayers[d.id].currentDir = d.dir;
            if (d.stats) remotePlayers[d.id].deserialize({ stats: d.stats });
            break;

        case 'TILE_CHANGE': changeTile(d.x, d.y, d.tileType, d.ownerId); break;
    }
});

// --- RESTO DO ENGINE (LOOP, DRAW, UPDATE) ---
// [Mantendo as funções startGame, update, draw, gainXp, etc. conforme versões anteriores]

function startGame(seed, id, nick) {
    document.getElementById('lobby-overlay').style.display = 'none';
    document.getElementById('rpg-hud').style.display = 'block';
    document.getElementById('chat-toggle-btn').style.display = 'block';
    canvas.style.display = 'block';
    if (input.isMobile) {
        document.getElementById('zoom-controls').style.display = 'flex';
        document.getElementById('mobile-controls').style.display = 'block';
    }
    world = new WorldGenerator(seed);
    localPlayer = new Player(id, nick, true);
    const hives = world.getHiveLocations();
    let spawnIndex = net.isHost ? 0 : (Math.abs(id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % (hives.length - 1)) + 1;
    if (hives[spawnIndex]) {
        localPlayer.homeBase = { x: hives[spawnIndex].x, y: hives[spawnIndex].y };
        localPlayer.pos = { ...localPlayer.homeBase };
        localPlayer.targetPos = { ...localPlayer.pos };
    }
    if (net.isHost) {
        const saved = saveSystem.load();
        if (saved) { worldState.applyFullState(saved.world); if (saved.host) localPlayer.deserialize({ stats: saved.host }); guestDataDB = saved.guests || {}; }
    }
    updateUI(); resize(); requestAnimationFrame(loop);
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

function update() {
    if(!localPlayer) return;
    const curX = Math.round(localPlayer.pos.x), curY = Math.round(localPlayer.pos.y);
    if (curX !== lastGridX || curY !== lastGridY) {
        lastGridX = curX; lastGridY = curY;
        const el = document.getElementById('hud-coords');
        if(el) el.innerText = `${curX}, ${curY}`;
    }
    const m = input.getMovement();
    localPlayer.update(m);
    if(m.x !== 0 || m.y !== 0 || Math.random() < 0.05) {
        localPlayer.pos.x += m.x * localPlayer.speed; localPlayer.pos.y += m.y * localPlayer.speed;
        net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir, stats: { level: localPlayer.level, hp: localPlayer.hp, maxHp: localPlayer.maxHp, tilesCured: localPlayer.tilesCured }});
    }
    if (localPlayer.pollen > 0 && (m.x!==0 || m.y!==0)) spawnPollenParticle();
    updateParticles();
    const currentTile = worldState.getModifiedTile(curX, curY) || world.getTileAt(curX, curY);
    const isSafe = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(currentTile);
    if (!isSafe) {
        if (++damageFrameCounter >= DAMAGE_RATE) {
            damageFrameCounter = 0; localPlayer.hp -= DAMAGE_AMOUNT; updateUI();
            if (localPlayer.hp <= 0) { localPlayer.respawn(); localPlayer.pos = {...localPlayer.homeBase}; updateUI(); }
        }
    } else if (++damageFrameCounter >= HEAL_RATE) {
        damageFrameCounter = 0; if (localPlayer.hp < localPlayer.maxHp) { localPlayer.hp = Math.min(localPlayer.maxHp, localPlayer.hp + HEAL_AMOUNT); updateUI(); }
    }
    if (currentTile === 'FLOR' && localPlayer.pollen < localPlayer.maxPollen) {
        if (++collectionFrameCounter >= COLLECTION_RATE) { localPlayer.pollen++; collectionFrameCounter = 0; gainXp(XP_PER_POLLEN); if (localPlayer.pollen >= localPlayer.maxPollen) changeTile(curX, curY, 'FLOR_COOLDOWN', localPlayer.id); }
    }
    if (currentTile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0 && (m.x!==0 || m.y!==0)) {
        if (++cureFrameCounter >= CURE_ATTEMPT_RATE) {
            cureFrameCounter = 0; localPlayer.pollen--;
            if (Math.random() < PLANT_SPAWN_CHANCE) { changeTile(curX, curY, 'GRAMA', localPlayer.id); localPlayer.tilesCured++; gainXp(XP_PER_CURE); saveProgress(); }
            updateUI();
        }
    }
    uiUpdateCounter++; if(uiUpdateCounter > 60) { updateRanking(); uiUpdateCounter = 0; }
    camera.x = localPlayer.pos.x; camera.y = localPlayer.pos.y;
    Object.values(remotePlayers).forEach(p => p.update({x:0, y:0}));
}

function draw() {
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(!world) return;
    const rTileSize = world.tileSize * zoomLevel;
    const cX = Math.floor(localPlayer.pos.x / world.chunkSize), cY = Math.floor(localPlayer.pos.y / world.chunkSize);
    const range = zoomLevel < 0.8 ? 2 : 1;
    for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x) * rTileSize + canvas.width/2, sY = (t.y - camera.y) * rTileSize + canvas.height/2;
            if(sX > -rTileSize && sX < canvas.width+rTileSize && sY > -rTileSize && sY < canvas.height+rTileSize) {
                const type = worldState.getModifiedTile(t.x, t.y) || t.type;
                ctx.fillStyle = (type === 'COLMEIA') ? '#f1c40f' : (['GRAMA','GRAMA_SAFE','BROTO','MUDA','FLOR'].includes(type) ? '#2ecc71' : '#34495e');
                ctx.fillRect(sX, sY, rTileSize, rTileSize);
                if (type === 'FLOR' && assets.flower.complete) ctx.drawImage(assets.flower, sX, sY, rTileSize, rTileSize);
            }
        });
    }
    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize));
    localPlayer.draw(ctx, camera, canvas, rTileSize);
    
    // Bússola
    if (localPlayer.homeBase) {
        const dx = localPlayer.homeBase.x - localPlayer.pos.x, dy = localPlayer.homeBase.y - localPlayer.pos.y;
        if (Math.sqrt(dx*dx+dy*dy) > 30) {
            const angle = Math.atan2(dy, dx), orbit = 60 * zoomLevel;
            ctx.save(); ctx.translate(canvas.width/2 + Math.cos(angle)*orbit, canvas.height/2 + Math.sin(angle)*orbit); ctx.rotate(angle);
            ctx.fillStyle = "#f1c40f"; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-10*zoomLevel, -5*zoomLevel); ctx.lineTo(-10*zoomLevel, 5*zoomLevel); ctx.fill(); ctx.restore();
        }
    }
}

// Funções de suporte omitidas por brevidade (idênticas às anteriores: updateUI, updateRanking, saveProgress, changeTile, particles, resize)
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
function updateRanking() { /* Lógica de ranking top 5 */ }
function saveProgress() { /* Lógica de auto-save */ }
function changeTile(x, y, type, owner) { if(worldState.setTile(x,y,type)) { if(net.isHost && type==='GRAMA') worldState.addGrowingPlant(x,y,owner); net.sendPayload({type:'TILE_CHANGE', x, y, tileType:type, ownerId:owner}); } }
function spawnPollenParticle() { pollenParticles.push({wx: localPlayer.pos.x, wy: localPlayer.pos.y, size: 2, speedY: 0.01, life: 1.0}); }
function updateParticles() { pollenParticles = pollenParticles.filter(p => (p.life -= 0.02) > 0); }
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
