import { NetworkManager } from './core/network.js';
import { WorldState } from './world/worldState.js';
import { InputHandler } from './core/input.js';
import { SaveSystem } from './core/saveSystem.js';
import { ChatSystem } from './core/chatSystem.js';
import { UIManager } from './managers/UIManager.js';
import { GameManager } from './managers/GameManager.js';

// Instanciação
const net = new NetworkManager();
const input = new InputHandler(); 
const worldState = new WorldState();
const saveSystem = new SaveSystem();
const chat = new ChatSystem();
const ui = new UIManager();

// Injeção de Dependências
const gameManager = new GameManager(net, input, worldState, saveSystem, chat, ui);

// Configuração de Input/Chat
chat.onChatOpen = () => input.setChatMode(true);
chat.onChatClose = () => input.setChatMode(false);

// --- HANDLERS DOS BOTÕES DO HTML ---

// Hospedar
document.getElementById('btn-create').onclick = () => {
    if (window.requestGameFullscreen) window.requestGameFullscreen();

    const nick = document.getElementById('host-nickname').value.trim() || "Host";
    const id = document.getElementById('create-id').value.trim();
    const pass = document.getElementById('create-pass').value.trim();
    const seed = document.getElementById('world-seed').value.trim() || Date.now().toString();
    
    if(!id) return alert("ID obrigatório");

    localStorage.setItem('wings_nick', nick);
    ui.displayStatus(`Iniciando Host...`);
    
    net.init(id, (ok, errorType) => {
        if(ok) {
            net.hostRoom(id, pass, seed, 
                () => worldState.getFullState(), 
                (guestNick) => gameManager.guestDataDB[guestNick],
                () => gameManager.guestDataDB 
            );
            gameManager.startGame(seed, id, nick, true);
        } else { 
            ui.displayStatus(`Erro: ${errorType}`);
        }
    });
};

// Entrar
document.getElementById('btn-join').onclick = () => {
    if (window.requestGameFullscreen) window.requestGameFullscreen();

    const nick = document.getElementById('join-nickname').value.trim() || "Guest";
    const id = document.getElementById('join-id').value.trim();
    const pass = document.getElementById('join-pass').value.trim();
    
    if(!id) return alert("ID do Host obrigatório");

    localStorage.setItem('wings_nick', nick);
    ui.displayStatus(`Conectando a ${id}...`);

    net.init(null, (ok, err) => { 
        if(ok) {
            net.joinRoom(id, pass, nick); 
        } else {
            ui.displayStatus(`Erro: ${err}`);
        }
    });
};

// Handlers do Modal de Jogador (Delegados para GameManager/Net)
document.getElementById('btn-party-action').onclick = () => {
    const targetId = gameManager.selectedPlayerId;
    if (!targetId) return;

    if (gameManager.currentPartyPartner === targetId) {
        net.sendPayload({ type: 'PARTY_LEAVE', fromId: gameManager.localPlayer.id }, targetId);
        chat.addMessage('SYSTEM', null, `Party desfeita.`);
        gameManager.currentPartyPartner = null;
        chat.closePartyTab();
    } else {
        net.sendPayload({ type: 'PARTY_INVITE', fromId: gameManager.localPlayer.id, fromNick: gameManager.localPlayer.nickname }, targetId);
        chat.addMessage('SYSTEM', null, `Convite enviado.`);
    }
    ui.closePlayerModal();
};

document.getElementById('btn-accept-invite').onclick = () => {
    if (gameManager.pendingInviteFrom) {
        gameManager.currentPartyPartner = gameManager.pendingInviteFrom;
        net.sendPayload({ type: 'PARTY_ACCEPT', fromId: gameManager.localPlayer.id, fromNick: gameManager.localPlayer.nickname }, gameManager.pendingInviteFrom);
        chat.addMessage('SYSTEM', null, `Você entrou na party.`);
        chat.openPartyTab();
        ui.closePartyInvite();
        gameManager.pendingInviteFrom = null;
    }
};

document.getElementById('btn-whisper-action').onclick = () => {
    if (gameManager.selectedPlayerId) {
        const p = gameManager.remotePlayers[gameManager.selectedPlayerId];
        if(p) chat.openPrivateTab(p.nickname);
    }
    ui.closePlayerModal();
};
