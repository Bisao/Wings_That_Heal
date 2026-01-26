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

        // Rastreia quem passou pelo handshake de autenticação
        this.authenticatedPeers = new Set();
    }

    /**
     * Auxiliar para enviar mensagens de diagnóstico ao HUD
     */
    _log(msg, color = "#00ff00") {
        if (window.logDebug) {
            window.logDebug(msg, color);
        }
        console.log(`[Network] ${msg}`);
    }

    /**
     * Inicializa o objeto Peer.
     * @param {string} customID - ID opcional para o Peer (usado pelo Host).
     * @param {Function} callback - Retorno de sucesso ou erro.
     */
    init(customID, callback) {
        this._log(`Inicializando Peer... ${customID || 'ID Aleatório'}`);
        
        // No mobile, IDs costumam falhar se tiverem caracteres especiais ou espaços
        const cleanID = customID ? customID.trim().toLowerCase() : null;

        this.peer = new Peer(cleanID, { 
            debug: 1,
            config: {
                'iceServers': [
                    { url: 'stun:stun.l.google.com:19302' },
                    { url: 'stun:stun1.l.google.com:19302' }
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

    /**
     * Configura o Peer como Host da sala.
     */
    hostRoom(id, pass, seed, getStateFn, getGuestDataFn, getFullDBFn) {
        this._log("Configurando como HOST da colmeia...");
        this.isHost = true;
        this.roomData = { id, pass, seed };
        this.getStateCallback = getStateFn;
        this.getGuestDataCallback = getGuestDataFn;
        this.getFullGuestDBStatsCallback = getFullDBFn;

        this.peer.on('connection', (conn) => {
            this._log(`Tentativa de conexão recebida de: ${conn.peer}`);

            conn.on('close', () => {
                this._log(`Peer desconectado: ${conn.peer}`, "#e67e22");
                this.connections = this.connections.filter(c => c !== conn);
                this.authenticatedPeers.delete(conn.peer);
                window.dispatchEvent(new CustomEvent('peerDisconnected', { detail: { peerId: conn.peer } }));
            });

            conn.on('data', (data) => {
                // FASE 1: Autenticação
                if (data.type === 'AUTH_REQUEST') {
                    if (!this.roomData.pass || data.password === this.roomData.pass) {
                        this._log(`Autenticando abelha: ${data.nickname} (${conn.peer})`);
                        
                        const currentState = this.getStateCallback ? this.getStateCallback() : {};
                        
                        let savedPlayerData = null;
                        if (this.getGuestDataCallback && data.nickname) {
                            savedPlayerData = this.getGuestDataCallback(data.nickname);
                        }

                        let fullGuestsDB = {};
                        if (this.getFullGuestDBStatsCallback) {
                            fullGuestsDB = this.getFullGuestDBStatsCallback();
                        }

                        this.authenticatedPeers.add(conn.peer);

                        conn.send({ 
                            type: 'AUTH_SUCCESS', 
                            seed: this.roomData.seed, 
                            worldState: currentState,
                            playerData: savedPlayerData,
                            guests: fullGuestsDB 
                        });
                        
                        this.connections.push(conn);
                    } else {
                        this._log(`Falha de autenticação para ${conn.peer}: Senha Incorreta`, "#ff4d4d");
                        conn.send({ type: 'AUTH_FAIL', reason: 'Senha incorreta' });
                        setTimeout(() => conn.close(), 500);
                    }
                } else {
                    // FASE 2: Roteamento de Dados (Apenas para autenticados)
                    if (!this.authenticatedPeers.has(conn.peer)) {
                        this._log(`Pacote bloqueado: Peer ${conn.peer} não autenticado`, "#ff4d4d");
                        return;
                    }

                    if (data.targetId) {
                        if (data.targetId === this.peer.id) {
                            window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                        } else {
                            this.sendToId(data.targetId, data);
                        }
                    } else {
                        window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                        this.broadcast(data, conn.peer);
                    }
                }
            });
        });
    }

    /**
     * Conecta a uma sala existente como Guest.
     */
    joinRoom(targetID, password, nickname) {
        const cleanTarget = targetID.trim().toLowerCase();
        this._log(`Conectando ao Host: ${cleanTarget}...`);
        
        this.conn = this.peer.connect(cleanTarget, {
            reliable: true
        });
        
        this.conn.on('open', () => {
            this._log("Conexão estável estabelecida. Enviando pedido de autenticação...");
            this.conn.send({ type: 'AUTH_REQUEST', password, nickname });
        });

        this.conn.on('data', (data) => {
            if (data.type === 'AUTH_SUCCESS') {
                this._log("Autenticação aceita! Entrando no mundo...");
                window.dispatchEvent(new CustomEvent('joined', { detail: data }));
            }
            else if (data.type === 'AUTH_FAIL') {
                this._log(`Falha ao entrar: ${data.reason}`, "#ff4d4d");
                alert(data.reason);
                this.conn.close();
            }
            else {
                window.dispatchEvent(new CustomEvent('netData', { detail: data }));
            }
        });
        
        this.conn.on('close', () => {
            this._log("A conexão com o Host foi fechada.", "#ff4d4d");
            alert("Sua conexão com o Host foi encerrada.");
            location.reload();
        });

        // Timeout de segurança para mobile
        setTimeout(() => {
            if (this.conn && !this.conn.open) {
                this._log("A conexão está demorando muito. Verifique sua rede.", "#f1c40f");
            }
        }, 5000);
    }

    /**
     * Envia um payload de dados para a rede.
     */
    sendPayload(payload, targetId = null) {
        if (targetId) payload.targetId = targetId; 

        if (this.isHost) {
            if (targetId) {
                if (targetId === this.peer.id) {
                    window.dispatchEvent(new CustomEvent('netData', { detail: payload }));
                } else {
                    this.sendToId(targetId, payload);
                }
            } else {
                this.broadcast(payload);
            }
        } else {
            if (this.conn && this.conn.open) {
                this.conn.send(payload);
            }
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
            if (c.peer !== excludePeerId && c.open && this.authenticatedPeers.has(c.peer)) {
                c.send(data);
            }
        });
    }
}
