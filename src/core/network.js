export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null; 
        this.connections = []; 
        this.isHost = false;
        this.roomData = { id: '', pass: '', seed: '' };
        
        this.getStateCallback = null;
        this.getGuestDataCallback = null; 
        this.getFullGuestDBStatsCallback = null; 

        this.authenticatedPeers = new Set();
    }

    _log(msg, color = "#00ff00") {
        if (window.logDebug) {
            window.logDebug(msg, color);
        }
        console.log(`[Network] ${msg}`);
    }

    init(customID, callback) {
        this._log(`Inicializando Peer... ${customID || 'ID Aleatório'}`);
        
        const cleanID = customID ? customID.trim().toLowerCase() : null;

        this.peer = new Peer(cleanID, { 
            debug: 1,
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });
        
        this.peer.on('open', (id) => {
            this._log(`Peer aberto com sucesso! ID: ${id}`);
            if(callback) callback(true, id);
        });
        
        this.peer.on('error', (err) => {
            this._log(`Erro no PeerJS: ${err.type}`, "#ff4d4d");
            if(callback) callback(false, err.type);
        });
    }

    hostRoom(id, pass, seed, getStateFn, getGuestDataFn, getFullDBFn) {
        this._log("Configurando como HOST da colmeia...");
        this.isHost = true;
        this.roomData = { id, pass, seed };
        this.getStateCallback = getStateFn;
        this.getGuestDataCallback = getGuestDataFn;
        this.getFullGuestDBStatsCallback = getFullDBFn;

        this.peer.on('connection', (conn) => {
            this._log(`Tentativa de conexão: ${conn.peer}`);

            conn.on('close', () => {
                this._log(`Peer desconectado: ${conn.peer}`, "#e67e22");
                this.connections = this.connections.filter(c => c.peer !== conn.peer);
                this.authenticatedPeers.delete(conn.peer);
                window.dispatchEvent(new CustomEvent('peerDisconnected', { detail: { peerId: conn.peer } }));
            });

            conn.on('data', (data) => {
                // Processamento de Autenticação
                if (data.type === 'AUTH_REQUEST') {
                    if (!this.roomData.pass || data.password === this.roomData.pass) {
                        this._log(`Autenticando: ${data.nickname}`);
                        
                        const currentState = this.getStateCallback ? this.getStateCallback() : {};
                        const savedPlayerData = (this.getGuestDataCallback && data.nickname) ? this.getGuestDataCallback(data.nickname) : null;
                        const fullGuestsDB = this.getFullGuestDBStatsCallback ? this.getFullGuestDBStatsCallback() : {};

                        this.authenticatedPeers.add(conn.peer);
                        this.connections.push(conn);

                        conn.send({ 
                            type: 'AUTH_SUCCESS', 
                            seed: this.roomData.seed, 
                            worldState: currentState,
                            playerData: savedPlayerData,
                            guests: fullGuestsDB 
                        });
                    } else {
                        conn.send({ type: 'AUTH_FAIL', reason: 'Senha incorreta' });
                        setTimeout(() => conn.close(), 500);
                    }
                    return;
                }

                // Segurança: Ignora dados de peers não autenticados
                if (!this.authenticatedPeers.has(conn.peer)) return;

                // Garante que o ID de origem esteja correto no pacote
                data.fromId = conn.peer;

                // --- LÓGICA DE ROTEAMENTO DE DADOS (CORREÇÃO DE MOVIMENTO) ---
                
                // 1. Se o pacote tem alvos específicos (Party/Whisper)
                if (data.targetIds && Array.isArray(data.targetIds)) {
                    data.targetIds.forEach(tId => {
                        if (tId === this.peer.id) {
                            window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                        } else {
                            this.sendToId(tId, data);
                        }
                    });
                } 
                else if (data.targetId) {
                    if (data.targetId === this.peer.id) {
                        window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                    } else {
                        this.sendToId(data.targetId, data);
                    }
                } 
                // 2. Se for um broadcast (Movimento, Chat, Mudança de Tile)
                else {
                    // O Host processa localmente
                    window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                    // E repassa para TODOS os outros Guests conectados
                    this.broadcast(data, conn.peer);
                }
            });
        });
    }

    joinRoom(targetID, password, nickname) {
        const cleanTarget = targetID.trim().toLowerCase();
        this._log(`Conectando ao Host: ${cleanTarget}...`);
        
        this.conn = this.peer.connect(cleanTarget, { reliable: true });
        
        this.conn.on('open', () => {
            this._log("Handshake iniciado...");
            this.conn.send({ type: 'AUTH_REQUEST', password, nickname });
        });

        this.conn.on('data', (data) => {
            if (data.type === 'AUTH_SUCCESS') {
                this._log("Autenticação aceita!");
                window.dispatchEvent(new CustomEvent('joined', { detail: data }));
            } else if (data.type === 'AUTH_FAIL') {
                alert(data.reason);
                this.conn.close();
            } else {
                // Guests recebem dados aqui e disparam o evento para o main.js
                window.dispatchEvent(new CustomEvent('netData', { detail: data }));
            }
        });
        
        this.conn.on('close', () => {
            alert("Desconectado do Host.");
            location.reload();
        });
    }

    sendPayload(payload, targetIdOrIds = null) {
        if (!this.peer) return;
        
        // Garante que o pacote saiba quem enviou
        payload.fromId = this.peer.id;

        if (this.isHost) {
            // Lógica do Host enviando algo
            if (Array.isArray(targetIdOrIds)) {
                targetIdOrIds.forEach(id => {
                    if (id === this.peer.id) window.dispatchEvent(new CustomEvent('netData', { detail: payload }));
                    else this.sendToId(id, payload);
                });
            } else if (targetIdOrIds) {
                if (targetIdOrIds === this.peer.id) window.dispatchEvent(new CustomEvent('netData', { detail: payload }));
                else this.sendToId(targetIdOrIds, payload);
            } else {
                // Se não há alvo, o Host avisa a si mesmo e espalha para os outros
                window.dispatchEvent(new CustomEvent('netData', { detail: payload }));
                this.broadcast(payload);
            }
        } else if (this.conn && this.conn.open) {
            // Guest enviando para o Host
            if (Array.isArray(targetIdOrIds)) {
                payload.targetIds = targetIdOrIds;
            } else if (targetIdOrIds) {
                payload.targetId = targetIdOrIds;
            }
            this.conn.send(payload);
        }
    }

    sendToId(peerId, data) {
        const targetConn = this.connections.find(c => c.peer === peerId);
        if (targetConn && targetConn.open) {
            targetConn.send(data);
        }
    }

    broadcast(data, excludePeerId = null) {
        this.connections.forEach(c => { 
            // Só envia para quem está autenticado e não é o emissor original
            if (c.peer !== excludePeerId && c.open && this.authenticatedPeers.has(c.peer)) {
                c.send(data);
            }
        });
    }
}
