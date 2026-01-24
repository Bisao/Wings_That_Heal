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
let pollenParticles = []; // Partículas da abelha
let smokeParticles = [];  // Partículas do ambiente (fumaça)
let camera = { x: 0, y: 0 };

// --- CONFIGURAÇÕES DE BALANÇO ---
const PLANT_SPAWN_CHANCE = 0.10; 
const CURE_ATTEMPT_RATE = 20;    
const FLOWER_COOLDOWN_TIME = 10000;
const COLLECTION_RATE = 5; 

// Dano e Vida
const DAMAGE_RATE = 10; 
const DAMAGE_AMOUNT = 5; 
const HEAL_RATE = 20;    
const HEAL_AMOUNT = 2;   

const GROWTH_TIMES = {
    BROTO: 5000,
    MUDA: 10000,
    FLOR: 15000
};

let collectionFrameCounter = 0;
let cureFrameCounter = 0;
let damageFrameCounter = 0;

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
        if (net.isHost) {
            if (d.tileType === 'GRAMA') worldState.addGrowingPlant(d.x, d.y);
            if (d.tileType === 'FLOR_COOLDOWN') setTimeout(() => changeTile(d.x, d.y, 'FLOR'), FLOWER_COOLDOWN_TIME);
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

// --- HOST SIMULATION ---
function startHostSimulation() {
    setInterval(() => {
        const now = Date.now();
        for (const [key, startTime] of Object.entries(worldState.growingPlants)) {
            const [x, y] = key.split(',').map(Number);
            const elapsed = now - startTime;
            const currentType = worldState.getModifiedTile(x, y);

            if (currentType === 'GRAMA' && elapsed > GROWTH_TIMES.BROTO) changeTile(x, y, 'BROTO');
            else if (currentType === 'BROTO' && elapsed > GROWTH_TIMES.MUDA) changeTile(x, y, 'MUDA');
            else if (currentType === 'MUDA' && elapsed > GROWTH_TIMES.FLOR) {
                changeTile(x, y, 'FLOR');
                worldState.removeGrowingPlant(x, y);
            }
        }
        for (const [key, type] of Object.entries(worldState.modifiedTiles)) {
            if (type === 'FLOR') {
                if (Math.random() < 0.30) { 
                    const [fx, fy] = key.split(',').map(Number);
                    const tx = fx + (Math.floor(Math.random() * 3) - 1);
                    const ty = fy + (Math.floor(Math.random() * 3) - 1);
                    const tType = worldState.getModifiedTile(tx, ty) || world.getTileAt(tx, ty);
                    if (tType === 'TERRA_QUEIMADA') changeTile(tx, ty, 'GRAMA_SAFE');
                }
            }
        }
    }, 1000);
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

// --- PARTÍCULAS: PÓLEN (Cai da abelha) ---
function spawnPollenParticle() {
    pollenParticles.push({
        x: localPlayer.pos.x + (Math.random() * 0.4 - 0.2),
        y: localPlayer.pos.y + (Math.random() * 0.4 - 0.2),
        size: Math.random() * 3 + 2,
        speedY: Math.random() * 0.02 + 0.01,
        life: 1.0
    });
}

// --- PARTÍCULAS: FUMAÇA (Sobe da terra queimada) ---
// Recebe coordenadas de TELA (sX, sY) para spawnar
function spawnSmokeParticle(sX, sY, tileSize) {
    // Posição aleatória dentro do tile
    const posX = sX + Math.random() * tileSize;
    const posY = sY + Math.random() * tileSize;

    smokeParticles.push({
        x: posX, 
        y: posY,
        // Converte posição de tela para mundo apenas para persistência (opcional, aqui usamos tela direto pois fumaça é efêmera)
        // Para simplificar, vamos manter a lógica de renderização baseada em coordenadas de tela
        // pois a fumaça morre rápido. Se mover a câmera rápido, ela desliza, mas é aceitável para performance.
        // O ideal seria guardar worldX/worldY, mas isso exige recalcular no draw.
        // Vamos usar uma abordagem híbrida: spawnamos na posição da tela, mas aplicamos um offset da camera no update se necessário.
        // POREM, para simplificar e performar: fumaça é apenas um efeito de tela (overlay).
        
        size: Math.random() * 4 + 2,
        speedY: -(Math.random() * 0.5 + 0.2), // Sobe
        drift: (Math.random() * 0.4) - 0.2,   // Vento lateral
        life: 1.0,
        colorVal: Math.floor(Math.random() * 50) // Variações de cinza escuro (0 a 50)
    });
}

function updateParticles() {
    // Atualiza Pólen
    for (let i = pollenParticles.length - 1; i >= 0; i--) {
        let p = pollenParticles[i];
        p.y += p.speedY; p.life -= 0.02;
        if (p.life <= 0) pollenParticles.splice(i, 1);
    }

    // Atualiza Fumaça
    // Nota: Como spawnamos baseado na posição da tela no momento do draw, 
    // se a camera mover, a fumaça "velha" desalinha. 
    // Para corrigir visualmente sem custo alto, apenas deixamos ela subir e morrer rápido.
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        let p = smokeParticles[i];
        p.y += p.speedY;      // Sobe
        p.x += p.drift;       // Vento
        p.life -= 0.015;      // Desaparece devagar
        p.size += 0.05;       // Expande levemente ao subir
        
        if (p.life <= 0) smokeParticles.splice(i, 1);
    }
}

function update() {
    if(!localPlayer) return;

    // Inputs
    const m = input.getMovement();
    
    // Joystick Mira
    if (input.isMobile && input.rightStick) {
        const aim = input.rightStick.vector;
        if (aim.x !== 0 || aim.y !== 0) {
            if (Math.abs(aim.x) > Math.abs(aim.y)) localPlayer.currentDir = aim.x > 0 ? 'Right' : 'Left';
            else localPlayer.currentDir = aim.y > 0 ? 'Down' : 'Up';
        }
    }

    localPlayer.update(m);
    const isMoving = m.x !== 0 || m.y !== 0;

    if(isMoving) {
        localPlayer.pos.x += m.x * localPlayer.speed;
        localPlayer.pos.y += m.y * localPlayer.speed;
        net.sendPayload({ 
            type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, 
            x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir
        });
    }

    // Spawn Pólen
    if (localPlayer.pollen > 0) {
        if (isMoving || Math.random() < 0.3) spawnPollenParticle();
    }
    
    updateParticles();

    // Lógica Tile
    const gridX = Math.round(localPlayer.pos.x);
    const gridY = Math.round(localPlayer.pos.y);
    const currentTile = worldState.getModifiedTile(gridX, gridY) || world.getTileAt(gridX, gridY);

    // Dano e Morte
    const isSafeZone = ['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN', 'COLMEIA'].includes(currentTile);

    if (!isSafeZone) {
        damageFrameCounter++;
        if (damageFrameCounter >= DAMAGE_RATE) {
            damageFrameCounter = 0;
            localPlayer.hp -= DAMAGE_AMOUNT;
            if (localPlayer.hp <= 0) {
                localPlayer.respawn();
                updateUI();
                net.sendPayload({ 
                    type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, 
                    x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir
                });
            }
        }
    } else {
        damageFrameCounter++;
        if (damageFrameCounter >= HEAL_RATE) {
            damageFrameCounter = 0;
            if (localPlayer.hp < localPlayer.maxHp) {
                localPlayer.hp += HEAL_AMOUNT;
                if (localPlayer.hp > localPlayer.maxHp) localPlayer.hp = localPlayer.maxHp;
            }
        }
    }

    // Coleta
    if (currentTile === 'FLOR' && localPlayer.pollen < localPlayer.maxPollen) {
        collectionFrameCounter++;
        if (collectionFrameCounter >= COLLECTION_RATE) {
            localPlayer.pollen++; collectionFrameCounter = 0; updateUI();
            if (localPlayer.pollen >= localPlayer.maxPollen) changeTile(gridX, gridY, 'FLOR_COOLDOWN');
        }
    } else { collectionFrameCounter = 0; }

    // Cura Manual
    if (currentTile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0 && isMoving) {
        cureFrameCounter++;
        if (cureFrameCounter >= CURE_ATTEMPT_RATE) {
            cureFrameCounter = 0; localPlayer.pollen--; updateUI();
            if (Math.random() < PLANT_SPAWN_CHANCE) changeTile(gridX, gridY, 'GRAMA');
        }
    } else { cureFrameCounter = 0; }

    camera.x = localPlayer.pos.x;
    camera.y = localPlayer.pos.y;
    Object.values(remotePlayers).forEach(p => p.update({x:0, y:0}));
}

function changeTile(x, y, newType) {
    if(worldState.setTile(x, y, newType)) {
        if (net.isHost && newType === 'GRAMA') worldState.addGrowingPlant(x, y);
        net.sendPayload({ type: 'TILE_CHANGE', x, y, tileType: newType });
    }
}

function updateUI() {
    const el = document.getElementById('pollen-count');
    if(el) el.innerText = `${localPlayer.pollen} / ${localPlayer.maxPollen}`;
}

function draw() {
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(!world) return;

    const cX = Math.floor(localPlayer.pos.x / world.chunkSize);
    const cY = Math.floor(localPlayer.pos.y / world.chunkSize);

    // Renderiza Mundo e Spawna Fumaça
    for(let x=-1; x<=1; x++) for(let y=-1; y<=1; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x) * world.tileSize + canvas.width/2;
            const sY = (t.y - camera.y) * world.tileSize + canvas.height/2;

            if(sX > -32 && sX < canvas.width+32 && sY > -32 && sY < canvas.height+32) {
                const finalType = worldState.getModifiedTile(t.x, t.y) || t.type;
                let color = '#34495e'; // Cor base da Terra Queimada
                
                // LÓGICA DE FUMAÇA:
                // Se o tile é queimado, tem uma chance pequena de gerar uma partícula de fumaça neste frame
                if (finalType === 'TERRA_QUEIMADA') {
                    // 0.5% de chance por frame por tile visível (ajuste para mais ou menos fumaça)
                    if (Math.random() < 0.005) {
                        spawnSmokeParticle(sX, sY, world.tileSize);
                    }
                }

                if(['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN'].includes(finalType)) color = '#2ecc71';
                if(finalType === 'COLMEIA') color = '#f1c40f';
                
                ctx.fillStyle = color; ctx.fillRect(sX, sY, world.tileSize, world.tileSize);

                if (finalType === 'BROTO') { ctx.fillStyle = '#006400'; ctx.fillRect(sX + 10, sY + 10, 12, 12); }
                else if (finalType === 'MUDA') { ctx.fillStyle = '#228B22'; ctx.fillRect(sX + 6, sY + 6, 20, 20); }
                else if ((finalType === 'FLOR' || finalType === 'FLOR_COOLDOWN') && assets.flower.complete) {
                    if (finalType === 'FLOR_COOLDOWN') ctx.globalAlpha = 0.4;
                    ctx.drawImage(assets.flower, sX, sY, world.tileSize, world.tileSize);
                    ctx.globalAlpha = 1.0;
                }
            }
        });
    }

    // Desenha Fumaça (Camada abaixo dos players, acima do chão)
    smokeParticles.forEach(p => {
        // Como a posição da fumaça já está em coordenadas de tela (simplificação), desenhamos direto
        // Para ficar perfeito com movimento de camera, teríamos que compensar o delta da camera, 
        // mas como elas morrem rápido, o efeito "flutuante" é aceitável e performático.
        ctx.fillStyle = `rgba(${p.colorVal}, ${p.colorVal}, ${p.colorVal}, ${p.life * 0.5})`; // Cinza com transparência
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });

    // Desenha Pólen
    pollenParticles.forEach(p => {
        const sX = (p.x - camera.x) * world.tileSize + canvas.width/2;
        const sY = (p.y - camera.y) * world.tileSize + canvas.height/2;
        ctx.fillStyle = `rgba(241, 196, 15, ${p.life})`; ctx.fillRect(sX, sY, p.size, p.size);
    });

    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, world.tileSize));
    localPlayer.draw(ctx, camera, canvas, world.tileSize);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
