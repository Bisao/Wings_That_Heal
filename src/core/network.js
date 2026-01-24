export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null; 
        this.connections = []; 
        this.isHost = false;
        this.roomData = { id: '', pass: '', seed: '' };
        this.getStateCallback = null; // Função para pegar dados do jogo (Sync)
    }

    init(customID, callback) {
        this.peer = new Peer(customID, { debug: 1 });
        
        this.peer.on('open', (id) => callback(true, id));
        this.peer.on('error', (err) => callback(false, err.type));
    }

    // Host recebe uma função para extrair o estado atual do mundo
    hostRoom(id, pass, seed, getStateFn) {
        this.isHost = true;
        this.roomData = { id, pass, seed };
        this.getStateCallback = getStateFn;

        this.peer.on('connection', (conn) => {
            conn.on('data', (data) => {
                if (data.type === 'AUTH_REQUEST') {
                    if (!this.roomData.pass || data.password === this.roomData.pass) {
                        
                        // Pega o estado atual (plantas crescendo, tiles modificados)
                        const currentState = this.getStateCallback ? this.getStateCallback() : {};

                        conn.send({ 
                            type: 'AUTH_SUCCESS', 
                            seed: this.roomData.seed,
                            worldState: currentState 
                        });
                        
                        this.connections.push(conn);
                        console.log(`[Host] Player conectado. Peers: ${this.connections.length}`);
                    } else {
                        conn.send({ type: 'AUTH_FAIL', reason: 'Senha incorreta' });
                        setTimeout(() => conn.close(), 500);
                    }
                } else {
                    // Host age como relay (Broadcast)
                    window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                    this.broadcast(data, conn.peer);
                }
            });
            
            // Limpeza básica se desconectar
            conn.on('close', () => {
                this.connections = this.connections.filter(c => c !== conn);
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
            } else if (data.type === 'AUTH_FAIL') {
                alert("Erro: " + data.reason);
            } else {
                window.dispatchEvent(new CustomEvent('netData', { detail: data }));
            }
        });
    }

    sendPayload(payload) {
        if (this.isHost) {
            this.broadcast(payload);
        } else if (this.conn) {
            this.conn.send(payload);
        }
    }

    broadcast(data, excludePeerId = null) {
        this.connections.forEach(c => {
            if (c.peer !== excludePeerId) c.send(data);
        });
    }
}
