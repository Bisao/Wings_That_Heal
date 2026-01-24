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
let particles = []; // Sistema de Partículas
let camera = { x: 0, y: 0 };

// --- CONFIGURAÇÕES DE BALANÇO ---
const PLANT_SPAWN_CHANCE = 0.10; // 10% de chance de nascer grama ao voar
const CURE_ATTEMPT_RATE = 20;    // Tenta curar a cada 20 frames (aprox 3x/segundo)
const FLOWER_COOLDOWN_TIME = 10000;
const COLLECTION_RATE = 5; 

const GROWTH_TIMES = {
    BROTO: 30000,
    MUDA: 120000,
    FLOR: 300000
};

let collectionFrameCounter = 0;
let cureFrameCounter = 0;

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

// --- HOST SIMULATION ---
function startHostSimulation() {
    setInterval(() => {
        const now = Date.now();

        // 1. Crescimento
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

        // 2. Cura Passiva
        for (const [key, type] of Object.entries(worldState.modifiedTiles)) {
            if (type === 'FLOR') {
                if (Math.random() < 0.30) { 
                    const [fx, fy] = key.split(',').map(Number);
                    const tx = fx + (Math.floor(Math.random() * 3) - 1);
                    const ty = fy + (Math.floor(Math.random() * 3) - 1);
                    
                    const tType = worldState.getModifiedTile(tx, ty) || world.getTileAt(tx, ty);
                    
                    if (tType === 'TERRA_QUEIMADA') {
                        if (Math.random() < PLANT_SPAWN_CHANCE) {
                            changeTile(tx, ty, 'GRAMA');
                            worldState.addGrowingPlant(tx, ty);
                        }
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

// --- SISTEMA DE PARTÍCULAS ---
function spawnPollenParticle() {
    // Cria uma partícula na posição atual do jogador (com leve variação)
    particles.push({
        x: localPlayer.pos.x + (Math.random() * 0.4 - 0.2), // Variação X
        y: localPlayer.pos.y + (Math.random() * 0.4 - 0.2), // Variação Y
        size: Math.random() * 3 + 2, // Tamanho entre 2 e 5px (em escala de tela será ajustado)
        speedY: Math.random() * 0.02 + 0.01, // Cai devagar
        life: 1.0 // Opacidade inicial
    });
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.y += p.speedY; // Cai
        p.life -= 0.02;  // Desaparece
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function update() {
    if(!localPlayer) return;

    const m = input.getMovement();
    localPlayer.update(m);

    // Verifica se está se movendo
    const isMoving = m.x !== 0 || m.y !== 0;

    if(isMoving) {
        localPlayer.pos.x += m.x * localPlayer.speed;
        localPlayer.pos.y += m.y * localPlayer.speed;
        net.sendPayload({ 
            type: 'MOVE', id: localPlayer.id, nick: localPlayer.nickname, 
            x: localPlayer.pos.x, y: localPlayer.pos.y, dir: localPlayer.currentDir
        });
    }

    // Atualiza Partículas
    updateParticles();

    const gridX = Math.round(localPlayer.pos.x);
    const gridY = Math.round(localPlayer.pos.y);
    const currentTile = worldState.getModifiedTile(gridX, gridY) || world.getTileAt(gridX, gridY);

    // 1. Coleta (Tile Exato)
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

    // 2. CURA MANUAL (CORRIGIDA COM MOVIMENTO E PARTÍCULAS)
    // Regra: Chão Queimado + Tem Pólen + ESTÁ VOANDO
    if (currentTile === 'TERRA_QUEIMADA' && localPlayer.pollen > 0 && isMoving) {
        
        // Efeito Visual: Solta partículas de pólen caindo
        spawnPollenParticle();

        cureFrameCounter++;
        if (cureFrameCounter >= CURE_ATTEMPT_RATE) {
            cureFrameCounter = 0;
            
            localPlayer.pollen--;
            updateUI();

            if (Math.random() < PLANT_SPAWN_CHANCE) {
                changeTile(gridX, gridY, 'GRAMA');
            } 
        }
    } else {
        cureFrameCounter = 0;
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
                
                let color = '#34495e'; 
                if(['GRAMA', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN'].includes(finalType)) color = '#2ecc71';
                if(finalType === 'COLMEIA') color = '#f1c40f';
                
                ctx.fillStyle = color;
                ctx.fillRect(sX, sY, world.tileSize, world.tileSize);

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

    // Desenha Partículas (Antes dos players, depois do chão)
    particles.forEach(p => {
        const sX = (p.x - camera.x) * world.tileSize + canvas.width/2;
        const sY = (p.y - camera.y) * world.tileSize + canvas.height/2;
        
        ctx.fillStyle = `rgba(241, 196, 15, ${p.life})`; // Amarelo com fade
        // Desenha pequeno quadrado ou círculo
        ctx.fillRect(sX, sY, p.size, p.size);
    });

    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, world.tileSize));
    localPlayer.draw(ctx, camera, canvas, world.tileSize);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
