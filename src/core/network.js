export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null; 
        this.connections = []; 
        this.isHost = false;
        this.roomData = { id: '', pass: '', seed: '' };
        
        this.getStateCallback = null;
        this.getGuestDataCallback = null; 
    }

    init(customID, callback) {
        this.peer = new Peer(customID, { debug: 1 });
        
        this.peer.on('open', (id) => {
            if(callback) callback(true, id);
        });
        
        this.peer.on('error', (err) => {
            console.error("PeerJS Error:", err);
            if(callback) callback(false, err.type);
        });
    }

    hostRoom(id, pass, seed, getStateFn, getGuestDataFn) {
        this.isHost = true;
        this.roomData = { id, pass, seed };
        this.getStateCallback = getStateFn;
        this.getGuestDataCallback = getGuestDataFn;

        this.peer.on('connection', (conn) => {
            conn.on('close', () => {
                this.connections = this.connections.filter(c => c !== conn);
                window.dispatchEvent(new CustomEvent('peerDisconnected', { detail: { peerId: conn.peer } }));
            });

            conn.on('data', (data) => {
                if (data.type === 'AUTH_REQUEST') {
                    if (!this.roomData.pass || data.password === this.roomData.pass) {
                        const currentState = this.getStateCallback ? this.getStateCallback() : {};
                        let savedPlayerData = null;
                        if (this.getGuestDataCallback && data.nickname) {
                            savedPlayerData = this.getGuestDataCallback(data.nickname);
                        }

                        conn.send({ 
                            type: 'AUTH_SUCCESS', 
                            seed: this.roomData.seed, 
                            worldState: currentState,
                            playerData: savedPlayerData 
                        });
                        
                        this.connections.push(conn);
                    } else {
                        conn.send({ type: 'AUTH_FAIL', reason: 'Senha incorreta' });
                        setTimeout(() => conn.close(), 500);
                    }
                } else {
                    // --- LÓGICA DE ROTEAMENTO (NOVO) ---
                    // Se a mensagem tem um targetId, o Host atua como servidor e repassa APENAS para o alvo
                    if (data.targetId) {
                        this.sendToId(data.targetId, data);
                    } else {
                        // Se não tem alvo, é uma mensagem global (Movimento, Chat Global, etc)
                        window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                        this.broadcast(data, conn.peer);
                    }
                }
            });
        });
    }

    joinRoom(targetID, password, nickname) {
        this.conn = this.peer.connect(targetID);
        
        this.conn.on('open', () => {
            this.conn.send({ type: 'AUTH_REQUEST', password, nickname });
        });

        this.conn.on('data', (data) => {
            if (data.type === 'AUTH_SUCCESS') {
                window.dispatchEvent(new CustomEvent('joined', { detail: data }));
            }
            else if (data.type === 'AUTH_FAIL') {
                alert(data.reason);
                this.conn.close();
            }
            else {
                window.dispatchEvent(new CustomEvent('netData', { detail: data }));
            }
        });
        
        this.conn.on('close', () => {
            alert("Desconectado do Host.");
            location.reload();
        });
    }

    /**
     * Envia dados. 
     * @param {Object} payload - Dados a enviar
     * @param {string} targetId - (Opcional) Enviar apenas para este Peer ID
     */
    sendPayload(payload, targetId = null) {
        if (targetId) payload.targetId = targetId; // Marca o alvo no pacote

        if (this.isHost) {
            if (targetId) {
                this.sendToId(targetId, payload);
            } else {
                this.broadcast(payload);
            }
        } else if (this.conn && this.conn.open) {
            this.conn.send(payload);
        }
    }

    // Envia para um ID específico (usado pelo Host)
    sendToId(peerId, data) {
        const targetConn = this.connections.find(c => c.peer === peerId);
        if (targetConn && targetConn.open) {
            targetConn.send(data);
        }
    }

    broadcast(data, excludePeerId = null) {
        this.connections.forEach(c => { 
            if (c.peer !== excludePeerId && c.open) {
                c.send(data);
            }
        });
    }
}
