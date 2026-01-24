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
let smokeParticles = []; 
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

// --- CONTROLES ZOOM ---
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
    zoomSlider.addEventListener('input', (e) => { zoomLevel = parseFloat(e.target.value); });
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
    document.getElementById('rpg-hud').style.display = 'block';
    canvas.style.display = 'block';
    if (input.isMobile) document.getElementById('zoom-controls').style.display = 'flex';

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

function spawnPollenParticle() {
    pollenParticles.push({
        wx: localPlayer.pos.x + (Math.random() * 0.4 - 0.2),
        wy: localPlayer.pos.y + (Math.random() * 0.4 - 0.2),
        size: Math.random() * 3 + 2,
        speedY: Math.random() * 0.02 + 0.01,
        life: 1.0
    });
}

function spawnSmokeParticle(tileX, tileY) {
    const offsetX = Math.random();
    const offsetY = Math.random();
    const isEmber = Math.random() < 0.15;

    smokeParticles.push({
        wx: tileX + offsetX, 
        wy: tileY + offsetY,
        isEmber: isEmber, 
        size: isEmber ? (Math.random() * 3 + 1) : (Math.random() * 5 + 2),
        speedY: -(Math.random() * 0.03 + 0.01), 
        wobbleTick: Math.random() * 100, 
        wobbleSpeed: Math.random() * 0.05 + 0.02, 
        wobbleAmp: 0.01, 
        life: Math.random() * 0.6 + 0.4, 
        decay: Math.random() * 0.008 + 0.005,
        grayVal: Math.floor(Math.random() * 60)
    });
}

function updateParticles() {
    for (let i = pollenParticles.length - 1; i >= 0; i--) {
        let p = pollenParticles[i];
        p.wy += p.speedY; p.life -= 0.02;
        if (p.life <= 0) pollenParticles.splice(i, 1);
    }
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        let p = smokeParticles[i];
        p.wy += p.speedY; p.life -= p.decay; p.wobbleTick += p.wobbleSpeed; p.wx += Math.sin(p.wobbleTick) * p.wobbleAmp;
        if (!p.isEmber) p.size += 0.03; 
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
            updateUI();
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
                updateUI();
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
    const hpPct = Math.max(0, (localPlayer.hp / localPlayer.maxHp) * 100);
    document.getElementById('bar-hp-fill').style.width = `${hpPct}%`;
    document.getElementById('bar-hp-text').innerText = `${Math.ceil(localPlayer.hp)}/${localPlayer.maxHp}`;

    const polPct = Math.max(0, (localPlayer.pollen / localPlayer.maxPollen) * 100);
    document.getElementById('bar-pollen-fill').style.width = `${polPct}%`;
    document.getElementById('bar-pollen-text').innerText = `${localPlayer.pollen}/${localPlayer.maxPollen}`;
}

function draw() {
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if(!world) return;

    const rTileSize = world.tileSize * zoomLevel;
    const cX = Math.floor(localPlayer.pos.x / world.chunkSize);
    const cY = Math.floor(localPlayer.pos.y / world.chunkSize);
    const range = zoomLevel < 0.8 ? 2 : 1; 

    for(let x=-range; x<=range; x++) for(let y=-range; y<=range; y++) {
        world.getChunk(cX+x, cY+y).forEach(t => {
            const sX = (t.x - camera.x) * rTileSize + canvas.width/2;
            const sY = (t.y - camera.y) * rTileSize + canvas.height/2;

            if(sX > -rTileSize && sX < canvas.width+rTileSize && sY > -rTileSize && sY < canvas.height+rTileSize) {
                const finalType = worldState.getModifiedTile(t.x, t.y) || t.type;
                let color = '#34495e'; 
                
                if (finalType === 'TERRA_QUEIMADA') {
                    if (Math.random() < 0.015) spawnSmokeParticle(t.x, t.y);
                }

                if(['GRAMA', 'GRAMA_SAFE', 'BROTO', 'MUDA', 'FLOR', 'FLOR_COOLDOWN'].includes(finalType)) color = '#2ecc71';
                if(finalType === 'COLMEIA') color = '#f1c40f';
                
                ctx.fillStyle = color; ctx.fillRect(sX, sY, rTileSize, rTileSize);

                if (finalType === 'BROTO') { 
                    ctx.fillStyle = '#006400'; 
                    const size = 12 * zoomLevel; const offset = (rTileSize - size) / 2;
                    ctx.fillRect(sX + offset, sY + offset, size, size); 
                }
                else if (finalType === 'MUDA') { 
                    ctx.fillStyle = '#228B22'; 
                    const size = 20 * zoomLevel; const offset = (rTileSize - size) / 2;
                    ctx.fillRect(sX + offset, sY + offset, size, size); 
                }
                
                // --- DESENHO DE FLOR ANIMADA ---
                else if ((finalType === 'FLOR' || finalType === 'FLOR_COOLDOWN') && assets.flower.complete) {
                    if (finalType === 'FLOR_COOLDOWN') ctx.globalAlpha = 0.4;
                    
                    // 1. Sombra da Flor
                    ctx.fillStyle = "rgba(0,0,0,0.3)";
                    ctx.beginPath();
                    // Sombra na base
                    ctx.ellipse(sX + rTileSize/2, sY + rTileSize - (5 * zoomLevel), 8 * zoomLevel, 3 * zoomLevel, 0, 0, Math.PI*2);
                    ctx.fill();

                    // 2. Animação de Vento
                    ctx.save();
                    // Translada para o centro da BASE da flor (Pivô de rotação)
                    ctx.translate(sX + rTileSize/2, sY + rTileSize);
                    
                    // Cálculo do Vento: Onda senoidal baseada no tempo + posição X da flor (para não ficarem sincronizadas)
                    // (t.x * 0.5) cria uma defasagem na onda
                    const windAngle = Math.sin(Date.now() / 800 + t.x * 0.5) * 0.1; // 0.1 rad de inclinação max
                    ctx.rotate(windAngle);

                    // Desenha a imagem deslocada para cima (negativo Y) para que a base fique no pivô (0,0)
                    // Ajuste visual: -size/2 no X para centralizar, -size no Y para desenhar para cima
                    ctx.drawImage(assets.flower, -rTileSize/2, -rTileSize, rTileSize, rTileSize);
                    
                    ctx.restore();
                    ctx.globalAlpha = 1.0;
                }
            }
        });
    }

    smokeParticles.forEach(p => {
        const psX = (p.wx - camera.x) * rTileSize + canvas.width/2;
        const psY = (p.wy - camera.y) * rTileSize + canvas.height/2;

        if (p.isEmber) ctx.fillStyle = `rgba(231, 76, 60, ${p.life})`;
        else ctx.fillStyle = `rgba(${p.grayVal}, ${p.grayVal}, ${p.grayVal}, ${p.life * 0.4})`; 
        
        ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel);
    });

    pollenParticles.forEach(p => {
        const psX = (p.wx - camera.x) * rTileSize + canvas.width/2;
        const psY = (p.wy - camera.y) * rTileSize + canvas.height/2;
        ctx.fillStyle = `rgba(241, 196, 15, ${p.life})`; 
        ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel);
    });

    Object.values(remotePlayers).forEach(p => p.draw(ctx, camera, canvas, rTileSize));
    localPlayer.draw(ctx, camera, canvas, rTileSize);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize;
