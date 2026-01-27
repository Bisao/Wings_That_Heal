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

// --- ESTADO SOCIAL (INTEGRADO) ---
let currentPartyPartner = null; 
let selectedPlayerId = null;    
let pendingInviteFrom = null;   

// Variáveis para otimização da UI de coordenadas
let lastGridX = -9999;
let lastGridY = -9999;

// Banco de dados em memória para ranking de offline players
let guestDataDB = {}; 

let zoomLevel = 1.0; 
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

// --- DIFICULDADE E BALANCEAMENTO ---
const PLANT_SPAWN_CHANCE = 0.01; 
const CURE_ATTEMPT_RATE = 20;    
const FLOWER_COOLDOWN_TIME = 10000;
const COLLECTION_RATE = 5; 

// --- BALANCEAMENTO ---
const DAMAGE_RATE = 2; 
const DAMAGE_AMOUNT = 0.2; 
const XP_PER_CURE = 15;    
const XP_PER_POLLEN = 0.2;
const XP_PASSIVE_CURE = 5; 

const GROWTH_TIMES = { BROTO: 5000, MUDA: 10000, FLOR: 15000 };

let collectionFrameCounter = 0;
let cureFrameCounter = 0;
let damageFrameCounter = 0;
let uiUpdateCounter = 0; 

// Estado de Desmaio local
let isFainted = false;
let faintTimeout = null; 

const assets = { flower: new Image() };
assets.flower.src = 'assets/Flower.png';

// --- SISTEMA DE DIAGNÓSTICO PARA MOBILE ---
function logDebug(msg, color = "#00ff00") {
    if (window.logDebug) {
        window.logDebug(msg, color);
    }
    console.log(`[DEBUG] ${msg}`);
}

// Carregar Nickname salvo
window.addEventListener('load', () => {
    const savedNick = localStorage.getItem('wings_nick');
    if (savedNick) {
        document.getElementById('host-nickname').value = savedNick;
        document.getElementById('join-nickname').value = savedNick;
    }
});

// --- UI HANDLERS ---

// CORREÇÃO: Botão de Entrar (Join)
document.getElementById('btn-join').onpointerdown = (e) => {
    e.preventDefault();
    if (window.requestGameFullscreen) {
        try { window.requestGameFullscreen(); } catch(err) {}
    }

    // Coleta dados da aba JOIN
    const nick = document.getElementById('join-nickname').value.trim() || "Guest";
    const id = document.getElementById('join-id').value.trim();
    const pass = document.getElementById('join-pass').value.trim();
    
    if(!id) {
        logDebug("Erro: Digite o ID do Host para conectar.", "#ff4d4d");
        return alert("ID do Host é obrigatório");
    }

    localStorage.setItem('wings_nick', nick);
    logDebug(`Tentando conectar à colmeia: ${id}...`);

    net.init(null, (ok, err) => { 
        if(ok) {
            logDebug("Peer local pronto. Solicitando entrada ao Host...");
            net.joinRoom(id, pass, nick); 
        } else {
            logDebug(`Erro de Inicialização: ${err}`, "#ff4d4d");
            document.getElementById('status-msg').innerText = "Falha ao iniciar motor de rede.";
        }
    });
};

// CORREÇÃO: Botão de Hospedar (Create)
document.getElementById('btn-create').onpointerdown = (e) => {
    e.preventDefault();
    if (window.requestGameFullscreen) {
        try { window.requestGameFullscreen(); } catch(err) {}
    }

    // Coleta dados da aba CREATE
    const nick = document.getElementById('host-nickname').value.trim() || "Host";
    const id = document.getElementById('create-id').value.trim();
    const pass = document.getElementById('create-pass').value.trim();
    const seed = document.getElementById('world-seed').value.trim() || Date.now().toString();
    
    if(!id) {
        logDebug("Erro: Você precisa definir um ID para a sala.", "#ff4d4d");
        return alert("ID obrigatório");
    }

    localStorage.setItem('wings_nick', nick);
    logDebug(`Iniciando Peer com ID: ${id}...`);
    
    net.init(id, (ok, errorType) => {
        if(ok) {
            logDebug("Peer iniciado! Criando sala...");
            net.hostRoom(id, pass, seed, 
                () => worldState.getFullState(), 
                (guestNick) => guestDataDB[guestNick],
                () => guestDataDB 
            );
            startGame(seed, id, nick);
            if(net.isHost) startHostSimulation();
            logDebug("Mundo criado. Aguardando polinizadores...");
        } else { 
            let msg = "Erro ao criar sala.";
            if (errorType === 'unavailable-id') msg = "Este ID já está em uso por outra abelha!";
            logDebug(`Erro de Rede: ${errorType}`, "#ff4d4d");
            document.getElementById('status-msg').innerText = msg;
        }
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
            partyBtn.style.background = "#f1c40f";
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
        chat.closePartyTab();
    } else {
        net.sendPayload({ type: 'PARTY_INVITE', fromId: localPlayer.id, fromNick: localPlayer.nickname }, selectedPlayerId);
        chat.addMessage('SYSTEM', null, `Convite enviado para ${remotePlayers[selectedPlayerId].nickname}.`);
    }
    document.getElementById('player-modal').style.display = 'none';
};

document.getElementById('btn-accept-invite').onclick = () => {
    if (pendingInviteFrom) {
        currentPartyPartner = pendingInviteFrom;
        net.sendPayload({ type: 'PARTY_ACCEPT', fromId: localPlayer.id, fromNick: localPlayer.nickname }, pendingInviteFrom);
        chat.addMessage('SYSTEM', null, `Você entrou na party.`);
        chat.openPartyTab();
        document.getElementById('party-invite-popup').style.display = 'none';
        pendingInviteFrom = null;
    }
};

window.addEventListener('chatSend', e => {
    const data = e.detail; 
    if (!localPlayer) return;

    if (data.type === 'GLOBAL') {
        net.sendPayload({ type: 'CHAT_MSG', id: localPlayer.id, nick: localPlayer.nickname, text: data.text });
    } else if (data.type === 'PARTY') {
        if (currentPartyPartner) {
            net.sendPayload({ type: 'PARTY_MSG', fromNick: localPlayer.nickname, text: data.text }, currentPartyPartner);
        } else {
            chat.addMessage('SYSTEM', null, "Você não está em um grupo.");
        }
    } else if (data.type === 'WHISPER') {
        const targetId = Object.keys(remotePlayers).find(id => remotePlayers[id].nickname === data.target);
        if (targetId) {
            net.sendPayload({ type: 'WHISPER', fromNick: localPlayer.nickname, text: data.text }, targetId);
        } else {
            net.sendPayload({ type: 'WHISPER', fromNick: localPlayer.nickname, text: data.text, targetNick: data.target });
        }
    }
});

// --- EVENTOS DE REDE ---
window.addEventListener('joined', e => {
    const data = e.detail;
    logDebug("Conexão estabelecida! Sincronizando mundo...");
    if (data.worldState) worldState.applyFullState(data.worldState);
    if (data.guests) guestDataDB = data.guests; 
    startGame(data.seed, net.peer.id, document.getElementById('join-nickname').value.trim() || "Guest");
    if (data.playerData) { localPlayer.deserialize(data.playerData); updateUI(); }
});

window.addEventListener('peerDisconnected', e => {
    const peerId = e.detail.peerId;
    if (remotePlayers[peerId]) {
        const p = remotePlayers[peerId];
        chat.addMessage('SYSTEM', null, `${p.nickname || 'Alguém'} saiu.`);
        if (currentPartyPartner === peerId) {
            currentPartyPartner = null;
            chat.closePartyTab();
        }
        guestDataDB[p.nickname] = p.serialize().stats;
        saveProgress(); delete remotePlayers[peerId]; updateRanking();
    }
});

window.addEventListener('netData', e => {
    const d = e.detail;
    
    if (d.type === 'WHISPER') chat.addMessage('WHISPER', d.fromNick, d.text);
    if (d.type === 'CHAT_MSG') chat.addMessage('GLOBAL', d.nick, d.text);
    if (d.type === 'PARTY_MSG') chat.addMessage('PARTY', d.fromNick, d.text);

    if (d.type === 'PARTY_INVITE') {
        pendingInviteFrom = d.fromId;
        document.getElementById('invite-msg').innerText = `${d.fromNick} convidou você para o grupo!`;
        document.getElementById('party-invite-popup').style.display = 'block';
    }
    if (d.type === 'PARTY_ACCEPT') { 
        currentPartyPartner = d.fromId; 
        chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou o convite.`); 
        chat.openPartyTab();
    }
    if (d.type === 'PARTY_LEAVE' && currentPartyPartner === d.fromId) { 
        chat.addMessage('SYSTEM', null, `Seu parceiro saiu do grupo.`); 
        currentPartyPartner = null; 
        chat.closePartyTab();
    }
    
    if (d.type === 'PARTY_RESCUE' && isFainted) {
        clearTimeout(faintTimeout);
        isFainted = false;
        localPlayer.hp = 25; 
        document.getElementById('faint-screen').style.display = 'none';
        chat.addMessage('SYSTEM', null, `Reanimado por ${d.fromNick}!`);
        updateUI();
    }

    if (d.type === 'SPAWN_INFO') {
        if (!remotePlayers[d.id]) remotePlayers[d.id] = new Player(d.id, d.nick || "Guest");
        remotePlayers[d.id].pos = { x: d.x, y: d.y };
        remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
    }

    if (d.type === 'FLOWER_CURE') {
        if (localPlayer && d.ownerId === localPlayer.id) { localPlayer.tilesCured++; gainXp(XP_PASSIVE_CURE); }
        if (remotePlayers[d.ownerId]) remotePlayers[d.ownerId].tilesCured++;
    }

    if(d.type === 'MOVE') {
        if (net.isHost && !net.authenticatedPeers.has(d.id)) return;
        if(!remotePlayers[d.id]) { 
            remotePlayers[d.id] = new Player(d.id, d.nick || "Guest"); 
            chat.addMessage('SYSTEM', null, `${d.nick || 'Alguém'} entrou.`); 
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
    canvas.style.display = 'block';
    
    world = new WorldGenerator(seed);
    localPlayer = new Player(id, nick, true);
    const hives = world.getHiveLocations();
    
    let spawnIdx = net.isHost ? 0 : (Math.abs(id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % (hives.length-1))+1;
    
    if (hives[spawnIdx]) {
        localPlayer.homeBase = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
        localPlayer.pos = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
        localPlayer.targetPos = { ...localPlayer.pos };
        
        // Gerar primeira flor perto da colmeia se for host
        if (net.isHost) {
            const fx = Math.round(localPlayer.pos.x + 2);
            const fy = Math.round(localPlayer.pos.y + 2);
            changeTile(fx, fy, 'GRAMA');
            setTimeout(() => changeTile(fx, fy, 'FLOR'), 1000);
        }

        net.sendPayload({ 
            type: 'SPAWN_INFO', 
            id: localPlayer.id, 
            nick: localPlayer.nickname, 
            x: localPlayer.pos.x, 
            y: localPlayer.pos.y 
        });
    }

    if (net.isHost) {
        const saved = saveSystem.load();
        if (saved) {
            worldState.applyFullState(saved.world);
            if (saved.host) localPlayer.deserialize({ stats: saved.host });
            guestDataDB = saved.guests || {};
        }
    }
    
    chat.addMessage('SYSTEM', null, `Abelha ${nick} pronta para o voo!`);
    updateUI(); resize(); requestAnimationFrame(loop);
}

function startHostSimulation() {
    setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [key, plantData] of Object.entries(worldState.growingPlants)) {
            const startTime = plantData.time || plantData, ownerId = plantData.owner || null;
            const [x, y] = key.split(',').map(Number), elapsed = now - startTime, currentType = worldState.getModifiedTile(x, y);
            
            if (currentType === 'GRAMA' && elapsed > GROWTH_TIMES.BROTO) changeTile(x, y, 'BROTO', ownerId);
            else if (currentType === 'BROTO' && elapsed > GROWTH_TIMES.MUDA) changeTile(x, y, 'MUDA', ownerId);
            else if (currentType === 'MUDA' && elapsed > GROWTH_TIMES.FLOR) changeTile(x, y, 'FLOR', ownerId);
            
            if (currentType === 'FLOR' && Math.random() < 0.10) {
                const dx = Math.floor(Math.random() * 3) - 1, dy = Math.floor(Math.random() * 3) - 1;
                if (dx === 0 && dy === 0) continue;
                const tx = x + dx, ty = y + dy, target = worldState.getModifiedTile(tx, ty) || world.getTileAt(tx, ty);
                if (target === 'TERRA_QUEIMADA') { 
                    changeTile(tx, ty, 'GRAMA_SAFE'); 
                    if (ownerId) net.sendPayload({ type: 'FLOWER_CURE', ownerId: ownerId, x: tx, y: ty }); 
                    changed = true; 
                }
            }
        }
        if (changed) saveProgress();
    }, 1000);
}

function saveProgress() {
    if (!net.isHost || !localPlayer) return;
    Object.values(remotePlayers).forEach(p => { if (p.nickname) guestDataDB[p.nickname] = p.serialize().stats; });
    saveSystem.save({ seed: world.seed, world: worldState.getFullState(), host: localPlayer.serialize().stats, guests: guestDataDB });
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

function update() {
    if(!localPlayer || isFainted) return; 

    const gx = Math.round(localPlayer.pos.x), gy = Math.round(localPlayer.pos.y);
    if (gx !== lastGridX || gy !== lastGridY) {
        lastGridX = gx; lastGridY = gy;
        const el = document.getElementById('hud-coords'); if(el) el.innerText = `${gx}, ${gy}`;
    }
    
    const m = input.getMovement();
    localPlayer.update(m);
    const moving = m.x !== 0 || m.y !== 0;

    if(moving || Math.random() < 0.05) {
        localPlayer.pos.x += m.x * localPlayer.speed; localPlayer.pos.y += m.y * localPlayer.speed;
        net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir, stats: { level: localPlayer.level, hp: localPlayer.hp, maxHp: localPlayer.maxHp, tilesCured: localPlayer.tilesCured } });
    }

    if (localPlayer.pollen > 0 && moving) spawnPollenParticle();
    updateParticles();

    if (currentPartyPartner && remotePlayers[currentPartyPartner]) {
        const partner = remotePlayers[currentPartyPartner];
        if (partner.hp <= 0 && localPlayer.pollen >= 20) {
            const d = Math.sqrt(Math.pow(localPlayer.pos.x - partner.pos.x, 2) + Math.pow(localPlayer.pos.y - partner.pos.y, 2));
            if (d < 1.0) { 
                localPlayer.pollen -= 20;
                net.sendPayload({ type: 'PARTY_RESCUE', fromNick: localPlayer.nickname }, currentPartyPartner);
                chat.addMessage('SYSTEM', null, `Você salvou ${partner.nickname}!`);
                updateUI();
            }
        }
    }

    const tile = worldState.getModifiedTile(gx, gy) || world.getTileAt(gx, gy);
    const isSafe = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(tile);

    if (!isSafe) {
        damageFrameCounter++;
        if (damageFrameCounter >= DAMAGE_RATE) {
            damageFrameCounter = 0; localPlayer.hp -= DAMAGE_AMOUNT; updateUI();
            if (localPlayer.hp <= 0) processFaint();
        }
    } 

    const hpRatio = localPlayer.hp / localPlayer.maxHp;
    const overlay = document.getElementById('suffocation-overlay');
    if (overlay) overlay.style.opacity = hpRatio < 0.7 ? (0.7 - hpRatio) * 1.4 : 0;

    if (localPlayer.homeBase && localPlayer.hp < localPlayer.maxHp) {
        const dist = Math.sqrt(Math.pow(localPlayer.pos.x - localPlayer.homeBase.x, 2) + Math.pow(localPlayer.pos.y - localPlayer.homeBase.y, 2));
        let healTickRate = (dist <= 1.5) ? 60 : (dist <= 2.5 ? 120 : (dist <= 3.5 ? 240 : 0));
        if (healTickRate > 0 && ++cureFrameCounter >= healTickRate) {
            cureFrameCounter = 0;
            localPlayer.hp = Math.min(localPlayer.maxHp, localPlayer.hp + 1);
            updateUI();
        }
    }

    if (tile === 'FLOR' && localPlayer.pollen < localPlayer.maxPollen && ++collectionFrameCounter >= COLLECTION_RATE) {
        localPlayer.pollen++; collectionFrameCounter = 0; gainXp(XP_PER_POLLEN);
        if (localPlayer.pollen >= localPlayer.maxPollen) changeTile(gx, gy, 'FLOR_COOLDOWN', localPlayer.id);
    }

    if (tile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0 && moving && ++uiUpdateCounter >= CURE_ATTEMPT_RATE) {
        uiUpdateCounter = 0; localPlayer.pollen--; 
        if (Math.random() < PLANT_SPAWN_CHANCE) { 
            changeTile(gx, gy, 'GRAMA', localPlayer.id); 
            localPlayer.tilesCured++; gainXp(XP_PER_CURE); 
            saveProgress(); 
        }
        updateUI();
    }

    if(++damageFrameCounter > 60) { updateRanking(); damageFrameCounter = 0; }
    camera = { x: localPlayer.pos.x, y: localPlayer.pos.y };
}

function processFaint() {
    isFainted = true;
    const faintScreen = document.getElementById('faint-screen');
    if(faintScreen) faintScreen.style.display = 'flex';
    if (currentPartyPartner) net.sendPayload({ type: 'PARTY_MSG', fromNick: 'SINAL', text: `${localPlayer.nickname} caiu! Precisa de ajuda!` }, currentPartyPartner);

    faintTimeout = setTimeout(() => {
        localPlayer.respawn();
        if (localPlayer.homeBase) { localPlayer.pos = {...localPlayer.homeBase}; localPlayer.targetPos = {...localPlayer.pos}; }
        if(faintScreen) faintScreen.style.display = 'none';
        isFainted = false; updateUI();
        net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir });
    }, 4000);
}

function gainXp(amount) {
    const old = localPlayer.level; localPlayer.xp += amount;
    if (localPlayer.xp >= localPlayer.maxXp) {
        localPlayer.xp -= localPlayer.maxXp; localPlayer.level++;
        localPlayer.maxXp = Math.floor(localPlayer.maxXp * 1.5); localPlayer.maxPollen += 10; localPlayer.hp = localPlayer.maxHp; 
        chat.addMessage('SYSTEM', null, `Nível ${localPlayer.level}! Suas asas estão mais fortes.`);
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

function spawnPollenParticle() { pollenParticles.push({ wx: localPlayer.pos.x + (Math.random()*0.4-0.2), wy: localPlayer.pos.y + (Math.random()*0.4-0.2), size: Math.random()*3+2, speedY: Math.random()*0.02+0.01, life: 1.0 }); }
function spawnSmokeParticle(tx, ty) {
    const isEmber = Math.random() < 0.15;
    smokeParticles.push({ wx: tx + Math.random(), wy: ty + Math.random(), isEmber: isEmber, size: isEmber ? (Math.random() * 3 + 1) : (Math.random() * 5 + 2), speedY: -(Math.random()*0.03+0.01), wobbleTick: Math.random()*100, wobbleSpeed: Math.random()*0.05+0.02, wobbleAmp: 0.01, life: Math.random()*0.6+0.4, decay: 0.006, grayVal: Math.floor(Math.random()*60) });
}
function updateParticles() {
    pollenParticles.forEach(p => { p.wy += p.speedY; p.life -= 0.02; }); pollenParticles = pollenParticles.filter(p => p.life > 0);
    smokeParticles.forEach(p => { p.wy += p.speedY; p.life -= p.decay; p.wobbleTick += p.wobbleSpeed; p.wx += Math.sin(p.wobbleTick)*p.wobbleAmp; if(!p.isEmber) p.size+=0.03; });
    smokeParticles = smokeParticles.filter(p => p.life > 0);
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
    const dist = Math.sqrt(Math.pow(localPlayer.pos.x - localPlayer.homeBase.x, 2) + Math.pow(localPlayer.pos.y - localPlayer.homeBase.y, 2));
    document.getElementById('rpg-hud').classList.toggle('healing-active', dist <= 3.5 && localPlayer.hp < localPlayer.maxHp);
}

function updateRanking() {
    const listEl = document.getElementById('ranking-list');
    if (!listEl) return;

    let allPlayersData = Object.keys(guestDataDB).map(nick => ({
        nickname: nick,
        tilesCured: guestDataDB[nick].tilesCured || 0
    }));

    if (!allPlayersData.find(p => p.nickname === localPlayer.nickname)) {
        allPlayersData.push({ nickname: localPlayer.nickname, tilesCured: localPlayer.tilesCured || 0 });
    }

    allPlayersData.sort((a, b) => b.tilesCured - a.tilesCured);
    listEl.innerHTML = '';
    allPlayersData.slice(0, 5).forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'rank-item';
        const isOnline = Object.values(remotePlayers).some(rp => rp.nickname === p.nickname) || p.nickname === localPlayer.nickname;
        div.innerHTML = `<span>${index + 1}. ${p.nickname} ${isOnline ? '●' : ''}</span><span class="rank-val">${p.tilesCured}</span>`;
        listEl.appendChild(div);
    });
}

function draw() {
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(!world) return;
    const rTileSize = world.tileSize * zoomLevel;
    const cX = Math.floor(localPlayer.pos.x / world.chunkSize), cY = Math.floor(localPlayer.pos.y / world.chunkSize);
    const range = zoomLevel < 0.8 ? 2 : 1; 

    for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x)*rTileSize + canvas.width/2, sY = (t.y - camera.y)*rTileSize + canvas.height/2;
            if(sX > -rTileSize && sX < canvas.width+rTileSize && sY > -rTileSize && sY < canvas.height+rTileSize) {
                const type = worldState.getModifiedTile(t.x, t.y) || t.type;
                if (type === 'TERRA_QUEIMADA' && Math.random() < 0.015) spawnSmokeParticle(t.x, t.y);
                ctx.fillStyle = (type === 'COLMEIA') ? '#f1c40f' : (['GRAMA','GRAMA_SAFE','BROTO','MUDA','FLOR', 'FLOR_COOLDOWN'].includes(type) ? '#2ecc71' : '#34495e');
                ctx.fillRect(sX, sY, rTileSize, rTileSize);
                if (type === 'BROTO') { ctx.fillStyle = '#006400'; const sz = 12*zoomLevel; ctx.fillRect(sX+(rTileSize-sz)/2, sY+(rTileSize-sz)/2, sz, sz); }
                else if (type === 'MUDA') { ctx.fillStyle = '#228B22'; const sz = 20*zoomLevel; ctx.fillRect(sX+(rTileSize-sz)/2, sY+(rTileSize-sz)/2, sz, sz); }
                else if (['FLOR','FLOR_COOLDOWN'].includes(type) && assets.flower.complete) {
                    if (type === 'FLOR_COOLDOWN') ctx.globalAlpha = 0.4;
                    const by = rTileSize * 0.65;
                    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(sX+rTileSize/2, sY+by, 8*zoomLevel, 3*zoomLevel, 0, 0, Math.PI*2); ctx.fill();
                    ctx.save(); ctx.translate(sX+rTileSize/2, sY+by);
                    ctx.rotate(Math.sin(Date.now()/800 + t.x*0.5)*0.1);
                    ctx.drawImage(assets.flower, -rTileSize/2, -rTileSize, rTileSize, rTileSize);
                    ctx.restore(); ctx.globalAlpha = 1.0;
                }
            }
        });
    }

    smokeParticles.forEach(p => { 
        const psX = (p.wx - camera.x) * rTileSize + canvas.width / 2, psY = (p.wy - camera.y) * rTileSize + canvas.height / 2; 
        if (p.isEmber) ctx.fillStyle = `rgba(231, 76, 60, ${p.life})`; else ctx.fillStyle = `rgba(${p.grayVal},${p.grayVal},${p.grayVal},${p.life*0.4})`;
        ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel); 
    });
    pollenParticles.forEach(p => { 
        const psX = (p.wx - camera.x) * rTileSize + canvas.width / 2, psY = (p.wy - camera.y) * rTileSize + canvas.height / 2; 
        ctx.fillStyle = `rgba(241,196,15,${p.life})`; ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel); 
    });
    if (localPlayer) {
        Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize, currentPartyPartner));
        localPlayer.draw(ctx, camera, canvas, rTileSize, currentPartyPartner);
    }
    
    if (localPlayer && localPlayer.homeBase && Math.sqrt(Math.pow(localPlayer.homeBase.x-localPlayer.pos.x,2)+Math.pow(localPlayer.homeBase.y-localPlayer.pos.y,2)) > 30) {
        const angle = Math.atan2(localPlayer.homeBase.y-localPlayer.pos.y, localPlayer.homeBase.x-localPlayer.pos.x), orbit = 60*zoomLevel;
        const ax = canvas.width/2 + Math.cos(angle)*orbit, ay = canvas.height/2 + Math.sin(angle)*orbit;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(angle); ctx.fillStyle = "#f1c40f"; ctx.strokeStyle = "black"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-10*zoomLevel, -5*zoomLevel); ctx.lineTo(-10*zoomLevel, 5*zoomLevel); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
