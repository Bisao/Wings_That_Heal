export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null; 
        this.connections = []; 
        this.isHost = false;
        this.roomData = { id: '', pass: '', seed: '' };
        
        // Callbacks para obter dados do jogo atual
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

    /**
     * Inicia a sala como Host.
     * @param {string} id - ID da sala
     * @param {string} pass - Senha
     * @param {string} seed - Semente do mundo
     * @param {Function} getStateFn - Função que retorna o estado atual do mundo (tiles/plantas)
     * @param {Function} getGuestDataFn - Função que busca dados salvos de um guest pelo Nickname
     */
    hostRoom(id, pass, seed, getStateFn, getGuestDataFn) {
        this.isHost = true;
        this.roomData = { id, pass, seed };
        this.getStateCallback = getStateFn;
        this.getGuestDataCallback = getGuestDataFn;

        this.peer.on('connection', (conn) => {
            // Gerencia desconexão do Guest
            conn.on('close', () => {
                this.connections = this.connections.filter(c => c !== conn);
                // Dispara evento para o main.js saber quem saiu (útil para limpar remotePlayers)
                window.dispatchEvent(new CustomEvent('peerDisconnected', { detail: { peerId: conn.peer } }));
            });

            conn.on('data', (data) => {
                if (data.type === 'AUTH_REQUEST') {
                    // Verifica senha
                    if (!this.roomData.pass || data.password === this.roomData.pass) {
                        
                        // 1. Pega estado do mundo (para o guest ver o mapa atualizado)
                        const currentState = this.getStateCallback ? this.getStateCallback() : {};
                        
                        // 2. Tenta recuperar o SAVE desse guest específico (Pelo Nickname)
                        let savedPlayerData = null;
                        if (this.getGuestDataCallback && data.nickname) {
                            savedPlayerData = this.getGuestDataCallback(data.nickname);
                            if(savedPlayerData) {
                                console.log(`[Host] Dados recuperados para o guest: ${data.nickname}`);
                            }
                        }

                        // 3. Envia Sucesso com Mundo + Save Pessoal
                        conn.send({ 
                            type: 'AUTH_SUCCESS', 
                            seed: this.roomData.seed, 
                            worldState: currentState,
                            playerData: savedPlayerData // <--- AQUI VAI O PROGRESSO DO GUEST
                        });
                        
                        this.connections.push(conn);
                    } else {
                        conn.send({ type: 'AUTH_FAIL', reason: 'Senha incorreta' });
                        setTimeout(() => conn.close(), 500);
                    }
                } else {
                    // Repassa dados de jogo (Movimento, Tiles, etc)
                    window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                    this.broadcast(data, conn.peer);
                }
            });
        });
    }

    joinRoom(targetID, password, nickname) {
        this.conn = this.peer.connect(targetID);
        
        this.conn.on('open', () => {
            // Envia credenciais
            this.conn.send({ type: 'AUTH_REQUEST', password, nickname });
        });

        this.conn.on('data', (data) => {
            if (data.type === 'AUTH_SUCCESS') {
                // Conectado com sucesso! O detail contém seed, worldState e playerData
                window.dispatchEvent(new CustomEvent('joined', { detail: data }));
            }
            else if (data.type === 'AUTH_FAIL') {
                alert(data.reason);
                this.conn.close();
            }
            else {
                // Dados normais de jogo
                window.dispatchEvent(new CustomEvent('netData', { detail: data }));
            }
        });
        
        this.conn.on('close', () => {
            alert("Desconectado do Host.");
            location.reload(); // Recarrega para o menu
        });
    }

    sendPayload(payload) {
        if (this.isHost) this.broadcast(payload);
        else if (this.conn) this.conn.send(payload);
    }

    broadcast(data, excludePeerId = null) {
        this.connections.forEach(c => { 
            if (c.peer !== excludePeerId) {
                // Tenta enviar apenas se a conexão estiver aberta
                if(c.open) c.send(data);
            }
        });
    }
}
