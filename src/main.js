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

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const net = new NetworkManager();
const input = new InputHandler(); 
// [CORREÇÃO] Força o joystick a começar oculto caso o InputHandler o mostre por padrão
if (input.isMobile && typeof input.hideJoystick === 'function') {
    input.hideJoystick();
}

const worldState = new WorldState();
const saveSystem = new SaveSystem();
const chat = new ChatSystem();

let world, localPlayer;
let remotePlayers = {};
let pollenParticles = [];
let smokeParticles = []; 
let camera = { x: 0, y: 0 };

// Listas de Entidades Dinâmicas
let enemies = [];
let projectiles = [];

// Sistema de Ondas
let activeWaves = [];

class WaveEffect {
    constructor(x, y, maxRadius, color, healAmount) {
        this.x = x;
        this.y = y;
        this.currentRadius = 0;
        this.maxRadius = maxRadius;
        this.color = color;
        this.healAmount = healAmount;
        this.speed = 0.1; 
        this.life = 1.0;
        this.curedLocal = false; 
    }

    update() {
        this.currentRadius += this.speed;
        this.life = 1.0 - (this.currentRadius / this.maxRadius);
        return this.life > 0;
    }

    draw(ctx, cam, canvas, tileSize) {
        const sX = (this.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.y - cam.y) * tileSize + canvas.height / 2;
        const r = this.currentRadius * tileSize;

        if (this.life <= 0) return;

        ctx.save();
        ctx.beginPath();
        ctx.arc(sX, sY, r, 0, Math.PI * 2);
        ctx.lineWidth = 4 * (tileSize / 32);
        ctx.strokeStyle = this.color.replace('ALPHA', this.life);
        ctx.stroke();
        
        ctx.globalAlpha = this.life * 0.2;
        ctx.fillStyle = this.color.replace('ALPHA', this.life);
        ctx.fill();
        ctx.restore();
    }
}

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

let zoomLevel = 1.5; 
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

const PLANT_SPAWN_CHANCE = 0.01; 
const CURE_ATTEMPT_RATE = 20;    
const FLOWER_COOLDOWN_TIME = 10000;
const COLLECTION_RATE = 5; 

const DAMAGE_RATE = 2; 
const DAMAGE_AMOUNT = 0.2; 
const XP_PER_CURE = 15;    
const XP_PER_POLLEN = 0.2;
const XP_PASSIVE_CURE = 5; 

const GROWTH_TIMES = { BROTO: 5000, MUDA: 10000, FLOR: 15000 };
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

let collectionFrameCounter = 0;
let damageFrameCounter = 0;
let uiUpdateCounter = 0; 

let isFainted = false;
let faintTimeout = null; 

// Variáveis de Resgate
let rescueTimer = 0;
let currentRescueTarget = null;
const RESCUE_DURATION = 180; 
const RESCUE_POLLEN_COST = 20;

let invulnerabilityTimer = 0; 

let lastManualSaveTime = 0;
const SAVE_COOLDOWN = 15000; 

// Contador para disparo da onda da colmeia no Host
let hiveWaveTick = 0;
let enemySpawnTick = 0; 

const assets = { flower: new Image() };
assets.flower.src = 'assets/Flower.png';

function injectGameStyles() {
    if (document.getElementById('wings-game-styles')) return;
    const style = document.createElement('style');
    style.id = 'wings-game-styles';
    style.innerHTML = `
        :root {
            --primary: #FFD700;
            --accent-green: #2ecc71;
            --danger: #e74c3c;
            --dark-bg: rgba(0, 0, 0, 0.6);
            --glass: rgba(255, 255, 255, 0.15);
        }

        /* --- ESTILOS DO LOBBY INJETADOS --- */
        #lobby-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            z-index: 10000;
            
            /* Imagem de Fundo */
            background-image: url('assets/background_lobby.png');
            background-position: center 30%; 
            background-repeat: no-repeat;
            background-size: cover;
            
            /* Layout */
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding-bottom: 0;
        }

        /* Overlay escuro */
        #lobby-overlay::before {
            content: "";
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.8) 100%);
            z-index: -1;
            pointer-events: none;
        }

        /* --- ATUALIZAÇÃO: ESTILOS PARA MODAIS E MENUS --- */
        
        /* Container dos Botões Principais */
        .main-menu-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            width: 90%;
            max-width: 350px;
        }

        .main-menu-btn {
            padding: 25px;
            font-size: 18px;
            font-weight: 900;
            text-transform: uppercase;
            color: #2c1e0f;
            background: linear-gradient(to bottom, #FFD700, #F39C12);
            border: 3px solid #fff;
            border-radius: 25px;
            cursor: pointer;
            box-shadow: 0 8px 0 #c77d00, 0 15px 25px rgba(0,0,0,0.4);
            font-family: 'Nunito', sans-serif;
            text-shadow: 1px 1px 0 rgba(255,255,255,0.4);
        }

        /* Modal Genérico (Substitui o antigo card) */
        .lobby-modal {
            background: rgba(15, 15, 15, 0.9) !important;
            border: 2px solid var(--primary);
            backdrop-filter: blur(15px);
            border-radius: 25px;
            box-shadow: 0 30px 80px rgba(0,0,0,0.8), inset 0 0 30px rgba(255, 215, 0, 0.1);
            width: 90%; max-width: 400px; 
            
            /* CORREÇÃO PARA MOBILE HORIZONTAL */
            max-height: 85vh;
            overflow-y: auto;
            
            padding: 25px;
            color: white;
            display: none; /* Controlado pelo HTML/JS */
        }
        
        .lobby-modal.active { display: block; }

        .lobby-modal input {
            background: rgba(0,0,0,0.4) !important;
            border: 1px solid rgba(255,255,255,0.15) !important;
            color: white !important;
            border-radius: 12px;
            padding: 15px;
        }
        .lobby-modal input:focus {
            background: rgba(0,0,0,0.6) !important;
            border-color: var(--primary) !important;
        }

        .lobby-modal button.btn-action {
            background: var(--primary) !important;
            color: #2c1e0f !important;
            font-weight: 900;
            text-transform: uppercase;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            padding: 18px;
            border-radius: 18px;
        }

        /* --- HUD E GAMEPLAY --- */
        #hud-time {
            display: block !important;
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            padding: 8px 20px;
            border-radius: 20px;
            color: var(--primary);
            font-weight: 900;
            font-size: 14px;
            letter-spacing: 1px;
            z-index: 8000;
            border: 1px solid rgba(255, 215, 0, 0.3);
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            white-space: nowrap;
            pointer-events: none;
        }

        #rpg-hud {
            position: fixed;
            top: 10px;
            left: 10px;
            width: auto;
            max-width: 250px;
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
            display: flex;
            flex-direction: column;
            gap: 5px;
            font-family: 'Segoe UI', sans-serif;
            pointer-events: none; 
            z-index: 5000;
        }

        #hud-info {
            background: var(--dark-bg);
            backdrop-filter: blur(5px);
            padding: 5px 12px;
            border-radius: 15px;
            color: white;
            font-weight: bold;
            display: inline-block;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            margin-bottom: 2px;
            border-left: 3px solid var(--primary);
            font-size: 12px;
        }

        .hud-stat-row {
            display: flex;
            align-items: center;
            gap: 5px;
            background: rgba(0,0,0,0.5);
            padding: 3px 6px;
            border-radius: 8px;
            width: 180px; 
        }
        
        .hud-icon { width: 18px; text-align: center; font-size: 12px; }
        
        .hud-bar-bg {
            flex: 1;
            height: 6px;
            background: rgba(255,255,255,0.2);
            border-radius: 3px;
            overflow: hidden;
            position: relative;
        }

        .hud-bar-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.3s ease-out;
            box-shadow: 0 0 5px currentColor;
        }
        
        .hud-text {
            font-size: 9px;
            color: #eee;
            width: 40px;
            text-align: right;
            font-family: monospace;
        }

        #chat-toggle-btn {
            display: flex !important;
            justify-content: center;
            align-items: center;
            position: fixed;
            bottom: 160px; 
            right: 20px; 
            width: 55px;
            height: 55px;
            background: var(--primary) !important;
            border: 3px solid white !important;
            border-radius: 50% !important;
            box-shadow: 0 5px 15px rgba(0,0,0,0.4) !important;
            z-index: 9999 !important; 
            font-size: 24px;
            cursor: pointer;
            opacity: 1 !important;
            visibility: visible !important;
            transition: transform 0.2s;
        }
        #chat-toggle-btn:active { transform: scale(0.9); }

        #btn-skills {
            display: flex !important;
            justify-content: center;
            align-items: center;
            position: fixed;
            top: 150px; 
            left: 10px;
            width: 45px;
            height: 45px;
            background: #8e44ad !important;
            border: 2px solid white !important;
            border-radius: 50% !important;
            box-shadow: 0 5px 15px rgba(0,0,0,0.4) !important;
            z-index: 9000 !important;
            font-size: 20px;
            color: white;
            cursor: pointer;
            transition: transform 0.2s;
        }
        #btn-skills:active { transform: scale(0.9); }

        #toast-msg {
            background: linear-gradient(135deg, #FFD700, #F39C12) !important;
            color: #333 !important;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3) !important;
            border: 2px solid white !important;
        }

        @media (max-width: 600px) {
            #rpg-hud { top: 5px; left: 5px; transform: scale(0.9); transform-origin: top left; }
            #ranking-container { top: 50px; right: 5px; transform: scale(0.8); transform-origin: top right; }
            #hud-time { top: 40px; font-size: 11px; padding: 4px 10px; } 
            #btn-skills { top: 120px; left: 5px; width: 40px; height: 40px; }
            
            /* Ajuste de background para telas verticais (Mobile) */
            #lobby-overlay {
                background-position: 50% 20%; /* Foca no logo/céu no mobile */
            }
        }
    `;
    document.head.appendChild(style);
}

function logDebug(msg, color = "#00ff00") {
    console.log(`%c[Wings] ${msg}`, `color: ${color}`);
}

function showError(msg) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        toast.style.cssText = "position: fixed; top: 10%; left: 50%; transform: translateX(-50%); background: rgba(231, 76, 60, 0.95); color: white; padding: 15px 25px; border-radius: 50px; font-weight: 900; z-index: 9999; box-shadow: 0 5px 20px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; pointer-events: none;";
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = "1";
    
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.style.opacity = "0";
    }, 3000);
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
    if(!id) return showError("ID da Colmeia é obrigatório!");
    localStorage.setItem('wings_nick', nick);
    net.init(null, (ok, err) => { if(ok) net.joinRoom(id, pass, nick); else showError("Falha ao iniciar motor de rede."); });
};

document.getElementById('btn-create').onpointerdown = (e) => {
    e.preventDefault();
    if (window.requestGameFullscreen) { try { window.requestGameFullscreen(); } catch(err) {} }
    const nick = document.getElementById('host-nickname').value.trim() || "Host";
    const id = document.getElementById('create-id').value.trim();
    const pass = document.getElementById('create-pass').value.trim();
    const seed = document.getElementById('world-seed').value.trim() || Date.now().toString();
    if(!id) return showError("Crie um ID para a Colmeia!");
    localStorage.setItem('wings_nick', nick);
    net.init(id, (ok, errorType) => {
        if(ok) {
            net.hostRoom(id, pass, seed, () => worldState.getFullState(), (guestNick) => guestDataDB[guestNick], () => guestDataDB);
            startGame(seed, id, nick);
            if(net.isHost) startHostSimulation();
        } else { 
            let msg = "Erro ao criar sala."; if (errorType === 'unavailable-id') msg = "Este ID de Colmeia já existe!"; showError(msg);
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
            net.sendPayload({ 
                type: 'PARTY_INVITE', 
                fromId: localPlayer.id, 
                fromNick: localPlayer.nickname,
                pName: localPartyName,
                pIcon: localPartyIcon
            }, selectedPlayerId);
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
        net.sendPayload({ 
            type: 'PARTY_INVITE', 
            fromId: localPlayer.id, 
            fromNick: localPlayer.nickname, 
            pName: localPartyName, 
            pIcon: localPartyIcon
        }, selectedPlayerId);
        
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

        net.sendPayload({ 
            type: 'PARTY_ACCEPT', 
            fromId: localPlayer.id, 
            fromNick: localPlayer.nickname, 
            pName: localPartyName, 
            pIcon: localPartyIcon
        }, pendingInviteFrom);

        chat.addMessage('SYSTEM', null, `Você entrou no grupo ${localPartyIcon} ${localPartyName}.`);
        chat.openPartyTab(localPartyName, localPartyIcon);
        document.getElementById('party-invite-popup').style.display = 'none';
        
        pendingInviteFrom = null;
        pendingInviteData = null;
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
        if (p.nickname) {
            const stats = p.serialize().stats;
            stats.x = p.pos.x; 
            stats.y = p.pos.y; 
            guestDataDB[p.nickname] = stats;
        }
        saveProgress(true); 
        delete remotePlayers[peerId];
    }
});

window.addEventListener('netData', e => {
    const d = e.detail;
    if (d.type === 'TIME_SYNC') { worldState.worldTime = d.time; }
    if (d.type === 'WHISPER') chat.addMessage('WHISPER', d.fromNick, d.text);
    if (d.type === 'CHAT_MSG') chat.addMessage('GLOBAL', d.nick, d.text);
    if (d.type === 'PARTY_MSG') chat.addMessage('PARTY', d.fromNick, d.text);

    if (d.type === 'POLLEN_BURST') {
        spawnPollenParticle(d.x, d.y);
    }
    
    if (d.type === 'SHOOT') {
        projectiles.push(new Projectile(d.x, d.y, d.vx, d.vy, d.ownerId, d.damage));
    }

    if (d.type === 'SPAWN_ENEMY') {
        const ant = new Ant(d.id, d.x, d.y, d.type);
        enemies.push(ant);
    }
    
    if (d.type === 'WAVE_SPAWN') {
        activeWaves.push(new WaveEffect(d.x, d.y, d.radius, d.color || "rgba(241, 196, 15, ALPHA)", d.amount));
    }

    if (d.type === 'PARTY_INVITE') {
        pendingInviteFrom = d.fromId;
        pendingInviteData = d;
        document.getElementById('invite-msg').innerText = `${d.fromNick} convidou você!`;
        document.getElementById('invite-party-details').innerText = `Esquadrão: ${d.pIcon} ${d.pName}`;
        document.getElementById('party-invite-popup').style.display = 'block';
    }
    
    if (d.type === 'PARTY_ACCEPT') { 
        if (!partyMembers.includes(d.fromId)) partyMembers.push(d.fromId);
        
        localPartyName = d.pName;
        localPartyIcon = d.pIcon;

        chat.addMessage('SYSTEM', null, `${d.fromNick} aceitou o convite.`); 
        chat.openPartyTab(localPartyName, localPartyIcon);
        
        if (partyMembers.length > 1) {
             net.sendPayload({ 
                 type: 'PARTY_SYNC', 
                 members: partyMembers,
                 pName: localPartyName,
                 pIcon: localPartyIcon
             }, d.fromId);
        }
    }
    
    if (d.type === 'PARTY_SYNC') {
        localPartyName = d.pName;
        localPartyIcon = d.pIcon;
        d.members.forEach(id => {
            if (!partyMembers.includes(id)) partyMembers.push(id);
        });
        chat.openPartyTab(localPartyName, localPartyIcon);
        updateUI();
    }
    
    if (d.type === 'PARTY_LEAVE') { 
        chat.addMessage('SYSTEM', null, `${remotePlayers[d.fromId]?.nickname || 'Um membro'} saiu do grupo.`); 
        partyMembers = partyMembers.filter(id => id !== d.fromId);
        if (partyMembers.length === 0) {
            chat.closePartyTab();
            localPartyName = "";
            localPartyIcon = "";
        }
    }
    
    if (d.type === 'PARTY_RESCUE' && isFainted) {
        clearTimeout(faintTimeout);
        isFainted = false;
        
        localPlayer.hp = 25; 
        localPlayer.pollen = Math.max(0, localPlayer.pollen - 10); 
        
        invulnerabilityTimer = 180; 
        
        document.getElementById('faint-screen').style.display = 'none';
        chat.addMessage('SYSTEM', null, `Reanimado por ${d.fromNick}! IMUNIDADE ATIVA.`);
        
        updateUI();
    }

    if (d.type === 'SPAWN_INFO') {
        if (!remotePlayers[d.id]) remotePlayers[d.id] = new Player(d.id, d.nick || "Guest");
        remotePlayers[d.id].pos = { x: d.x, y: d.y };
        remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
        
        if (net.isHost && d.nick && guestDataDB[d.nick]) {
            const savedStats = guestDataDB[d.nick];
            remotePlayers[d.id].deserialize({ stats: savedStats });
            net.sendPayload({ type: 'RESTORE_STATS', stats: savedStats }, d.id);
        }
    }

    if (d.type === 'RESTORE_STATS') {
        if (localPlayer) {
            localPlayer.deserialize({ stats: d.stats });
            if (d.stats.x !== undefined) {
                localPlayer.pos.x = d.stats.x;
                localPlayer.pos.y = d.stats.y;
                localPlayer.targetPos = { ...localPlayer.pos };
            }
            updateUI();
            chat.addMessage('SYSTEM', null, "Progresso recuperado!");
        }
    }

    if (d.type === 'FLOWER_CURE') {
        if (localPlayer && d.ownerId === localPlayer.id) { localPlayer.tilesCured++; }
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
    
    const rankingList = document.getElementById('ranking-list');
    if (rankingList) {
        if (rankingData.length === 0) {
            rankingList.innerHTML = '<div class="rank-item" style="justify-content:center; color:#555">Nenhum dado</div>';
        } else {
            const top3 = rankingData.slice(0, 3);
            rankingList.innerHTML = top3.map((player, index) => {
                const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : '🥉');
                const isMe = localPlayer && player.nick === localPlayer.nickname ? 'color:white; font-weight:bold' : '';
                return `<div class="rank-item" style="${isMe}">
                            <span>${medal} ${player.nick}</span>
                            <b>${player.score}</b>
                        </div>`;
            }).join('');
        }
    }

    const fullList = document.getElementById('ranking-full-list');
    if (fullList) {
        fullList.innerHTML = rankingData.map((player, index) => {
            const pos = index + 1;
            const isMe = localPlayer && player.nick === localPlayer.nickname ? 'background:rgba(241,196,15,0.1);' : '';
            return `<div class="rank-item" style="padding:10px; border-bottom:1px solid #222; ${isMe}">
                        <span>${pos}º ${player.nick}</span>
                        <b style="color:var(--accent-green)">${player.score} Curas</b>
                    </div>`;
        }).join('');
    }
}

function startGame(seed, id, nick) {
    injectGameStyles();
    
    // [CORREÇÃO] Garante que joystick não apareça no loading screen
    if (typeof input.hideJoystick === 'function') input.hideJoystick();

    let loader = document.getElementById('loading-screen');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'loading-screen';
        loader.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000 url('assets/loading.png') no-repeat center center; background-size: contain; z-index: 99999; display: block;";
        document.body.appendChild(loader);
    } else {
        loader.style.display = 'block';
    }

    document.getElementById('lobby-overlay').style.display = 'none';
    
    document.getElementById('rpg-hud').style.display = 'none';
    document.getElementById('chat-toggle-btn').style.display = 'none';
    canvas.style.display = 'none'; 
    
    world = new WorldGenerator(seed);
    localPlayer = new Player(id, nick, true);

    localPlayer.skillPoints = 0;
    localPlayer.skillTree = new SkillTree(localPlayer);

    const hives = world.getHiveLocations();

    if (net.isHost) {
        const saved = saveSystem.load();
        if (saved) {
            hiveRegistry = saved.hiveRegistry || {};
            if (hiveRegistry[nick] === undefined) hiveRegistry[nick] = 0;
        } else {
            hiveRegistry[nick] = 0;
        }
    }

    let spawnIdx = hiveRegistry[nick] !== undefined ? hiveRegistry[nick] : (Math.abs(id.split('').reduce((a,b)=>a+b.charCodeAt(0),0)) % (hives.length-1))+1;

    if (hives[spawnIdx]) {
        localPlayer.homeBase = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
        localPlayer.pos = { x: hives[spawnIdx].x, y: hives[spawnIdx].y };
        localPlayer.targetPos = { ...localPlayer.pos };
    }

    if (net.isHost) {
        const saved = saveSystem.load();
        if (saved) {
            worldState.applyFullState(saved.world);
            if (saved.host) {
                localPlayer.deserialize({ stats: saved.host });
                localPlayer.skillPoints = saved.host.skillPoints || 0;
                if (saved.host.unlockedSkills) {
                    localPlayer.skillTree.deserialize(saved.host.unlockedSkills);
                }

                if (saved.host.x !== undefined) {
                    localPlayer.pos.x = saved.host.x;
                    localPlayer.pos.y = saved.host.y;
                    localPlayer.targetPos = { ...localPlayer.pos };
                }
            }
            guestDataDB = saved.guests || {};
        } else {
            worldState.worldTime = new Date('2074-02-09T06:00:00').getTime();
            if (hives[0]) {
                const fx = Math.round(hives[0].x + 2);
                const fy = Math.round(hives[0].y + 2);
                changeTile(fx, fy, 'GRAMA');
                setTimeout(() => changeTile(fx, fy, 'FLOR'), 1000);
            }
        }
    }
    
    net.sendPayload({ 
        type: 'SPAWN_INFO', 
        id: localPlayer.id, 
        nick: localPlayer.nickname, 
        x: localPlayer.pos.x, 
        y: localPlayer.pos.y 
    });

    chat.addMessage('SYSTEM', null, `Abelha ${nick} pronta para o voo!`);
    
    const skillBtn = document.createElement('button');
    skillBtn.id = 'btn-skills';
    skillBtn.innerText = '⚡'; 
    skillBtn.onclick = () => localPlayer.skillTree.toggle();
    document.body.appendChild(skillBtn);

    updateUI(); 
    resize(); 
    requestAnimationFrame(loop);
    setInterval(updateRanking, 5000);

    setTimeout(() => {
        const l = document.getElementById('loading-screen');
        if (l) {
            l.style.opacity = '0';
            l.style.transition = 'opacity 1s ease';
            setTimeout(() => l.style.display = 'none', 1000);
        }
        
        document.getElementById('rpg-hud').style.display = 'block';
        const chatBtn = document.getElementById('chat-toggle-btn');
        chatBtn.style.display = 'flex'; 
        
        canvas.style.display = 'block';
        
        // [CORREÇÃO] Só mostra joystick se for mobile e após o loading
        if (input.isMobile && typeof input.showJoystick === 'function') {
            input.showJoystick(); 
        }
        
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
            net.sendPayload({ 
                type: 'SHOOT', 
                ownerId: proj.ownerId, 
                x: proj.x, y: proj.y, 
                vx: proj.vx, vy: proj.vy, 
                damage: proj.damage 
            });
        }
    }
}

function tryShoot() {
    const proj = localPlayer.shootPollen();
    if (proj) {
        projectiles.push(new Projectile(proj.x, proj.y, proj.vx, proj.vy, proj.ownerId, proj.damage));
        net.sendPayload({ 
            type: 'SHOOT', 
            ownerId: proj.ownerId, 
            x: proj.x, y: proj.y, 
            vx: proj.vx, vy: proj.vy, 
            damage: proj.damage 
        });
    }
}

function startHostSimulation() {
    setInterval(() => {
        worldState.worldTime += 60000;
        net.sendPayload({ type: 'TIME_SYNC', time: worldState.worldTime });
        let changed = false;
        const now = Date.now();
        
        hiveWaveTick++;
        if (hiveWaveTick >= 3) {
            hiveWaveTick = 0;
            const hives = world.getHiveLocations();
            hives.forEach(h => {
                net.sendPayload({
                    type: 'WAVE_SPAWN',
                    x: h.x, y: h.y,
                    radius: 4.0, color: "rgba(241, 196, 15, ALPHA)", amount: 5
                });
                activeWaves.push(new WaveEffect(h.x, h.y, 4.0, "rgba(241, 196, 15, ALPHA)", 5));
            });
        }

        enemySpawnTick++;
        if (enemySpawnTick >= 10) {
            enemySpawnTick = 0;
            const players = [localPlayer, ...Object.values(remotePlayers)];
            const target = players[Math.floor(Math.random() * players.length)];
            
            for(let i=0; i<5; i++) {
                let spawnX = target.pos.x + (Math.random() * 30 - 15);
                let spawnY = target.pos.y + (Math.random() * 30 - 15);
                const distToPlayer = Math.sqrt(Math.pow(spawnX - target.pos.x, 2) + Math.pow(spawnY - target.pos.y, 2));
                const tile = worldState.getModifiedTile(Math.round(spawnX), Math.round(spawnY)) || world.getTileAt(Math.round(spawnX), Math.round(spawnY));
                
                if (tile === 'TERRA_QUEIMADA' && distToPlayer > 10) {
                    const groupSize = 2 + Math.floor(Math.random() * 3);
                    for(let j=0; j < groupSize; j++) {
                        const enemyId = `ant_${Date.now()}_${j}`;
                        const ox = spawnX + (Math.random() * 2 - 1);
                        const oy = spawnY + (Math.random() * 2 - 1);
                        const ant = new Ant(enemyId, ox, oy, 'worker');
                        enemies.push(ant);
                        net.sendPayload({ type: 'SPAWN_ENEMY', id: enemyId, x: ox, y: oy, type: 'worker' });
                    }
                    break;
                }
            }
        }

        Object.values(remotePlayers).forEach(p => {
            if (p.nickname && hiveRegistry[p.nickname] === undefined) {
                const usedIndices = Object.values(hiveRegistry);
                for(let i=1; i<8; i++) {
                    if (!usedIndices.includes(i)) {
                        hiveRegistry[p.nickname] = i;
                        break;
                    }
                }
            }
        });

        for (const [key, plantData] of Object.entries(worldState.growingPlants)) {
            const startTime = plantData.time || plantData;
            const lastHeal = plantData.lastHealTime || startTime;
            const ownerId = plantData.owner || null;
            const [x, y] = key.split(',').map(Number);
            const elapsedSinceStart = now - startTime;
            const elapsedSinceHeal = now - lastHeal;
            const currentType = worldState.getModifiedTile(x, y);

            if (currentType === 'GRAMA' && elapsedSinceStart > GROWTH_TIMES.BROTO) { changeTile(x, y, 'BROTO', ownerId); changed = true; }
            else if (currentType === 'BROTO' && elapsedSinceStart > GROWTH_TIMES.MUDA) { changeTile(x, y, 'MUDA', ownerId); changed = true; }
            else if (currentType === 'MUDA' && elapsedSinceStart > GROWTH_TIMES.FLOR) { changeTile(x, y, 'FLOR', ownerId); changed = true; }
            else if (currentType === 'FLOR_COOLDOWN' && elapsedSinceStart > FLOWER_COOLDOWN_TIME) { changeTile(x, y, 'FLOR', ownerId); changed = true; }

            if (currentType === 'FLOR' && plantData.isReadyToHeal && elapsedSinceHeal >= 3000) {
                plantData.lastHealTime = now;
                net.sendPayload({ type: 'WAVE_SPAWN', x: x, y: y, radius: 2.0, color: "rgba(46, 204, 113, ALPHA)", amount: 2 });
                activeWaves.push(new WaveEffect(x, y, 2.0, "rgba(46, 204, 113, ALPHA)", 2));

                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue; 
                        const tx = x + dx;
                        const ty = y + dy;
                        const target = worldState.getModifiedTile(tx, ty) || world.getTileAt(tx, ty);
                        if (target === 'TERRA_QUEIMADA') {
                            changeTile(tx, ty, 'GRAMA_SAFE', ownerId);
                            if (ownerId) {
                                net.sendPayload({ type: 'FLOWER_CURE', ownerId: ownerId, x: tx, y: ty });
                                if (localPlayer && ownerId === localPlayer.id) {
                                    localPlayer.tilesCured++; gainXp(XP_PASSIVE_CURE);
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
            }
        }
        if (changed) saveProgress(); 
    }, 1000);
}

function saveProgress(force = false) {
    if (!net.isHost || !localPlayer) return;
    const now = Date.now();
    if (!force && (now - lastManualSaveTime < SAVE_COOLDOWN)) return;
    lastManualSaveTime = now;
    Object.values(remotePlayers).forEach(p => { 
        if (p.nickname) {
            const stats = p.serialize().stats;
            stats.x = p.pos.x; stats.y = p.pos.y; 
            guestDataDB[p.nickname] = stats; 
        }
    });
    const hostStats = localPlayer.serialize().stats;
    hostStats.x = localPlayer.pos.x; hostStats.y = localPlayer.pos.y;
    hostStats.skillPoints = localPlayer.skillPoints;
    hostStats.unlockedSkills = localPlayer.skillTree.serialize();
    saveSystem.save({ seed: world.seed, world: worldState.getFullState(), host: hostStats, guests: guestDataDB, hiveRegistry: hiveRegistry });
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

function updateEnvironment() {
    if (!worldState.worldTime) return;
    const date = new Date(worldState.worldTime);
    const day = String(date.getDate()).padStart(2, '0');
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const timeEl = document.getElementById('hud-time');
    if (timeEl) {
        timeEl.innerText = `${day} ${month} ${year} - ${hours}:${minutes}`;
        timeEl.style.display = 'block'; 
    }
    const h = date.getHours() + date.getMinutes() / 60;
    const darknessIntensity = (Math.cos(h / 24 * Math.PI * 2) + 1) / 2;
    const overlayOpacity = darknessIntensity * 0.85;
    const overlay = document.getElementById('day-night-overlay');
    if (overlay) overlay.style.opacity = overlayOpacity;
}

function update() {
    if(!localPlayer || isFainted) return; 
    updateEnvironment();
    if (invulnerabilityTimer > 0) invulnerabilityTimer--;
    const gx = Math.round(localPlayer.pos.x), gy = Math.round(localPlayer.pos.y);
    if (gx !== lastGridX || gy !== lastGridY) {
        lastGridX = gx; lastGridY = gy;
        const el = document.getElementById('hud-coords'); if(el) el.innerText = `${gx}, ${gy}`;
    }
    Object.values(remotePlayers).forEach(p => p.update({}));
    projectiles.forEach((p, idx) => {
        const alive = p.update();
        if (!alive) projectiles.splice(idx, 1);
    });
    enemies.forEach((ant, idx) => {
        const players = [localPlayer, ...Object.values(remotePlayers)];
        ant.update(players, world, worldState);
        if (invulnerabilityTimer <= 0) {
            const dx = ant.x - localPlayer.pos.x;
            const dy = ant.y - localPlayer.pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 0.6) {
                localPlayer.hp -= 5;
                localPlayer.pos.x -= dx * 0.5;
                localPlayer.pos.y -= dy * 0.5;
                updateUI();
                if (localPlayer.hp <= 0) processFaint();
            }
        }
        projectiles.forEach((proj, pIdx) => {
            const d = Math.sqrt(Math.pow(proj.x - ant.x, 2) + Math.pow(proj.y - ant.y, 2));
            if (d < 0.5) {
                ant.hp -= proj.damage;
                projectiles.splice(pIdx, 1);
                smokeParticles.push({ wx: ant.x, wy: ant.y, size: 3, speedY: -0.05, life: 0.5, grayVal: 255, isEmber: false });
            }
        });
        if (ant.hp <= 0) {
            enemies.splice(idx, 1);
            spawnPollenParticle(ant.x, ant.y);
        }
    });
    Object.values(remotePlayers).forEach(p => {
        localPlayer.resolveCollision(p);
    });
    activeWaves = activeWaves.filter(wave => {
        const stillAlive = wave.update();
        if (stillAlive && !wave.curedLocal) {
            const d = Math.sqrt(Math.pow(localPlayer.pos.x - wave.x, 2) + Math.pow(localPlayer.pos.y - wave.y, 2));
            if (Math.abs(d - wave.currentRadius) < 0.5) {
                wave.curedLocal = true;
                if (localPlayer.hp < localPlayer.maxHp) {
                    localPlayer.applyHeal(wave.healAmount);
                    updateUI();
                }
            }
        }
        return stillAlive;
    });
    const m = input.getMovement();
    localPlayer.update(m);
    processShooting();
    const moving = m.x !== 0 || m.y !== 0;
    if(moving || Math.random() < 0.05) {
        const speedMod = invulnerabilityTimer > 0 ? 1.5 : 1.0;
        localPlayer.pos.x += m.x * localPlayer.speed * speedMod; 
        localPlayer.pos.y += m.y * localPlayer.speed * speedMod;
        net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir, stats: { level: localPlayer.level, hp: localPlayer.hp, maxHp: localPlayer.maxHp, tilesCured: localPlayer.tilesCured } });
    }
    if (localPlayer.pollen > 0 && moving) {
        spawnPollenParticle(); 
        net.sendPayload({ type: 'POLLEN_BURST', x: localPlayer.pos.x, y: localPlayer.pos.y });
    }
    updateParticles();
    let nearbyFaintedPartner = null;
    partyMembers.forEach(memberId => {
        if (memberId === localPlayer.id) return;
        const partner = remotePlayers[memberId];
        if (partner && partner.hp <= 0) {
            const d = Math.sqrt(Math.pow(localPlayer.pos.x - partner.pos.x, 2) + Math.pow(localPlayer.pos.y - partner.pos.y, 2));
            if (d < 1.5) { 
                nearbyFaintedPartner = { id: memberId, nickname: partner.nickname, obj: partner };
                partner.showRescuePrompt = true; 
            }
        }
    });
    if (nearbyFaintedPartner) {
        currentRescueTarget = nearbyFaintedPartner;
        const canAfford = localPlayer.pollen >= RESCUE_POLLEN_COST;
        const btnText = canAfford ? "⛑️ RESGATAR (Segure)" : `FALTA PÓLEN (${localPlayer.pollen}/${RESCUE_POLLEN_COST})`;
        const btnColor = canAfford ? "#2ecc71" : "#e74c3c";
        input.updateActionButton(true, btnText, btnColor);
        if (input.isActionActive() && canAfford) {
            rescueTimer++;
            if (rescueTimer >= RESCUE_DURATION) {
                localPlayer.pollen -= RESCUE_POLLEN_COST;
                net.sendPayload({ type: 'PARTY_RESCUE', fromNick: localPlayer.nickname }, currentRescueTarget.id);
                chat.addMessage('SYSTEM', null, `Você salvou ${currentRescueTarget.nickname}!`);
                updateUI();
                rescueTimer = 0;
            }
        } else {
            rescueTimer = Math.max(0, rescueTimer - 2);
        }
    } else {
        currentRescueTarget = null;
        rescueTimer = 0;
        input.updateActionButton(false); 
    }
    const tile = worldState.getModifiedTile(gx, gy) || world.getTileAt(gx, gy);
    const isSafe = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(tile);
    if (!isSafe && invulnerabilityTimer <= 0) {
        damageFrameCounter++;
        if (damageFrameCounter >= DAMAGE_RATE) {
            damageFrameCounter = 0; localPlayer.hp -= DAMAGE_AMOUNT; updateUI();
            if (localPlayer.hp <= 0) processFaint();
        }
    } 
    const hpRatio = localPlayer.hp / localPlayer.maxHp;
    const overlay = document.getElementById('suffocation-overlay');
    if (overlay) overlay.style.opacity = hpRatio < 0.7 ? (0.7 - hpRatio) * 1.4 : 0;
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

function performRespawn() {
    if (faintTimeout) clearTimeout(faintTimeout);
    localPlayer.respawn();
    if (localPlayer.homeBase) { 
        localPlayer.pos = {...localPlayer.homeBase}; 
        localPlayer.targetPos = {...localPlayer.pos}; 
    }
    const faintScreen = document.getElementById('faint-screen');
    if(faintScreen) faintScreen.style.display = 'none';
    isFainted = false; invulnerabilityTimer = 180; updateUI();
    net.sendPayload({ type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir });
}

document.getElementById('btn-immediate-respawn').onclick = (e) => {
    e.preventDefault(); if (isFainted) performRespawn();
};

function processFaint() {
    isFainted = true;
    const faintScreen = document.getElementById('faint-screen');
    if(faintScreen) faintScreen.style.display = 'flex';
    if (partyMembers.length > 0) { 
        net.sendPayload({ type: 'PARTY_MSG', fromNick: 'SINAL', text: `ESTOU CAÍDO!` }, partyMembers); 
    }
    faintTimeout = setTimeout(() => { performRespawn(); }, 60000);
}

function gainXp(amount) {
    const old = localPlayer.level; localPlayer.xp += amount;
    if (localPlayer.xp >= localPlayer.maxXp) {
        localPlayer.xp -= localPlayer.maxXp; localPlayer.level++;
        localPlayer.skillPoints = (localPlayer.skillPoints || 0) + 1;
        localPlayer.maxXp = Math.floor(localPlayer.maxXp * 1.5); localPlayer.maxPollen += 10; localPlayer.hp = localPlayer.maxHp; 
        chat.addMessage('SYSTEM', null, `Nível ${localPlayer.level}! (+1 Skill Point)`);
        showError(`Nível ${localPlayer.level}! Pressione 'K' para Skills`);
    }
    if (localPlayer.level > old) saveProgress(true); updateUI();
}

function changeTile(x, y, newType, ownerId = null) {
    if(worldState.setTile(x, y, newType)) {
        if (net.isHost && newType === 'GRAMA') worldState.addGrowingPlant(x, y, ownerId);
        if (net.isHost && newType === 'FLOR_COOLDOWN') worldState.resetPlantTimer(x, y);
        net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType, ownerId: ownerId });
    }
}

function spawnPollenParticle(x = null, y = null) {
    const px = x !== null ? x : localPlayer.pos.x;
    const py = y !== null ? y : localPlayer.pos.y;
    pollenParticles.push({ wx: px + (Math.random()*0.4-0.2), wy: py + (Math.random()*0.4-0.2), size: Math.random()*3+2, speedY: Math.random()*0.02+0.01, life: 1.0 }); 
}

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
                ctx.fillRect(sX, sY, rTileSize + 1, rTileSize + 1);
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

    activeWaves.forEach(wave => wave.draw(ctx, camera, canvas, rTileSize));
    enemies.forEach(ant => ant.draw(ctx, camera, canvas, rTileSize));
    projectiles.forEach(p => p.draw(ctx, camera, canvas, rTileSize));

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
        Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize, remotePlayers, partyMembers, localPartyIcon, input.isMobile));
        localPlayer.draw(ctx, camera, canvas, rTileSize, remotePlayers, partyMembers, localPartyIcon, input.isMobile);
        
        if (currentRescueTarget && rescueTimer > 0) {
            const tPos = currentRescueTarget.obj.pos;
            const tScreenX = (tPos.x - camera.x) * rTileSize + canvas.width / 2;
            const tScreenY = (tPos.y - camera.y) * rTileSize + canvas.height / 2;
            
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4 * zoomLevel;
            ctx.beginPath();
            ctx.arc(tScreenX, tScreenY, 30 * zoomLevel, -Math.PI/2, (-Math.PI/2) + (Math.PI*2 * (rescueTimer/RESCUE_DURATION)));
            ctx.stroke();
            
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${10 * zoomLevel}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("RESGATANDO...", tScreenX, tScreenY - (40 * zoomLevel));
        }
        
        if (invulnerabilityTimer > 0) {
             const pScreenX = canvas.width / 2;
             const pScreenY = canvas.height / 2;
             ctx.strokeStyle = `rgba(46, 204, 113, ${invulnerabilityTimer/60})`;
             ctx.lineWidth = 2 * zoomLevel;
             ctx.beginPath();
             ctx.arc(pScreenX, pScreenY, 20 * zoomLevel, 0, Math.PI*2);
             ctx.stroke();
        }
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

window.addEventListener('keydown', (e) => {
    if (e.key === 'k' || e.key === 'K') {
        if (localPlayer && localPlayer.skillTree) {
            localPlayer.skillTree.toggle();
        }
    }
    if (e.key === ' ' || e.code === 'Space') {
        if (localPlayer) tryShoot();
    }
});
