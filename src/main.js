import { NetworkManager } from './core/network.js';
import { WorldState } from './world/worldState.js';
import { InputHandler } from './core/input.js';
import { SaveSystem } from './core/saveSystem.js';
import { ChatSystem } from './core/chatSystem.js';
import { UIManager } from './managers/UIManager.js';
import { GameManager } from './managers/GameManager.js';

// --- 1. INSTANCIAÇÃO DOS SISTEMAS ---
const net = new NetworkManager();
const input = new InputHandler(); 
const worldState = new WorldState();
const saveSystem = new SaveSystem();
const chat = new ChatSystem();
const ui = new UIManager();

// --- 2. INJEÇÃO DE DEPENDÊNCIAS ---
// O GameManager recebe todos os sistemas para coordenar o jogo
const gameManager = new GameManager(net, input, worldState, saveSystem, chat, ui);

// --- 3. CONFIGURAÇÕES GLOBAIS ---

// Trava o movimento do jogador quando o chat abre
chat.onChatOpen = () => input.setChatMode(true);
chat.onChatClose = () => input.setChatMode(false);

// Helper para atualizar mensagens de status no Lobby
function updateStatus(msg, isError = false) {
    const el = document.getElementById('status-msg');
    if (el) {
        el.style.color = isError ? 'var(--danger)' : 'var(--accent-green)';
        el.innerText = msg;
    }
    // Também joga no console de debug se existir
    if (window.logDebug) window.logDebug(msg, isError ? "#ff4d4d" : "#00ff00");
}

// --- 4. LÓGICA DOS BOTÕES DO LOBBY ---

// BOTÃO: INICIAR COLMEIA (HOSPEDAR)
const btnCreate = document.getElementById('btn-create');
if (btnCreate) {
    btnCreate.onclick = () => {
        // Tenta ativar tela cheia (melhor experiência no mobile)
        if (window.requestGameFullscreen) window.requestGameFullscreen();

        // Coleta dados dos inputs
        const nick = document.getElementById('host-nickname').value.trim() || "Host";
        const id = document.getElementById('create-id').value.trim();
        const pass = document.getElementById('create-pass').value.trim();
        const seed = document.getElementById('world-seed').value.trim() || "FLORESTA_ETERNAL";
        
        // Validação básica
        if(!id) {
            updateStatus("ERRO: É necessário criar um ID para a sala.", true);
            return;
        }

        updateStatus(`Criando colmeia ${id}...`);
        
        // Inicializa Rede como Host
        net.init(id, (ok, errorType) => {
            if(ok) {
                // Configura a sala e os callbacks de sincronização de dados
                net.hostRoom(id, pass, seed, 
                    () => worldState.getFullState(), // Envia o mundo para quem entra
                    (guestNick) => gameManager.guestDataDB[guestNick], // Envia dados salvos do guest
                    () => gameManager.guestDataDB // Sincroniza DB de guests
                );
                
                // Inicia o loop do jogo
                gameManager.startGame(seed, id, nick, true);
                updateStatus("Colmeia iniciada!");
            } else { 
                updateStatus(`Erro ao criar: ${errorType}`, true);
            }
        });
    };
}

// BOTÃO: VOAR PARA O MUNDO (ENTRAR)
const btnJoin = document.getElementById('btn-join');
if (btnJoin) {
    btnJoin.onclick = () => {
        if (window.requestGameFullscreen) window.requestGameFullscreen();

        const nick = document.getElementById('join-nickname').value.trim() || "Guest";
        const id = document.getElementById('join-id').value.trim();
        const pass = document.getElementById('join-pass').value.trim();
        
        if(!id) {
            updateStatus("ERRO: Digite o ID da colmeia alvo.", true);
            return;
        }

        updateStatus(`Procurando colmeia ${id}...`);

        // Inicializa Rede como Cliente (ID null = PeerJS gera automático)
        net.init(null, (ok, err) => { 
            if(ok) {
                // Tenta conectar ao Host
                net.joinRoom(id, pass, nick); 
            } else {
                updateStatus(`Erro de conexão: ${err}`, true);
            }
        });
    };
}

// --- 5. LÓGICA DOS MODAIS (INTERAÇÃO DE JOGADOR) ---

// Botão: Convidar/Sair da Party (No modal de clique no player)
const btnPartyAction = document.getElementById('btn-party-action');
if (btnPartyAction) {
    btnPartyAction.onclick = () => {
        const targetId = gameManager.selectedPlayerId;
        if (!targetId) return;

        if (gameManager.currentPartyPartner === targetId) {
            // Sair da Party
            net.sendPayload({ type: 'PARTY_LEAVE', fromId: gameManager.localPlayer.id }, targetId);
            chat.addMessage('SYSTEM', null, `Grupo desfeito.`);
            gameManager.currentPartyPartner = null;
            chat.closePartyTab();
        } else {
            // Convidar para Party
            net.sendPayload({ 
                type: 'PARTY_INVITE', 
                fromId: gameManager.localPlayer.id, 
                fromNick: gameManager.localPlayer.nickname 
            }, targetId);
            chat.addMessage('SYSTEM', null, `Convite enviado.`);
        }
        // Fecha o modal via UIManager (ou direto no DOM se preferir, mas UI é mais limpo)
        ui.closePlayerModal();
    };
}

// Botão: Aceitar Convite (No popup de convite)
const btnAcceptInvite = document.getElementById('btn-accept-invite');
if (btnAcceptInvite) {
    btnAcceptInvite.onclick = () => {
        if (gameManager.pendingInviteFrom) {
            gameManager.currentPartyPartner = gameManager.pendingInviteFrom;
            
            // Avisa quem convidou
            net.sendPayload({ 
                type: 'PARTY_ACCEPT', 
                fromId: gameManager.localPlayer.id, 
                fromNick: gameManager.localPlayer.nickname 
            }, gameManager.pendingInviteFrom);
            
            chat.addMessage('SYSTEM', null, `Você entrou no grupo.`);
            chat.openPartyTab();
            ui.closePartyInvite();
            gameManager.pendingInviteFrom = null;
        }
    };
}
