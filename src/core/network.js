// src/core/network.js (ATUALIZADO)

export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null; 
        this.connections = []; 
        this.isHost = false;
        this.roomData = { id: '', pass: '', seed: '' };
        this.role = null; 
    }

    init(customID, callback) {
        this.peer = new Peer(customID, { debug: 2 });
        this.peer.on('open', (id) => {
            console.log("Conectado ao servidor de sinalização. ID:", id);
            callback(true, id);
        });
        this.peer.on('error', (err) => {
            console.error("Erro no Peer:", err.type);
            callback(false, err.type);
        });
    }

    hostRoom(id, pass, seed) {
        this.isHost = true;
        this.role = 'host';
        this.roomData = { id, pass, seed };
        this.peer.on('connection', (conn) => this.setupHostEvents(conn));
    }

    setupHostEvents(conn) {
        conn.on('data', (data) => {
            if (data.type === 'AUTH_REQUEST') {
                if (!this.roomData.pass || data.password === this.roomData.pass) {
                    conn.send({
                        type: 'AUTH_SUCCESS',
                        seed: this.roomData.seed,
                        nickname: data.nickname // Confirma o nick
                    });
                    this.connections.push(conn);
                    console.log(`Player ${data.nickname} autenticado.`);
                } else {
                    conn.send({ type: 'AUTH_FAIL', reason: 'Senha incorreta' });
                    setTimeout(() => conn.close(), 500);
                }
            } else {
                // Se já estiver autenticado, dispara evento para o jogo e replica para outros
                window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                
                // BROADCAST: Host envia o movimento desse peer para todos os outros peers
                this.connections.forEach(otherConn => {
                    if (otherConn.peer !== conn.peer) {
                        otherConn.send(data);
                    }
                });
            }
        });
    }

    joinRoom(targetID, password, nickname) {
        this.role = 'guest';
        this.conn = this.peer.connect(targetID);

        this.conn.on('open', () => {
            this.conn.send({
                type: 'AUTH_REQUEST',
                password: password,
                nickname: nickname
            });
        });

        this.conn.on('data', (data) => {
            if (data.type === 'AUTH_SUCCESS') {
                window.dispatchEvent(new CustomEvent('joined', { detail: data }));
            } else if (data.type === 'AUTH_FAIL') {
                alert("Erro: " + data.reason);
            } else {
                // Dados de jogo recebidos pelo convidado
                window.dispatchEvent(new CustomEvent('netData', { detail: data }));
            }
        });
    }

    // Método para enviar dados (encapsulamento profissional)
    sendPayload(payload) {
        if (this.isHost) {
            this.connections.forEach(c => c.send(payload));
        } else if (this.conn) {
            this.conn.send(payload);
        }
    }
}
