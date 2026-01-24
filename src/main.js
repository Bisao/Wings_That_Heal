import { NetworkManager } from './core/network.js';
import { WorldGenerator } from './world/worldGen.js';
import { WorldState } from './world/worldState.js';
import { Player } from './entities/player.js';
import { InputHandler } from './core/input.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const net = new NetworkManager();
const input = new InputHandler();
const worldState = new WorldState();

let world, localPlayer;
let remotePlayers = {};
let camera = { x: 0, y: 0 };

// Assets Globais
const assets = { flower: new Image() };
assets.flower.src = 'assets/Flower.png';

// --- UI SETUP ---
document.getElementById('btn-create').onclick = () => {
    const nick = document.getElementById('nickname').value || "Host";
    const id = document.getElementById('create-id').value;
    const pass = document.getElementById('create-pass').value;
    const seed = document.getElementById('world-seed').value || Date.now().toString();
    
    if(!id) return alert("ID da sala é obrigatório");
    
    document.getElementById('status-msg').innerText = "Criando sala...";
    net.init(id, (ok) => {
        if(ok) {
            // AQUI ESTÁ A MÁGICA: Passamos uma função que devolve o estado atual
            net.hostRoom(id, pass, seed, () => worldState.getFullState());
            startGame(seed, id, nick);
        } else {
            alert("ID em uso ou erro de conexão.");
        }
    });
};

document.getElementById('btn-join').onclick = () => {
    const nick = document.getElementById('nickname').value || "Guest";
    const id = document.getElementById('join-id').value;
    const pass = document.getElementById('join-pass').value;
    
    document.getElementById('status-msg').innerText = "Conectando...";
    net.init(null, (ok) => { 
        if(ok) net.joinRoom(id, pass, nick); 
    });
};

// --- EVENTOS DE REDE ---
window.addEventListener('joined', e => {
    const data = e.detail;
    
    // 1. Aplica o estado recebido do Host (Sincronização Inicial)
    if (data.worldState) {
        worldState.applyFullState(data.worldState);
        console.log("Mundo sincronizado com o Host.");
    }

    startGame(data.seed, net.peer.id, document.getElementById('nickname').value);
});

window.addEventListener('netData', e => {
    const d = e.detail;

    // Movimento de outros players
    if(d.type === 'MOVE') {
        if(!remotePlayers[d.id]) remotePlayers[d.id] = new Player(d.id, d.nick);
        remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
        remotePlayers[d.id].currentDir = d.dir;
    }
    
    // Mudança no mapa em tempo real
    if(d.type === 'TILE_CHANGE') {
        worldState.setTile(d.x, d.y, d.tileType);
    }
});

function startGame(seed, id, nick) {
    document.getElementById('lobby-container').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';
    canvas.style.display = 'block';
    
    world = new WorldGenerator(seed);
    localPlayer = new Player(id, nick, true);
    
    resize();
    requestAnimationFrame(loop);
}

// --- GAME LOOP ---
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

function update() {
    if(!localPlayer) return;

    const m = input.getMovement();
    localPlayer.update(m);

    // Movimento Local
    if(m.x !== 0 || m.y !== 0) {
        localPlayer.pos.x += m.x * localPlayer.speed;
        localPlayer.pos.y += m.y * localPlayer.speed;

        // Envia posição + direção
        net.sendPayload({ 
            type: 'MOVE', 
            id: localPlayer.id, 
            nick: localPlayer.nickname, 
            x: localPlayer.pos.x, 
            y: localPlayer.pos.y,
            dir: localPlayer.currentDir
        });
    }

    // --- LÓGICA DE INTERAÇÃO (Coleta e Cura) ---
    const gridX = Math.round(localPlayer.pos.x);
    const gridY = Math.round(localPlayer.pos.y);
    
    // Verifica tile atual (prioridade: Estado modificado > Gerador)
    const currentTile = worldState.getModifiedTile(gridX, gridY) || world.getTileAt(gridX, gridY);

    // 1. Coletar Flor
    if (currentTile === 'FLOR_POLEM') {
        localPlayer.pollen++;
        updateUI();
        changeTile(gridX, gridY, 'GRAMA');
    }

    // 2. Curar Terra (Gasta pólen)
    if (currentTile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0) {
        localPlayer.pollen--;
        updateUI();
        changeTile(gridX, gridY, 'GRAMA');
    }

    camera.x = localPlayer.pos.x;
    camera.y = localPlayer.pos.y;
    Object.values(remotePlayers).forEach(p => p.update({x:0, y:0}));
}

function changeTile(x, y, newType) {
    // Aplica localmente e avisa a rede
    if(worldState.setTile(x, y, newType)) {
        net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType });
    }
}

function updateUI() {
    document.getElementById('pollen-count').innerText = localPlayer.pollen;
}

function draw() {
    ctx.fillStyle = "#0d0d0d"; // Fundo do vazio
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if(!world) return;

    const cX = Math.floor(localPlayer.pos.x / world.chunkSize);
    const cY = Math.floor(localPlayer.pos.y / world.chunkSize);

    // Renderiza 3x3 chunks ao redor do player
    for(let x=-1; x<=1; x++) for(let y=-1; y<=1; y++) {
        const chunk = world.getChunk(cX+x, cY+y);
        chunk.forEach(t => {
            const sX = (t.x - camera.x) * world.tileSize + canvas.width/2;
            const sY = (t.y - camera.y) * world.tileSize + canvas.height/2;

            // Culling (só desenha se estiver na tela)
            if(sX > -32 && sX < canvas.width+32 && sY > -32 && sY < canvas.height+32) {
                const finalType = worldState.getModifiedTile(t.x, t.y) || t.type;
                
                // 1. Desenha o chão
                let color = '#34495e'; // Terra queimada
                if(finalType === 'GRAMA' || finalType === 'FLOR_POLEM') color = '#27ae60';
                if(finalType === 'COLMEIA') color = '#f1c40f';
                
                ctx.fillStyle = color;
                ctx.fillRect(sX, sY, world.tileSize, world.tileSize);

                // 2. Desenha Flor (se houver)
                if(finalType === 'FLOR_POLEM' && assets.flower.complete) {
                    ctx.drawImage(assets.flower, sX, sY, world.tileSize, world.tileSize);
                }
            }
        });
    }

    // Renderiza players (remotos e local)
    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, world.tileSize));
    localPlayer.draw(ctx, camera, canvas, world.tileSize);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
