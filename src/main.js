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

// --- CONFIGURAÇÕES DE BALANÇO ---
// Chance REAL de nascer grama/semente (20% de chance)
// Se falhar, o chão continua PRETO.
const PLANT_SPAWN_CHANCE = 0.002; 

// Chance da Flor Adulta tentar expandir para um vizinho por segundo
const PASSIVE_ATTEMPT_CHANCE = 0.30; 

const FLOWER_COOLDOWN_TIME = 10000;
const COLLECTION_RATE = 5; 

// Tempos de Crescimento
const GROWTH_TIMES = {
    BROTO: 30000,    // 30s após virar Grama
    MUDA: 120000,    // 2min totais
    FLOR: 300000     // 5min totais
};

let collectionFrameCounter = 0;

const assets = { flower: new Image() };
assets.flower.src = 'assets/Flower.png';

// --- UI HANDLERS ---
document.getElementById('btn-create').onclick = () => {
    const nick = document.getElementById('nickname').value || "Host";
    const id = document.getElementById('create-id').value;
    const pass = document.getElementById('create-pass').value;
    const seed = document.getElementById('world-seed').value || Date.now().toString();
    
    if(!id) return alert("ID obrigatório");
    net.init(id, (ok) => {
        if(ok) {
            net.hostRoom(id, pass, seed, () => worldState.getFullState());
            startGame(seed, id, nick);
            if(net.isHost) startHostSimulation();
        }
    });
};

document.getElementById('btn-join').onclick = () => {
    const nick = document.getElementById('nickname').value || "Guest";
    const id = document.getElementById('join-id').value;
    const pass = document.getElementById('join-pass').value;
    net.init(null, (ok) => { if(ok) net.joinRoom(id, pass, nick); });
};

// --- REDE ---
window.addEventListener('joined', e => {
    const data = e.detail;
    if (data.worldState) worldState.applyFullState(data.worldState);
    startGame(data.seed, net.peer.id, document.getElementById('nickname').value);
});

window.addEventListener('netData', e => {
    const d = e.detail;
    
    if(d.type === 'MOVE') {
        if(!remotePlayers[d.id]) remotePlayers[d.id] = new Player(d.id, d.nick);
        remotePlayers[d.id].targetPos = { x: d.x, y: d.y };
        remotePlayers[d.id].currentDir = d.dir;
    }
    
    if(d.type === 'TILE_CHANGE') {
        worldState.setTile(d.x, d.y, d.tileType);

        // LÓGICA DO HOST (Ao receber dados dos GUESTS)
        if (net.isHost) {
            // Se um Guest enviou 'GRAMA', significa que ele passou no teste de sorte.
            // O Host deve iniciar o crescimento IMEDIATAMENTE.
            if (d.tileType === 'GRAMA') {
                worldState.addGrowingPlant(d.x, d.y);
            }
            
            if (d.tileType === 'FLOR_COOLDOWN') {
                setTimeout(() => changeTile(d.x, d.y, 'FLOR'), FLOWER_COOLDOWN_TIME);
            }
        }
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

// --- SIMULAÇÃO DO HOST (O "Cérebro" do Mundo) ---
function startHostSimulation() {
    setInterval(() => {
        const now = Date.now();

        // 1. Processar CRESCIMENTO (Grama -> Broto -> Muda -> Flor)
        // Isso só roda em tiles que JÁ SÃO 'GRAMA' (que passaram no teste)
        for (const [key, startTime] of Object.entries(worldState.growingPlants)) {
            const [x, y] = key.split(',').map(Number);
            const elapsed = now - startTime;
            const currentType = worldState.getModifiedTile(x, y);

            if (currentType === 'GRAMA' && elapsed > GROWTH_TIMES.BROTO) changeTile(x, y, 'BROTO');
            else if (currentType === 'BROTO' && elapsed > GROWTH_TIMES.MUDA) changeTile(x, y, 'MUDA');
            else if (currentType === 'MUDA' && elapsed > GROWTH_TIMES.FLOR) {
                changeTile(x, y, 'FLOR');
                worldState.removeGrowingPlant(x, y); // Sai da lista de crescimento
            }
        }

        // 2. CURA PASSIVA (Expansão das Flores)
        // Regra: Flor tenta curar vizinho -> Se sorte, vira GRAMA+SEMENTE. Se azar, fica PRETO.
        for (const [key, type] of Object.entries(worldState.modifiedTiles)) {
            if (type === 'FLOR') {
                // Tenta expandir (30% de chance de tentar)
                if (Math.random() < PASSIVE_ATTEMPT_CHANCE) { 
                    const [fx, fy] = key.split(',').map(Number);
                    const tx = fx + (Math.floor(Math.random() * 3) - 1);
                    const ty = fy + (Math.floor(Math.random() * 3) - 1);
                    
                    const tType = worldState.getModifiedTile(tx, ty) || world.getTileAt(tx, ty);
                    
                    // Só tenta em terra queimada
                    if (tType === 'TERRA_QUEIMADA') {
                        // TESTE DE SORTE DA NATUREZA (Mesma chance do player: 20%)
                        if (Math.random() < PLANT_SPAWN_CHANCE) {
                            // Sucesso! Vira Grama E Host inicia crescimento
                            changeTile(tx, ty, 'GRAMA');
                            worldState.addGrowingPlant(tx, ty); 
                        }
                        // Falha: Nada acontece. O tile continua preto.
                        // Não criamos "grama vazia".
                    }
                }
            }
        }
    }, 1000);
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

function update() {
    if(!localPlayer) return;

    const m = input.getMovement();
    localPlayer.update(m);

    // Movimento
    if(m.x !== 0 || m.y !== 0) {
        localPlayer.pos.x += m.x * localPlayer.speed;
        localPlayer.pos.y += m.y * localPlayer.speed;
        net.sendPayload({ 
            type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, 
            x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir
        });
    }

    const gridX = Math.round(localPlayer.pos.x);
    const gridY = Math.round(localPlayer.pos.y);
    const currentTile = worldState.getModifiedTile(gridX, gridY) || world.getTileAt(gridX, gridY);

    // 1. Coleta Gradual
    if (currentTile === 'FLOR' && localPlayer.pollen < localPlayer.maxPollen) {
        collectionFrameCounter++;
        if (collectionFrameCounter >= COLLECTION_RATE) {
            localPlayer.pollen++;
            collectionFrameCounter = 0;
            updateUI();
            if (localPlayer.pollen >= localPlayer.maxPollen) changeTile(gridX, gridY, 'FLOR_COOLDOWN');
        }
    } else {
        collectionFrameCounter = 0;
    }

    // 2. CURA MANUAL DO JOGADOR
    if (currentTile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0) {
        localPlayer.pollen--; // Sempre gasta o pólen pela tentativa
        updateUI();

        // Roda o dado da sorte (20%)
        if (Math.random() < PLANT_SPAWN_CHANCE) {
            // SUCESSO: Vira GRAMA visualmente.
            // O Host receberá isso e iniciará o timer da semente.
            changeTile(gridX, gridY, 'GRAMA');
        } 
        // FALHA: Não faz nada. O chão continua preto. 
        // O jogador vê que gastou pólen mas a grama não pegou.
    }

    camera.x = localPlayer.pos.x;
    camera.y = localPlayer.pos.y;
    Object.values(remotePlayers).forEach(p => p.update({x:0, y:0}));
}

function changeTile(x, y, newType) {
    if(worldState.setTile(x, y, newType)) {
        net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType });
    }
}

function updateUI() {
    const el = document.getElementById('pollen-count');
    if(el) el.innerText = `${localPlayer.pollen} / ${localPlayer.maxPollen}`;
}

function draw() {
    ctx.fillStyle = "#0d0d0d"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(!world) return;

    const cX = Math.floor(localPlayer.pos.x / world.chunkSize);
    const cY = Math.floor(localPlayer.pos.y / world.chunkSize);

    for(let x=-1; x<=1; x++) for(let y=-1; y<=1; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x) * world.tileSize + canvas.width/2;
            const sY = (t.y - camera.y) * world.tileSize + canvas.height/2;

            if(sX > -32 && sX < canvas.width+32 && sY > -32 && sY < canvas.height+32) {
                const finalType = worldState.getModifiedTile(t.x, t.y) || t.type;
                
                // --- VISUALIZAÇÃO ---
                // Se é TERRA_QUEIMADA, é cinza escuro/preto (#34495e)
                // Se é GRAMA (ou estágios de planta), é verde (#2ecc71)
                
                let color = '#34495e'; 
                if(['GRAMA', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN'].includes(finalType)) {
                    color = '#2ecc71';
                }
                if(finalType === 'COLMEIA') color = '#f1c40f';
                
                ctx.fillStyle = color;
                ctx.fillRect(sX, sY, world.tileSize, world.tileSize);

                // --- SPRITES E OBJETOS ---
                if (finalType === 'BROTO') {
                    ctx.fillStyle = '#006400'; ctx.fillRect(sX + 10, sY + 10, 12, 12);
                }
                else if (finalType === 'MUDA') {
                    ctx.fillStyle = '#228B22'; ctx.fillRect(sX + 6, sY + 6, 20, 20);
                }
                else if ((finalType === 'FLOR' || finalType === 'FLOR_COOLDOWN') && assets.flower.complete) {
                    if (finalType === 'FLOR_COOLDOWN') ctx.globalAlpha = 0.4;
                    ctx.drawImage(assets.flower, sX, sY, world.tileSize, world.tileSize);
                    ctx.globalAlpha = 1.0;
                }
            }
        });
    }

    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, world.tileSize));
    localPlayer.draw(ctx, camera, canvas, world.tileSize);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
