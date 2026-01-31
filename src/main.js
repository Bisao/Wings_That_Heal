import { NetworkManager } from './core/network.js';
import { WorldGenerator } from './world/worldGen.js';
import { WorldState } from './world/worldState.js';
import { Player } from './entities/player.js';
import { InputHandler } from './core/input.js';
import { SaveSystem } from './core/saveSystem.js';
import { ChatSystem } from './core/chatSystem.js';
import { SkillTree } from './player/skillTree.js'; 
import { Ant } from './entities/ant.js'; 
import { Projectile } from './entities/projectile.js'; 
import { WaveEffect } from './entities/WaveEffect.js'; 
import { ParticleSystem } from './utils/ParticleSystem.js';
import { UIManager } from './core/UIManager.js';
// [NOVO] Importação da Simulação
import { HostSimulation } from './core/HostSimulation.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const net = new NetworkManager();
const input = new InputHandler(); 
if (input.isMobile && typeof input.hideJoystick === 'function') {
    input.hideJoystick();
}

const worldState = new WorldState();
const saveSystem = new SaveSystem();
const chat = new ChatSystem();
const particles = new ParticleSystem();
const ui = new UIManager();

let world, localPlayer;
let remotePlayers = {};
let camera = { x: 0, y: 0 };

let enemies = [];
let projectiles = [];
let activeWaves = [];

let partyMembers = []; 
let localPartyName = "";
let localPartyIcon = "";
let selectedPlayerId = null;    
let pendingInviteFrom = null;   
let pendingInviteData = null;

let lastGridX = -9999;
let lastGridY = -9999;
let guestDataDB = {}; 
let hiveRegistry = {}; 
// [NOVO] Instância da Simulação (será iniciada apenas se Host)
let hostSim = null;

let zoomLevel = 1.5; 
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

const PLANT_SPAWN_CHANCE = 0.01; 
const CURE_ATTEMPT_RATE = 20;    
const COLLECTION_RATE = 5; 

const DAMAGE_RATE = 2; 
const DAMAGE_AMOUNT = 0.2; 
const XP_PER_CURE = 15;    
const XP_PER_POLLEN = 0.2;

// [REMOVIDO] Constantes de crescimento e tempo (movidas para HostSimulation)

let collectionFrameCounter = 0;
let damageFrameCounter = 0;
let uiUpdateCounter = 0; 

let isFainted = false;
let faintTimeout = null; 

let rescueTimer = 0;
let currentRescueTarget = null;
const RESCUE_DURATION = 180; 
const RESCUE_POLLEN_COST = 20;

let invulnerabilityTimer = 0; 
let lastManualSaveTime = 0;
const SAVE_COOLDOWN = 15000; 

// [REMOVIDO] hiveWaveTick e enemySpawnTick

const assets = { flower: new Image() };
assets.flower.src = 'assets/Flower.png';

function logDebug(msg, color = "#00ff00") {
    console.log(`%c[Wings] ${msg}`, `color: ${color}`);
}

window.addEventListener('load', () => {
    const savedNick = localStorage.getItem('wings_nick');
    if (savedNick) {
        document.getElementById('host-nickname').value = savedNick;
        document.getElementById('join-nickname').value = savedNick;
    }
});

window.addEventListener('wheel', (e) => {
    if (e.deltaY < 0) zoomLevel = Math.min(MAX_ZOOM, zoomLevel + 0.1);
    else zoomLevel = Math.max(MIN_ZOOM, zoomLevel - 0.1);
}, { passive: true });

document.getElementById('btn-join').onpointerdown = (e) => {
    e.preventDefault();
    if (window.requestGameFullscreen) { try { window.requestGameFullscreen(); } catch(err) {} }
    const nick = document.getElementById('join-nickname').value.trim() || "Guest";
    const id = document.getElementById('join-id').value.trim();
    const pass = document.getElementById('join-pass').value.trim();
    if(!id) return ui.showError("ID da Colmeia é obrigatório!");
    localStorage.setItem('wings_nick', nick);
    net.init(null, (ok, err) => { if(ok) net.joinRoom(id, pass, nick); else ui.showError("Falha ao iniciar motor de rede."); });
};

document.getElementById('btn-create').onpointerdown = (e) => {
    e.preventDefault();
    if (window.requestGameFullscreen) { try { window.requestGameFullscreen(); } catch(err) {} }
    const nick = document.getElementById('host-nickname').value.trim() || "Host";
    const id = document.getElementById('create-id').value.trim();
    const pass = document.getElementById('create-pass').value.trim();
    const seed = document.getElementById('world-seed').value.trim() || Date.now().toString();
    if(!id) return ui.showError("Crie um ID para a Colmeia!");
    localStorage.setItem('wings_nick', nick);
    net.init(id, (ok, errorType) => {
        if(ok) {
            net.hostRoom(id, pass, seed, () => worldState.getFullState(), (guestNick) => guestDataDB[guestNick], () => guestDataDB);
            startGame(seed, id, nick);
            
            // [MODIFICAÇÃO] Inicia a simulação do host
            if(net.isHost) {
                hostSim = new HostSimulation(world, worldState, net);
                hostSim.start({
                    localPlayer, remotePlayers, enemies, activeWaves,
                    hiveRegistry, guestDataDB,
                    fnChangeTile: changeTile, 
                    fnSaveProgress: saveProgress, 
                    fnGainXp: gainXp
                });
            }
        } else { 
            let msg = "Erro ao criar sala."; if (errorType === 'unavailable-id') msg = "Este ID de Colmeia já existe!"; ui.showError(msg);
        }
    });
};

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
        localPartyName = "";
        localPartyIcon = "";
        chat.closePartyTab();
    } else {
        if (partyMembers.length > 0) {
            net.sendPayload({ type: 'PARTY_INVITE', fromId: localPlayer.id, fromNick: localPlayer.nickname, pName: localPartyName, pIcon: localPartyIcon }, selectedPlayerId);
            chat.addMessage('SYSTEM', null, `Convite enviado para ${remotePlayers[selectedPlayerId].nickname}.`);
        } else {
            document.getElementById('party-name-input').value = "";
            document.getElementById('party-create-modal').style.display = 'block';
        }
    }
    document.getElementById('player-modal').style.display = 'none';
};

document.getElementById('btn-confirm-party-create').onclick = () => {
    const pName = document.getElementById('party-name-input').value.toUpperCase().trim() || "ALFA";
    const selectedIconEl = document.querySelector('.icon-btn.selected');
    const pIcon = selectedIconEl ? selectedIconEl.innerText : "🛡️";
    localPartyName = pName;
    localPartyIcon = pIcon;
    partyMembers = [localPlayer.id];
    if (selectedPlayerId) {
        net.sendPayload({ type: 'PARTY_INVITE', fromId: localPlayer.id, fromNick: localPlayer.nickname, pName: localPartyName, pIcon: localPartyIcon }, selectedPlayerId);
        chat.addMessage('SYSTEM', null, `Grupo ${pIcon} ${pName} criado! Convite enviado.`);
        chat.openPartyTab(localPartyName, localPartyIcon);
    }
    document.getElementById('party-create-modal').style.display = 'none';
};

document.getElementById('btn-accept-invite').onclick = () => {
    if (pendingInviteFrom && pendingInviteData) {
        if (!partyMembers.includes(pendingInviteFrom)) partyMembers.push(pendingInviteFrom);
        localPartyName = pendingInviteData.pName || "ALFA";
        localPartyIcon = pendingInviteData.pIcon || "🛡️";
        net.sendPayload({ type: 'PARTY_ACCEPT', fromId: localPlayer.id, fromNick: localPlayer.nickname, pName: localPartyName, pIcon: localPartyIcon }, pendingInviteFrom);
        chat.addMessage('SYSTEM', null, `Você entrou no grupo ${localPartyIcon} ${localPartyName}.`);
        chat.openPartyTab(localPartyName, localPartyIcon);
        document.getElementById('party-invite-popup').style.display = 'none';
        pendingInviteFrom = null;
        pendingInviteData = null;
    }
};

window.addEventListener('chatSend', e => {
    const data = e.detail; if (!localPlayer) return;
    if (data.type === 'GLOBAL') net.sendPayload({ type: 'CHAT_MSG', id: localPlayer.id, nick: localPlayer.nickname, text: data.text });
    else if (data.type === 'PARTY') {
        if (partyMembers.length > 0) net.sendPayload({ type: 'PARTY_MSG', fromNick: localPlayer.nickname, text: data.text }, partyMembers);
        else chat.addMessage('SYSTEM', null, "Você não está em um grupo.");
    } else if (data.type === 'WHISPER') {
        const targetId = Object.keys(remotePlayers).find(id => remotePlayers[id].nickname === data.target);
        if (targetId) net.sendPayload({ type: 'WHISPER', fromNick: localPlayer.nickname, text: data.text }, targetId);
        else chat.addMessage('SYSTEM', null, `${data.target} não está mais na colmeia.`);
    }
});

window.addEventListener('joined', e => {
    const data = e.detail;
    if (data.worldState) worldState.applyFullState(data.worldState);
    if (data.guests) guestDataDB = data.guests; 
    startGame(data.seed, net.peer.id, document.getElementById('join-nickname').value.trim() || "Guest");
    if (data.playerData) { localPlayer.deserialize(data.playerData); ui.updateHUD(localPlayer); }
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
        if (p.nickname) {
            const stats = p.serialize().stats;
            stats.x = p.pos.x; stats.y = p.pos.y; 
            guestDataDB[p.nickname] = stats;
        }
        saveProgress(true); delete remotePlayers[peerId];
    }
});

window.addEventListener('netData', e => {
    const d = e.detail;
    if (d.type === 'TIME_SYNC') { worldState.worldTime = d.time; }
    if (d.type === 'WHISPER') chat.addMessage('WHISPER', d.fromNick, d.text);
    if (d.type === 'CHAT_MSG') chat.addMessage('GLOBAL', d.nick, d.text);
    if (d.type === 'PARTY_MSG') chat.addMessage('PARTY', d.fromNick, d.text);
    if (d.type === 'POLLEN_BURST') particles.spawnPollen(d.x, d.y);
    if (d.type === 'SHOOT') projectiles.push(new Projectile(d.x, d.y, d.vx, d.vy, d.ownerId, d.damage));
    if (d.type === 'SPAWN_ENEMY') enemies.push(new Ant(d.id, d.x, d.y, d.type));
    if (d.type === 'WAVE_SPAWN') activeWaves.push(new WaveEffect(d.x, d.y, d.radius, d.color || "rgba(241, 196, 15, ALPHA)", d.amount));
    if (d.type === 'PARTY_INVITE') {
        pendingInviteFrom = d.fromId; pendingInviteData = d;
        document.getElementById('invite-msg').innerText = `${d.fromNick} convidou você!`;
        document.getElementById('invite-party-details').innerText = `Esquadrão: ${d.pIcon} ${d.pName}`;
        document.getElementById('party-invite-popup').style.display = 'block';
    }
    if (d.type === 'PARTY_ACCEPT') { 
        if (!partyMembers.includes(d.fromId)) partyMembers.push(d.fromId);
        localPartyName = d.pName; localPartyIcon = d.pIcon;
        chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou o convite.`); 
        chat.openPartyTab(localPartyName, localPartyIcon);
        if (partyMembers.length > 1) net.sendPayload({ type: 'PARTY_SYNC', members: partyMembers, pName: localPartyName, pIcon: localPartyIcon }, d.fromId);
    }
    if (d.type === 'PARTY_SYNC') {
        localPartyName = d.pName; localPartyIcon = d.pIcon;
        d.members.forEach(id => { if (!partyMembers.includes(id)) partyMembers.push(id); });
        chat.openPartyTab(localPartyName, localPartyIcon); ui.updateHUD(localPlayer);
    }
    if (d.type === 'PARTY_LEAVE') { 
        chat.addMessage('SYSTEM', null, `${remotePlayers[d.fromId]?.nickname || 'Um membro'} saiu do grupo.`); 
        partyMembers = partyMembers.filter(id => id !== d.fromId);
        if (partyMembers.length === 0) { chat.closePartyTab(); localPartyName = ""; localPartyIcon = ""; }
    }
    if (d.type === 'PARTY_RESCUE' && isFainted) {
        clearTimeout(faintTimeout); isFainted = false;
        localPlayer.hp = 25; localPlayer.pollen = Math.max(0, localPlayer.pollen - 10);
        invulnerabilityTimer = 180; document.getElementById('faint-screen').style.display = 'none';
        chat.addMessage('SYSTEM', null, `Reanimado por ${d.fromNick}! IMUNIDADE ATIVA.`); ui.updateHUD(localPlayer);
    }
    if (d.type === 'SPAWN_INFO') {
        if (!remotePlayers[d.id]) remotePlayers[d.id] = new Player(d.id, d.nick || "Guest");
        remotePlayers[d.id].pos = { x: d.x, y: d.y }; remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
        if (net.isHost && d.nick && guestDataDB[d.nick]) {
            const savedStats = guestDataDB[d.nick]; remotePlayers[d.id].deserialize({ stats: savedStats });
            net.sendPayload({ type: 'RESTORE_STATS', stats: savedStats }, d.id);
        }
    }
    if (d.type === 'RESTORE_STATS') {
        if (localPlayer) {
            localPlayer.deserialize({ stats: d.stats });
            if (d.stats.x !== undefined) { localPlayer.pos.x = d.stats.x; localPlayer.pos.y = d.stats.y; localPlayer.targetPos = { ...localPlayer.pos }; }
            ui.updateHUD(localPlayer); chat.addMessage('SYSTEM', null, "Progresso recuperado!");
        }
    }
    if (d.type === 'FLOWER_CURE') {
        if (localPlayer && d.ownerId === localPlayer.id) { localPlayer.tilesCured++; }
        if (remotePlayers[d.ownerId]) remotePlayers[d.ownerId].tilesCured++;
    }
    if(d.type === 'MOVE') {
        if (net.isHost && !net.authenticatedPeers.has(d.id)) return;
        if(!remotePlayers[d.id]) { remotePlayers[d.id] = new Player(d.id, d.nick || "Guest"); chat.addMessage('SYSTEM', null, `${d.nick || 'Alguém'} entrou.`); }
        remotePlayers[d.id].targetPos = { x: d.x, y: d.y }; remotePlayers[d.id].currentDir = d.dir;
        if (d.stats) remotePlayers[d.id].deserialize({ stats: d.stats });
    }
    if(d.type === 'TILE_CHANGE') changeTile(d.x, d.y, d.tileType, d.ownerId);
});

function startGame(seed, id, nick) {
    if (typeof input.hideJoystick === 'function') input.hideJoystick();
    let loader = document.getElementById('loading-screen');
    if (!loader) {
        loader = document.createElement('div'); loader.id = 'loading-screen';
        loader.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000 url('assets/loading.png') no-repeat center center; background-size: contain; z-index: 99999; display: block;";
        document.body.appendChild(loader);
    } else loader.style.display = 'block';
    document.getElementById('lobby-overlay').style.display = 'none';
    document.getElementById('rpg-hud').style.display = 'none';
    document.getElementById('chat-toggle-btn').style.display = 'none';
    canvas.style.display = 'none'; 
    world = new WorldGenerator(seed);
    localPlayer = new Player(id, nick, true);
    localPlayer.skillPoints = 0; localPlayer.skillTree = new SkillTree(localPlayer);
    const hives = world.getHiveLocations();
    if (net.isHost) {
        const saved = saveSystem.load();
        if (saved) { hiveRegistry = saved.hiveRegistry || {}; if (hiveRegistry[nick] === undefined) hiveRegistry[nick] = 0; }
        else hiveRegistry[nick] = 0;
    }
    let spawnIdx = hiveRegistry[nick] !== undefined ? hiveRegistry[nick] : (Math.abs(id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % (hives.length-1))+1;
    if (hives[spawnIdx]) { localPlayer.homeBase = { x: hives[spawnIdx].x, y: hives[spawnIdx].y }; localPlayer.pos = { x: hives[spawnIdx].x, y: hives[spawnIdx].y }; localPlayer.targetPos = { ...localPlayer.pos }; }
    if (net.isHost) {
        const saved = saveSystem.load();
        if (saved) {
            worldState.applyFullState(saved.world);
            if (saved.host) {
                localPlayer.deserialize({ stats: saved.host }); localPlayer.skillPoints = saved.host.skillPoints || 0;
                if (saved.host.unlockedSkills) localPlayer.skillTree.deserialize(saved.host.unlockedSkills);
                if (saved.host.x !== undefined) { localPlayer.pos.x = saved.host.x; localPlayer.pos.y = saved.host.y; localPlayer.targetPos = { ...localPlayer.pos }; }
            }
            guestDataDB = saved.guests || {};
        } else {
            worldState.worldTime = new Date('2074-02-09T06:00:00').getTime();
            if (hives[0]) { const fx = Math.round(hives[0].x + 2); const fy = Math.round(hives[0].y + 2); changeTile(fx, fy, 'GRAMA'); setTimeout(() => changeTile(fx, fy, 'FLOR'), 1000); }
        }
    }
    net.sendPayload({ type: 'SPAWN_INFO', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y });
    chat.addMessage('SYSTEM', null, `Abelha ${nick} pronta para o voo!`);
    const skillBtn = document.createElement('button');
    skillBtn.id = 'btn-skills'; skillBtn.innerText = '⚡'; 
    skillBtn.onclick = () => localPlayer.skillTree.toggle(); document.body.appendChild(skillBtn);
    
    ui.updateHUD(localPlayer); 
    resize(); requestAnimationFrame(loop); 
    setInterval(() => ui.updateRanking(guestDataDB, localPlayer, remotePlayers), 5000);

    setTimeout(() => {
        const l = document.getElementById('loading-screen');
        if (l) { l.style.opacity = '0'; l.style.transition = 'opacity 1s ease'; setTimeout(() => l.style.display = 'none', 1000); }
        document.getElementById('rpg-hud').style.display = 'block';
        document.getElementById('chat-toggle-btn').style.display = 'flex'; 
        canvas.style.display = 'block';
        if (input.isMobile && typeof input.showJoystick === 'function') input.showJoystick(); 
        resize(); 
    }, 15000);
}

function processShooting() {
    if (!localPlayer) return;
    const aim = input.getAim();
    if (aim.isFiring) {
        const proj = localPlayer.shootPollen(aim.x, aim.y);
        if (proj) {
            projectiles.push(new Projectile(proj.x, proj.y, proj.vx, proj.vy, proj.ownerId, proj.damage));
            net.sendPayload({ type: 'SHOOT', ownerId: proj.ownerId, x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy, damage: proj.damage });
        }
    }
}

function tryShoot() {
    const proj = localPlayer.shootPollen();
    if (proj) {
        projectiles.push(new Projectile(proj.x, proj.y, proj.vx, proj.vy, proj.ownerId, proj.damage));
        net.sendPayload({ type: 'SHOOT', ownerId: proj.ownerId, x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy, damage: proj.damage });
    }
}

// [REMOVIDO] startHostSimulation() (Substituído por hostSim.start)

function saveProgress(force = false) {
    if (!net.isHost || !localPlayer) return;
    const now = Date.now(); if (!force && (now - lastManualSaveTime < SAVE_COOLDOWN)) return;
    lastManualSaveTime = now;
    Object.values(remotePlayers).forEach(p => { if (p.nickname) { const stats = p.serialize().stats; stats.x = p.pos.x; stats.y = p.pos.y; guestDataDB[p.nickname] = stats; } });
    const hostStats = localPlayer.serialize().stats; hostStats.x = localPlayer.pos.x; hostStats.y = localPlayer.pos.y;
    hostStats.skillPoints = localPlayer.skillPoints; hostStats.unlockedSkills = localPlayer.skillTree.serialize();
    saveSystem.save({ seed: world.seed, world: worldState.getFullState(), host: hostStats, guests: guestDataDB, hiveRegistry: hiveRegistry });
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

function update() {
    if(!localPlayer || isFainted) return; 
    ui.updateEnvironment(worldState.worldTime);

    if (invulnerabilityTimer > 0) invulnerabilityTimer--;
    const gx = Math.round(localPlayer.pos.x), gy = Math.round(localPlayer.pos.y);
    if (gx !== lastGridX || gy !== lastGridY) { 
        lastGridX = gx; lastGridY = gy; 
        ui.updateCoords(gx, gy);
    }
    Object.values(remotePlayers).forEach(p => p.update({}));
    projectiles.forEach((p, idx) => { if (!p.update()) projectiles.splice(idx, 1); });
    enemies.forEach((ant, idx) => {
        const players = [localPlayer, ...Object.values(remotePlayers)]; ant.update(players, world, worldState);
        if (invulnerabilityTimer <= 0) {
            const dx = ant.x - localPlayer.pos.x; const dy = ant.y - localPlayer.pos.y; const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 0.6) { localPlayer.hp -= 5; localPlayer.pos.x -= dx * 0.5; localPlayer.pos.y -= dy * 0.5; ui.updateHUD(localPlayer); if (localPlayer.hp <= 0) processFaint(); }
        }
        projectiles.forEach((proj, pIdx) => { 
            if (Math.sqrt(Math.pow(proj.x - ant.x, 2) + Math.pow(proj.y - ant.y, 2)) < 0.5) { 
                ant.hp -= proj.damage; 
                projectiles.splice(pIdx, 1); 
                particles.spawnSmoke(ant.x, ant.y);
            } 
        });
        if (ant.hp <= 0) { enemies.splice(idx, 1); particles.spawnPollen(ant.x, ant.y); }
    });
    Object.values(remotePlayers).forEach(p => localPlayer.resolveCollision(p));
    activeWaves = activeWaves.filter(wave => {
        const stillAlive = wave.update();
        if (stillAlive && !wave.curedLocal) {
            const d = Math.sqrt(Math.pow(localPlayer.pos.x - wave.x, 2) + Math.pow(localPlayer.pos.y - wave.y, 2));
            if (Math.abs(d - wave.currentRadius) < 0.5) { wave.curedLocal = true; if (localPlayer.hp < localPlayer.maxHp) { localPlayer.applyHeal(wave.healAmount); ui.updateHUD(localPlayer); } }
        }
        return stillAlive;
    });
    const m = input.getMovement(); localPlayer.update(m); processShooting();
    const moving = m.x !== 0 || m.y !== 0;
    if(moving || Math.random() < 0.05) {
        const speedMod = invulnerabilityTimer > 0 ? 1.5 : 1.0; localPlayer.pos.x += m.x * localPlayer.speed * speedMod; localPlayer.pos.y += m.y * localPlayer.speed * speedMod;
        net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir, stats: { level: localPlayer.level, hp: localPlayer.hp, maxHp: localPlayer.maxHp, tilesCured: localPlayer.tilesCured } });
    }
    if (localPlayer.pollen > 0 && moving) { 
        particles.spawnPollen(localPlayer.pos.x, localPlayer.pos.y); 
        net.sendPayload({ type: 'POLLEN_BURST', x: localPlayer.pos.x, y: localPlayer.pos.y }); 
    }
    particles.update();
    
    let nearbyFaintedPartner = null;
    partyMembers.forEach(memberId => {
        if (memberId === localPlayer.id) return; const partner = remotePlayers[memberId];
        if (partner && partner.hp <= 0 && Math.sqrt(Math.pow(localPlayer.pos.x - partner.pos.x, 2) + Math.pow(localPlayer.pos.y - partner.pos.y, 2)) < 1.5) { nearbyFaintedPartner = { id: memberId, nickname: partner.nickname, obj: partner }; partner.showRescuePrompt = true; }
    });
    if (nearbyFaintedPartner) {
        currentRescueTarget = nearbyFaintedPartner; const canAfford = localPlayer.pollen >= RESCUE_POLLEN_COST;
        input.updateActionButton(true, canAfford ? "⛑️ RESGATAR (Segure)" : `FALTA PÓLEN (${localPlayer.pollen}/${RESCUE_POLLEN_COST})`, canAfford ? "#2ecc71" : "#e74c3c");
        if (input.isActionActive() && canAfford) { rescueTimer++; if (rescueTimer >= RESCUE_DURATION) { localPlayer.pollen -= RESCUE_POLLEN_COST; net.sendPayload({ type: 'PARTY_RESCUE', fromNick: localPlayer.nickname }, currentRescueTarget.id); chat.addMessage('SYSTEM', null, `Você salvou ${currentRescueTarget.nickname}!`); ui.updateHUD(localPlayer); rescueTimer = 0; } }
        else rescueTimer = Math.max(0, rescueTimer - 2);
    } else { currentRescueTarget = null; rescueTimer = 0; input.updateActionButton(false); }
    const tile = worldState.getModifiedTile(gx, gy) || world.getTileAt(gx, gy);
    if (!['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(tile) && invulnerabilityTimer <= 0) { if (++damageFrameCounter >= DAMAGE_RATE) { damageFrameCounter = 0; localPlayer.hp -= DAMAGE_AMOUNT; ui.updateHUD(localPlayer); if (localPlayer.hp <= 0) processFaint(); } }
    const hpRatio = localPlayer.hp / localPlayer.maxHp; const overlay = document.getElementById('suffocation-overlay'); if (overlay) overlay.style.opacity = hpRatio < 0.7 ? (0.7 - hpRatio) * 1.4 : 0;
    if (tile === 'FLOR' && localPlayer.pollen < localPlayer.maxPollen && ++collectionFrameCounter >= COLLECTION_RATE) { localPlayer.pollen++; collectionFrameCounter = 0; gainXp(XP_PER_POLLEN); if (localPlayer.pollen >= localPlayer.maxPollen) changeTile(gx, gy, 'FLOR_COOLDOWN', localPlayer.id); }
    if (tile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0 && moving && ++uiUpdateCounter >= CURE_ATTEMPT_RATE) { uiUpdateCounter = 0; localPlayer.pollen--; if (Math.random() < PLANT_SPAWN_CHANCE) { changeTile(gx, gy, 'GRAMA', localPlayer.id); localPlayer.tilesCured++; gainXp(XP_PER_CURE); saveProgress(); } ui.updateHUD(localPlayer); }
    camera = { x: localPlayer.pos.x, y: localPlayer.pos.y };
}

function performRespawn() {
    if (faintTimeout) clearTimeout(faintTimeout); localPlayer.respawn();
    if (localPlayer.homeBase) { localPlayer.pos = {...localPlayer.homeBase}; localPlayer.targetPos = {...localPlayer.pos}; }
    document.getElementById('faint-screen').style.display = 'none'; isFainted = false; invulnerabilityTimer = 180; ui.updateHUD(localPlayer);
    net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir });
}

document.getElementById('btn-immediate-respawn').onclick = (e) => { e.preventDefault(); if (isFainted) performRespawn(); };

function processFaint() {
    isFainted = true; document.getElementById('faint-screen').style.display = 'flex';
    if (partyMembers.length > 0) net.sendPayload({ type: 'PARTY_MSG', fromNick: 'SINAL', text: `ESTOU CAÍDO!` }, partyMembers);
    faintTimeout = setTimeout(() => { performRespawn(); }, 60000);
}

function gainXp(amount) {
    const old = localPlayer.level; localPlayer.xp += amount;
    if (localPlayer.xp >= localPlayer.maxXp) {
        localPlayer.xp -= localPlayer.maxXp; localPlayer.level++; localPlayer.skillPoints = (localPlayer.skillPoints || 0) + 1;
        localPlayer.maxXp = Math.floor(localPlayer.maxXp * 1.5); localPlayer.maxPollen += 10; localPlayer.hp = localPlayer.maxHp;
        chat.addMessage('SYSTEM', null, `Nível ${localPlayer.level}! (+1 Skill Point)`); ui.showError(`Nível ${localPlayer.level}! Pressione 'K' para Skills`);
    }
    if (localPlayer.level > old) saveProgress(true); ui.updateHUD(localPlayer);
}

function changeTile(x, y, newType, ownerId = null) {
    if(worldState.setTile(x, y, newType)) {
        if (net.isHost && newType === 'GRAMA') worldState.addGrowingPlant(x, y, ownerId);
        if (net.isHost && newType === 'FLOR_COOLDOWN') worldState.resetPlantTimer(x, y);
        net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType, ownerId: ownerId });
    }
}

// [REMOVIDO] updateUI() -> ui.updateHUD()

function draw() {
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, canvas.width, canvas.height); if(!world) return;
    const rTileSize = world.tileSize * zoomLevel; const cX = Math.floor(localPlayer.pos.x / world.chunkSize), cY = Math.floor(localPlayer.pos.y / world.chunkSize);
    const range = zoomLevel < 0.8 ? 2 : 1;
    for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x)*rTileSize + canvas.width/2, sY = (t.y - camera.y)*rTileSize + canvas.height/2;
            if(sX > -rTileSize && sX < canvas.width+rTileSize && sY > -rTileSize && sY < canvas.height+rTileSize) {
                const type = worldState.getModifiedTile(t.x, t.y) || t.type;
                if (type === 'TERRA_QUEIMADA' && Math.random() < 0.015) particles.spawnSmoke(t.x, t.y);
                ctx.fillStyle = (type === 'COLMEIA') ? '#f1c40f' : (['GRAMA','GRAMA_SAFE','BROTO','MUDA','FLOR', 'FLOR_COOLDOWN'].includes(type) ? '#2ecc71' : '#34495e');
                ctx.fillRect(sX, sY, rTileSize + 1, rTileSize + 1);
                if (type === 'BROTO') { ctx.fillStyle = '#006400'; const sz = 12*zoomLevel; ctx.fillRect(sX+(rTileSize-sz)/2, sY+(rTileSize-sz)/2, sz, sz); }
                else if (type === 'MUDA') { ctx.fillStyle = '#228B22'; const sz = 20*zoomLevel; ctx.fillRect(sX+(rTileSize-sz)/2, sY+(rTileSize-sz)/2, sz, sz); }
                else if (['FLOR','FLOR_COOLDOWN'].includes(type) && assets.flower.complete) {
                    if (type === 'FLOR_COOLDOWN') ctx.globalAlpha = 0.4;
                    const by = rTileSize * 0.65; ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(sX+rTileSize/2, sY+by, 8*zoomLevel, 3*zoomLevel, 0, 0, Math.PI*2); ctx.fill();
                    ctx.save(); ctx.translate(sX+rTileSize/2, sY+by); ctx.rotate(Math.sin(Date.now()/800 + t.x*0.5)*0.1); ctx.drawImage(assets.flower, -rTileSize/2, -rTileSize, rTileSize, rTileSize); ctx.restore(); ctx.globalAlpha = 1.0;
                }
            }
        });
    }
    activeWaves.forEach(wave => wave.draw(ctx, camera, canvas, rTileSize)); 
    enemies.forEach(ant => ant.draw(ctx, camera, canvas, rTileSize)); 
    projectiles.forEach(p => p.draw(ctx, camera, canvas, rTileSize));
    particles.draw(ctx, camera, canvas, rTileSize, zoomLevel);
    if (localPlayer) {
        Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize, remotePlayers, partyMembers, localPartyIcon, input.isMobile));
        localPlayer.draw(ctx, camera, canvas, rTileSize, remotePlayers, partyMembers, localPartyIcon, input.isMobile);
        if (currentRescueTarget && rescueTimer > 0) {
            const tPos = currentRescueTarget.obj.pos; const tScreenX = (tPos.x - camera.x) * rTileSize + canvas.width / 2; const tScreenY = (tPos.y - camera.y) * rTileSize + canvas.height / 2;
            ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4 * zoomLevel; ctx.beginPath(); ctx.arc(tScreenX, tScreenY, 30 * zoomLevel, -Math.PI/2, (-Math.PI/2) + (Math.PI*2 * (rescueTimer/RESCUE_DURATION))); ctx.stroke();
            ctx.fillStyle = "#ffffff"; ctx.font = `bold ${10 * zoomLevel}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("RESGATANDO...", tScreenX, tScreenY - (40 * zoomLevel));
        }
        if (invulnerabilityTimer > 0) {
            const pScreenX = canvas.width / 2, pScreenY = canvas.height / 2; ctx.strokeStyle = `rgba(46, 204, 113, ${invulnerabilityTimer/60})`; ctx.lineWidth = 2 * zoomLevel; ctx.beginPath(); ctx.arc(pScreenX, pScreenY, 20 * zoomLevel, 0, Math.PI*2); ctx.stroke();
        }
    }
    if (localPlayer && localPlayer.homeBase && Math.sqrt(Math.pow(localPlayer.homeBase.x-localPlayer.pos.x,2)+Math.pow(localPlayer.homeBase.y-localPlayer.pos.y,2)) > 30) {
        const angle = Math.atan2(localPlayer.homeBase.y-localPlayer.pos.y, localPlayer.homeBase.x-localPlayer.pos.x), orbit = 60*zoomLevel;
        const ax = canvas.width/2 + Math.cos(angle)*orbit, ay = canvas.height/2 + Math.sin(angle)*orbit;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(angle); ctx.fillStyle = "#f1c40f"; ctx.strokeStyle = "black"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-10*zoomLevel, -5*zoomLevel); ctx.lineTo(-10*zoomLevel, 5*zoomLevel); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
window.addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && localPlayer?.skillTree) localPlayer.skillTree.toggle();
    if ((e.key === ' ' || e.code === 'Space') && localPlayer) tryShoot();
});
