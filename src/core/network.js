export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null; 
        this.connections = []; 
        this.isHost = false;
        this.roomData = { id: '', pass: '', seed: '' };
    }

    init(customID, callback) {
        this.peer = new Peer(customID, { debug: 1 });
        this.peer.on('open', (id) => callback(true, id));
        this.peer.on('error', (err) => callback(false, err.type));
    }

    hostRoom(id, pass, seed) {
        this.isHost = true;
        this.roomData = { id, pass, seed };
        this.peer.on('connection', (conn) => {
            conn.on('data', (data) => {
                if (data.type === 'AUTH_REQUEST') {
                    if (!this.roomData.pass || data.password === this.roomData.pass) {
                        conn.send({ type: 'AUTH_SUCCESS', seed: this.roomData.seed });
                        this.connections.push(conn);
                    } else {
                        conn.send({ type: 'AUTH_FAIL', reason: 'Senha incorreta' });
                    }
                } else {
                    window.dispatchEvent(new CustomEvent('netData', { detail: data }));
                    this.connections.forEach(c => { if(c.peer !== conn.peer) c.send(data); });
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
            } else {
                window.dispatchEvent(new CustomEvent('netData', { detail: data }));
            }
        });
    }

    sendPayload(payload) {
        if (this.isHost) this.connections.forEach(c => c.send(payload));
        else if (this.conn) this.conn.send(payload);
    }
}
