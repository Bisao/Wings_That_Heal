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

// --- ESTADO SOCIAL ATUALIZADO (MULTI-PARTY) ---
let partyMembers = []; // Agora é uma lista de IDs
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
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

let collectionFrameCounter = 0;
let cureFrameCounter = 0;
let damageFrameCounter = 0;
let uiUpdateCounter = 0; 

// Estado de Desmaio local
let isFainted = false;
let faintTimeout = null; 

const assets = { flower: new Image() };
assets.flower.src = 'assets/Flower.png';

// --- SISTEMA DE LOGS (LIMPO) ---
function logDebug(msg, color = "#00ff00") {
    console.log(`%c[Wings] ${msg}`, `color: ${color}`);
}

// --- SISTEMA DE NOTIFICAÇÃO VISUAL (TOAST) ---
function showError(msg) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        // Estilo inline para garantir funcionamento imediato sem alterar CSS externo
        toast.style.cssText = "position: fixed; top: 10%; left: 50%; transform: translateX(-50%); background: rgba(231, 76, 60, 0.95); color: white; padding: 15px 25px; border-radius: 50px; font-weight: 900; z-index: 9999; box-shadow: 0 5px 20px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; pointer-events: none;";
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = "1";
    
    // Reseta o timer para sumir
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.style.opacity = "0";
    }, 3000);
}

// Carregar Nickname salvo
window.addEventListener('load', () => {
    const savedNick = localStorage.getItem('wings_nick');
    if (savedNick) {
        document.getElementById('host-nickname').value = savedNick;
        document.getElementById('join-nickname').value = savedNick;
    }
});

// --- UI HANDLERS (ATUALIZADOS PARA MOBILE) ---

document.getElementById('btn-join').onpointerdown = (e) => {
    e.preventDefault();
    if (window.requestGameFullscreen) {
        try { window.requestGameFullscreen(); } catch(err) {}
    }

    const nick = document.getElementById('join-nickname').value.trim() || "Guest";
    const id = document.getElementById('join-id').value.trim();
    const pass = document.getElementById('join-pass').value.trim();
    
    // Validação com Toast
    if(!id) return showError("ID da Colmeia é obrigatório!");

    localStorage.setItem('wings_nick', nick);
    logDebug(`Buscando colmeia: ${id}...`);

    net.init(null, (ok, err) => { 
        if(ok) {
            net.joinRoom(id, pass, nick); 
        } else {
            showError("Falha ao iniciar motor de rede.");
        }
    });
};

document.getElementById('btn-create').onpointerdown = (e) => {
    e.preventDefault();
    if (window.requestGameFullscreen) {
        try { window.requestGameFullscreen(); } catch(err) {}
    }

    const nick = document.getElementById('host-nickname').value.trim() || "Host";
    const id = document.getElementById('create-id').value.trim();
    const pass = document.getElementById('create-pass').value.trim();
    const seed = document.getElementById('world-seed').value.trim() || Date.now().toString();
    
    // Validação com Toast
    if(!id) return showError("Crie um ID para a Colmeia!");

    localStorage.setItem('wings_nick', nick);
    logDebug(`Iniciando colmeia com ID: ${id}...`);
    
    net.init(id, (ok, errorType) => {
        if(ok) {
            net.hostRoom(id, pass, seed, 
                () => worldState.getFullState(), 
                (guestNick) => guestDataDB[guestNick],
                () => guestDataDB 
            );
            startGame(seed, id, nick);
            if(net.isHost) startHostSimulation();
        } else { 
            let msg = "Erro ao criar sala.";
            if (errorType === 'unavailable-id') msg = "Este ID de Colmeia já existe!";
            showError(msg);
        }
    });
};

// --- LOGICA DE INTERAÇÃO SOCIAL ---

window.addEventListener('playerClicked', e => {
    const targetNick = e.detail;
    let targetId = Object.keys(remotePlayers).find(id => remotePlayers[id].nickname === targetNick);
    
    if (targetId) {
        selectedPlayerId = targetId;
        const p = remotePlayers[targetId];
        document.getElementById('modal-player-name').innerText = p.nickname;
        document.getElementById('modal-player-info').innerText = `Nível: ${p.level || 1}`;
        
        let whisperBtn = document.getElementById('btn-whisper-action');
        if (!whisperBtn) {
            whisperBtn = document.createElement('button');
            whisperBtn.id = 'btn-whisper-action';
            whisperBtn.className = 'modal-btn';
            whisperBtn.style.background = '#3498db';
            whisperBtn.style.color = 'white';
            whisperBtn.innerText = 'COCHICHAR';
            const modal = document.getElementById('player-modal');
            modal.insertBefore(whisperBtn, modal.lastElementChild);
        }
        
        whisperBtn.onclick = () => {
            chat.openPrivateTab(p.nickname);
            document.getElementById('player-modal').style.display = 'none';
        };

        const partyBtn = document.getElementById('btn-party-action');
        if (partyMembers.includes(targetId)) {
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
    if (partyMembers.includes(selectedPlayerId)) {
        net.sendPayload({ type: 'PARTY_LEAVE', fromId: localPlayer.id }, partyMembers);
        chat.addMessage('SYSTEM', null, `Você saiu do grupo.`);
        partyMembers = [];
        chat.closePartyTab();
    } else {
        net.sendPayload({ type: 'PARTY_INVITE', fromId: localPlayer.id, fromNick: localPlayer.nickname }, selectedPlayerId);
        chat.addMessage('SYSTEM', null, `Convite enviado para ${remotePlayers[selectedPlayerId].nickname}.`);
    }
    document.getElementById('player-modal').style.display = 'none';
};

document.getElementById('btn-accept-invite').onclick = () => {
    if (pendingInviteFrom) {
        if (!partyMembers.includes(pendingInviteFrom)) partyMembers.push(pendingInviteFrom);
        net.sendPayload({ type: 'PARTY_ACCEPT', fromId: localPlayer.id, fromNick: localPlayer.nickname }, pendingInviteFrom);
        chat.addMessage('SYSTEM', null, `Você entrou no grupo.`);
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
        if (partyMembers.length > 0) {
            net.sendPayload({ type: 'PARTY_MSG', fromNick: localPlayer.nickname, text: data.text }, partyMembers);
        } else {
            chat.addMessage('SYSTEM', null, "Você não está em um grupo.");
        }
    } else if (data.type === 'WHISPER') {
        const targetId = Object.keys(remotePlayers).find(id => remotePlayers[id].nickname === data.target);
        if (targetId) {
            net.sendPayload({ type: 'WHISPER', fromNick: localPlayer.nickname, text: data.text }, targetId);
        } else {
            chat.addMessage('SYSTEM', null, `${data.target} não está mais na colmeia.`);
        }
    }
});

// --- EVENTOS DE REDE ---
window.addEventListener('joined', e => {
    const data = e.detail;
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
        if (partyMembers.includes(peerId)) {
            partyMembers = partyMembers.filter(id => id !== peerId);
            if (partyMembers.length === 0) chat.closePartyTab();
        }
        guestDataDB[p.nickname] = p.serialize().stats;
        saveProgress(); delete remotePlayers[peerId];
    }
});

window.addEventListener('netData', e => {
    const d = e.detail;
    
    // --- NOVO: Sincronização de Tempo ---
    if (d.type === 'TIME_SYNC') {
        worldState.worldTime = d.time;
    }
    // ------------------------------------

    if (d.type === 'WHISPER') chat.addMessage('WHISPER', d.fromNick, d.text);
    if (d.type === 'CHAT_MSG') chat.addMessage('GLOBAL', d.nick, d.text);
    if (d.type === 'PARTY_MSG') {
        chat.addMessage('PARTY', d.fromNick, d.text);
    }

    if (d.type === 'PARTY_INVITE') {
        pendingInviteFrom = d.fromId;
        document.getElementById('invite-msg').innerText = `${d.fromNick} convidou você!`;
        document.getElementById('party-invite-popup').style.display = 'block';
    }
    if (d.type === 'PARTY_ACCEPT') { 
        if (!partyMembers.includes(d.fromId)) partyMembers.push(d.fromId);
        chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou o convite.`); 
        chat.openPartyTab();
        if (partyMembers.length > 1) {
             net.sendPayload({ type: 'PARTY_SYNC', members: partyMembers }, d.fromId);
        }
    }
    if (d.type === 'PARTY_SYNC') {
        d.members.forEach(id => {
            if (id !== localPlayer.id && !partyMembers.includes(id)) partyMembers.push(id);
        });
        chat.openPartyTab();
    }
    if (d.type === 'PARTY_LEAVE') { 
        chat.addMessage('SYSTEM', null, `${remotePlayers[d.fromId]?.nickname || 'Um membro'} saiu do grupo.`); 
        partyMembers = partyMembers.filter(id => id !== d.fromId);
        if (partyMembers.length === 0) chat.closePartyTab();
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

// --- SISTEMA DE RANKING COMPLETO (COM SCROLL) ---
function updateRanking() {
    let rankingData = Object.entries(guestDataDB).map(([nick, stats]) => ({
        nick: nick,
        score: stats.tilesCured || 0
    }));

    if (localPlayer) {
        const existingLocal = rankingData.find(r => r.nick === localPlayer.nickname);
        if (existingLocal) {
            existingLocal.score = Math.max(existingLocal.score, localPlayer.tilesCured);
        } else {
            rankingData.push({ nick: localPlayer.nickname, score: localPlayer.tilesCured });
        }
    }

    Object.values(remotePlayers).forEach(p => {
        const existing = rankingData.find(r => r.nick === p.nickname);
        if (existing) {
            existing.score = Math.max(existing.score, p.tilesCured);
        } else {
            rankingData.push({ nick: p.nickname, score: p.tilesCured });
        }
    });

    rankingData.sort((a, b) => b.score - a.score);
    // REMOVIDO: .slice(0, 5) -> Agora exibe todos, e o CSS faz o scroll
    
    const rankingList = document.getElementById('ranking-list');
    if (rankingList) {
        if (rankingData.length === 0) {
            rankingList.innerHTML = '<div class="rank-item" style="justify-content:center; color:#555">Nenhum dado</div>';
        } else {
            rankingList.innerHTML = rankingData.map((player, index) => {
                const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `${index + 1}º`));
                // Destaca o player local
                const isMe = localPlayer && player.nick === localPlayer.nickname ? 'color:white; font-weight:bold' : '';
                return `<div class="rank-item" style="${isMe}">
                            <span>${medal} ${player.nick}</span>
                            <b>${player.score}</b>
                        </div>`;
            }).join('');
        }
    }
}

// --- LÓGICA DE JOGO ---
function startGame(seed, id, nick) {
    document.getElementById('lobby-overlay').style.display = 'none';
    document.getElementById('rpg-hud').style.display = 'block';
    document.getElementById('chat-toggle-btn').style.display = 'block';
    canvas.style.display = 'block';
    
    // ATIVA O JOYSTICK APENAS AGORA
    input.showJoystick();

    world = new WorldGenerator(seed);
    localPlayer = new Player(id, nick, true);
    const hives = world.getHiveLocations();
    
    let spawnIdx = net.isHost ? 0 : (Math.abs(id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % (hives.length-1))+1;
    
    if (hives[spawnIdx]) {
        localPlayer.homeBase = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
        localPlayer.pos = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
        localPlayer.targetPos = { ...localPlayer.pos };
        
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
    
    // Inicia atualização periódica do Ranking
    setInterval(updateRanking, 5000);
}

function startHostSimulation() {
    setInterval(() => {
        // --- ATUALIZAÇÃO DO TEMPO (Host Only) ---
        // 1 Segundo Real = 1 Minuto no Jogo (60000ms)
        worldState.worldTime += 60000;
        
        // Envia sync a cada segundo (pode otimizar se quiser, mas assim garante suavidade)
        net.sendPayload({ type: 'TIME_SYNC', time: worldState.worldTime });
        // -----------------------------------------

        const now = Date.now();
        let changed = false;
        for (const [key, plantData] of Object.entries(worldState.growingPlants)) {
            const startTime = plantData.time || plantData, ownerId = plantData.owner || null;
            const [x, y] = key.split(',').map(Number), elapsed = now - startTime, currentType = worldState.getModifiedTile(x, y);
            
            if (currentType === 'GRAMA' && elapsed > GROWTH_TIMES.BROTO) changeTile(x, y, 'BROTO', ownerId);
            else if (currentType === 'BROTO' && elapsed > GROWTH_TIMES.MUDA) changeTile(x, y, 'MUDA', ownerId);
            else if (currentType === 'MUDA' && elapsed > GROWTH_TIMES.FLOR) changeTile(x, y, 'FLOR', ownerId);
            else if (currentType === 'FLOR_COOLDOWN' && elapsed > FLOWER_COOLDOWN_TIME) changeTile(x, y, 'FLOR', ownerId);
            
            if (currentType === 'FLOR' && Math.random() < 0.10) {
                const dx = Math.floor(Math.random() * 3) - 1, dy = Math.floor(Math.random() * 3) - 1;
                if (dx === 0 && dy === 0) continue;
                const tx = x + dx, ty = y + dy, target = worldState.getModifiedTile(tx, ty) || world.getTileAt(tx, ty);
                if (target === 'TERRA_QUEIMADA') { 
                    changeTile(tx, ty, 'GRAMA_SAFE'); 
                    
                    if (ownerId) {
                        net.sendPayload({ type: 'FLOWER_CURE', ownerId: ownerId, x: tx, y: ty }); 
                        
                        if (localPlayer && ownerId === localPlayer.id) {
                            localPlayer.tilesCured++;
                            gainXp(XP_PASSIVE_CURE);
                        } else if (remotePlayers[ownerId]) {
                            remotePlayers[ownerId].tilesCured++;
                            const pName = remotePlayers[ownerId].nickname;
                            if (pName) {
                                if (!guestDataDB[pName]) guestDataDB[pName] = {};
                                guestDataDB[pName].tilesCured = remotePlayers[ownerId].tilesCured;
                            }
                        }
                    }
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

// --- FUNÇÃO PARA CALCULAR AMBIENTE (DIA/NOITE) ---
function updateEnvironment() {
    if (!worldState.worldTime) return;

    const date = new Date(worldState.worldTime);
    const day = String(date.getDate()).padStart(2, '0');
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // Atualiza HUD
    const timeEl = document.getElementById('hud-time');
    if (timeEl) timeEl.innerText = `${day} ${month} ${year} - ${hours}:${minutes}`;

    // Lógica de Ciclo Dia/Noite (CORRIGIDA)
    // 0 = Claro (Meio dia, 12h)
    // 1 = Escuro (Meia noite, 0h/24h)
    
    const h = date.getHours() + date.getMinutes() / 60;
    
    // Removemos o deslocamento +12. Agora:
    // h=0  -> cos(0) = 1 -> (1+1)/2 = 1 (Escuro)
    // h=12 -> cos(pi) = -1 -> (-1+1)/2 = 0 (Claro)
    const darknessIntensity = (Math.cos(h / 24 * Math.PI * 2) + 1) / 2;
    
    // Aplicamos um teto de escuridão para não ficar impossível de ver (max 0.85)
    const overlayOpacity = darknessIntensity * 0.85;

    const overlay = document.getElementById('day-night-overlay');
    if (overlay) {
        overlay.style.opacity = overlayOpacity;
    }
}

function update() {
    if(!localPlayer || isFainted) return; 

    // Atualiza o ambiente a cada frame
    updateEnvironment();

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

    partyMembers.forEach(memberId => {
        const partner = remotePlayers[memberId];
        if (partner && partner.hp <= 0 && localPlayer.pollen >= 20) {
            const d = Math.sqrt(Math.pow(localPlayer.pos.x - partner.pos.x, 2) + Math.pow(localPlayer.pos.y - partner.pos.y, 2));
            if (d < 1.0) { 
                localPlayer.pollen -= 20;
                net.sendPayload({ type: 'PARTY_RESCUE', fromNick: localPlayer.nickname }, memberId);
                chat.addMessage('SYSTEM', null, `Você salvou ${partner.nickname}!`);
                updateUI();
            }
        }
    });

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

    camera = { x: localPlayer.pos.x, y: localPlayer.pos.y };
}

function processFaint() {
    isFainted = true;
    const faintScreen = document.getElementById('faint-screen');
    if(faintScreen) faintScreen.style.display = 'flex';
    if (partyMembers.length > 0) {
        net.sendPayload({ type: 'PARTY_MSG', fromNick: 'SINAL', text: `ESTOU CAÍDO!` }, partyMembers);
    }

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
        chat.addMessage('SYSTEM', null, `Nível ${localPlayer.level}!`);
    }
    if (localPlayer.level > old) saveProgress();
    updateUI();
}

function changeTile(x, y, newType, ownerId = null) {
    if(worldState.setTile(x, y, newType)) {
        if (net.isHost && newType === 'GRAMA') worldState.addGrowingPlant(x, y, ownerId);
        if (net.isHost && newType === 'FLOR_COOLDOWN') worldState.resetPlantTimer(x, y);
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
        Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize, remotePlayers, partyMembers));
        localPlayer.draw(ctx, camera, canvas, rTileSize, remotePlayers, partyMembers);
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
