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
let pollenParticles = [];
let smokeParticles = []; // Array dedicado à fumaça
let camera = { x: 0, y: 0 };

// --- CONFIGURAÇÕES DE ZOOM ---
let zoomLevel = 1.0; 
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

// --- CONFIGURAÇÕES DE BALANÇO ---
const PLANT_SPAWN_CHANCE = 0.10; 
const CURE_ATTEMPT_RATE = 20;    
const FLOWER_COOLDOWN_TIME = 10000;
const COLLECTION_RATE = 5; 
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

// --- CONTROLE DE ZOOM ---
window.addEventListener('wheel', (e) => {
    if (!localPlayer) return;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    zoomLevel += delta;
    if (zoomLevel < MIN_ZOOM) zoomLevel = MIN_ZOOM;
    if (zoomLevel > MAX_ZOOM) zoomLevel = MAX_ZOOM;
    const slider = document.getElementById('zoom-slider');
    if (slider) slider.value = zoomLevel;
}, { passive: true });

const zoomSlider = document.getElementById('zoom-slider');
if(zoomSlider) {
    zoomSlider.addEventListener('input', (e) => {
        zoomLevel = parseFloat(e.target.value);
    });
}

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
    
    if (input.isMobile) {
        const zc = document.getElementById('zoom-controls');
        if(zc) zc.style.display = 'flex';
    }

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

// --- SISTEMA DE PARTÍCULAS ORGÂNICAS ---

function spawnPollenParticle() {
    pollenParticles.push({
        x: localPlayer.pos.x + (Math.random() * 0.4 - 0.2),
        y: localPlayer.pos.y + (Math.random() * 0.4 - 0.2),
        size: Math.random() * 3 + 2,
        speedY: Math.random() * 0.02 + 0.01,
        life: 1.0
    });
}

function spawnSmokeParticle(sX, sY, tileSize) {
    // 1. Posição aleatória dentro do tile (não apenas no centro)
    const posX = sX + Math.random() * tileSize;
    const posY = sY + Math.random() * tileSize;

    smokeParticles.push({
        x: posX, 
        y: posY,
        size: Math.random() * 5 + 2, // Tamanhos variados
        
        // 2. Velocidade de subida variável
        speedY: -(Math.random() * 0.4 + 0.1), 
        
        // 3. Oscilação (Wobble) para parecer fumaça real
        // Cada partícula tem sua própria frequência e amplitude de onda
        wobbleTick: Math.random() * 100, // Começa em fase aleatória
        wobbleSpeed: Math.random() * 0.05 + 0.02,
        wobbleAmp: Math.random() * 0.5,
        
        life: Math.random() * 0.5 + 0.5, // Algumas duram mais, outras menos
        decay: Math.random() * 0.005 + 0.005, // Velocidade que desaparece
        
        // Cor: Cinza escuro a preto
        colorVal: Math.floor(Math.random() * 40) 
    });
}

function updateParticles() {
    // Pólen (Simples, cai para baixo)
    for (let i = pollenParticles.length - 1; i >= 0; i--) {
        let p = pollenParticles[i];
        p.y += p.speedY; p.life -= 0.02;
        if (p.life <= 0) pollenParticles.splice(i, 1);
    }

    // Fumaça (Complexa, sobe oscilando)
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        let p = smokeParticles[i];
        
        p.y += p.speedY;      // Sobe constante
        p.life -= p.decay;    // Desaparece gradualmente
        
        // Movimento Orgânico: Onda Senoidal
        p.wobbleTick += p.wobbleSpeed;
        p.x += Math.sin(p.wobbleTick) * p.wobbleAmp;
        
        // Expande levemente ao subir (dispersão)
        p.size += 0.02;       
        
        if (p.life <= 0) smokeParticles.splice(i, 1);
    }
}

function update() {
    if(!localPlayer) return;

    const m = input.getMovement();
    
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

    if (localPlayer.pollen > 0) {
        if (isMoving || Math.random() < 0.3) spawnPollenParticle();
    }
    updateParticles();

    const gridX = Math.round(localPlayer.pos.x);
    const gridY = Math.round(localPlayer.pos.y);
    const currentTile = worldState.getModifiedTile(gridX, gridY) || world.getTileAt(gridX, gridY);

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

    if (currentTile === 'FLOR' && localPlayer.pollen < localPlayer.maxPollen) {
        collectionFrameCounter++;
        if (collectionFrameCounter >= COLLECTION_RATE) {
            localPlayer.pollen++; collectionFrameCounter = 0; updateUI();
            if (localPlayer.pollen >= localPlayer.maxPollen) changeTile(gridX, gridY, 'FLOR_COOLDOWN');
        }
    } else { collectionFrameCounter = 0; }

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

    const rTileSize = world.tileSize * zoomLevel;
    const cX = Math.floor(localPlayer.pos.x / world.chunkSize);
    const cY = Math.floor(localPlayer.pos.y / world.chunkSize);
    
    // Aumenta range de renderização se zoom estiver longe
    const range = zoomLevel < 0.8 ? 2 : 1; 

    for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x) * rTileSize + canvas.width/2;
            const sY = (t.y - camera.y) * rTileSize + canvas.height/2;

            if(sX > -rTileSize && sX < canvas.width+rTileSize && sY > -rTileSize && sY < canvas.height+rTileSize) {
                const finalType = worldState.getModifiedTile(t.x, t.y) || t.type;
                let color = '#34495e'; 
                
                // --- LÓGICA DE FUMAÇA ORGÂNICA ---
                if (finalType === 'TERRA_QUEIMADA') {
                    // Chance de spawnar fumaça neste frame para este tile.
                    // Ajuste 0.015 para mais ou menos fumaça.
                    // Math.random garante que não spawnem todos juntos.
                    if (Math.random() < 0.015) {
                        spawnSmokeParticle(sX, sY, rTileSize);
                    }
                }

                if(['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN'].includes(finalType)) color = '#2ecc71';
                if(finalType === 'COLMEIA') color = '#f1c40f';
                
                ctx.fillStyle = color; ctx.fillRect(sX, sY, rTileSize, rTileSize);

                if (finalType === 'BROTO') { 
                    ctx.fillStyle = '#006400'; 
                    const size = 12 * zoomLevel; 
                    const offset = (rTileSize - size) / 2;
                    ctx.fillRect(sX + offset, sY + offset, size, size); 
                }
                else if (finalType === 'MUDA') { 
                    ctx.fillStyle = '#228B22'; 
                    const size = 20 * zoomLevel;
                    const offset = (rTileSize - size) / 2;
                    ctx.fillRect(sX + offset, sY + offset, size, size); 
                }
                else if ((finalType === 'FLOR' || finalType === 'FLOR_COOLDOWN') && assets.flower.complete) {
                    if (finalType === 'FLOR_COOLDOWN') ctx.globalAlpha = 0.4;
                    ctx.drawImage(assets.flower, sX, sY, rTileSize, rTileSize);
                    ctx.globalAlpha = 1.0;
                }
            }
        });
    }

    // Desenha Fumaça (Com transparência baseada na vida)
    smokeParticles.forEach(p => {
        ctx.fillStyle = `rgba(${p.colorVal}, ${p.colorVal}, ${p.colorVal}, ${p.life * 0.4})`; 
        // Desenhamos quadrados, mas com a oscilação do updateParticles, parece orgânico
        ctx.fillRect(p.x, p.y, p.size * zoomLevel, p.size * zoomLevel);
    });

    // Desenha Pólen
    pollenParticles.forEach(p => {
        const sX = (p.x - camera.x) * rTileSize + canvas.width/2;
        const sY = (p.y - camera.y) * rTileSize + canvas.height/2;
        ctx.fillStyle = `rgba(241, 196, 15, ${p.life})`; 
        ctx.fillRect(sX, sY, p.size * zoomLevel, p.size * zoomLevel);
    });

    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize));
    localPlayer.draw(ctx, camera, canvas, rTileSize);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
