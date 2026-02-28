/**
 * WorldState.js
 * Gerencia o estado dos tiles, crescimento de plantas, pólen e agora a SAÚDE DO SOLO.
 * Atualizado para suportar transição gradual de cores (gradiente) e cura natural.
 */
export class WorldState {
    constructor() {
        this.modifiedTiles = {}; 
        this.growingPlants = {}; 
        
        // NOVO: Gerenciamento de saúde do solo para transição gradual (0 a 100)
        this.soilHealth = {}; 

        // Gerenciamento persistente de pólen por flor
        this.flowerData = {}; 
        
        // Dicionário para rastrear tentativas de polinização (Persistência)
        this.pollinationAttempts = {};
        
        // CONFIGURAÇÕES DE DIFICULDADE E IMERSÃO
        this.CHANCE_OF_CURE = 0.05; 
        this.SPREAD_DELAY = 1500;   // Reduzido para compensar a lentidão visual da barra de saúde
        
        // NOVO: Velocidade da cura (quanto de 'saúde' o solo ganha por frame processado)
        this.HEAL_SPEED = 0.5;      // 0.5 por frame significa ~3.3% por segundo (cura total em ~30s)

        // CONFIGURAÇÕES DE PÓLEN
        this.POLLEN_REGEN_COOLDOWN = 10000; 
        this.POLLEN_REGEN_INTERVAL = 3000;  
        this.DEFAULT_MAX_POLLEN = 10;       

        this.worldSize = 4000;
        this.START_TIME = new Date('2074-02-09T06:00:00').getTime();
        this.worldTime = this.START_TIME;
    }

    _wrap(c) {
        return ((c % this.worldSize) + this.worldSize) % this.worldSize;
    }

    /**
     * Tenta iniciar o processo de polinização em um tile.
     * Em vez de curar instantaneamente, agora inicia a transição de saúde.
     */
    attemptPollination(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;

        // Se já estiver em processo de cura ou curado, ignora
        if (this.soilHealth[key] !== undefined && this.soilHealth[key] > 0) return 'FAIL';
        
        const current = this.getModifiedTile(wx, wy);
        if (current && current !== 'TERRA_QUEIMADA') return 'FAIL';

        // Lógica de Sorte para INICIAR a vida no solo
        if (Math.random() < this.CHANCE_OF_CURE) {
            delete this.pollinationAttempts[key];
            this.soilHealth[key] = 1; // Começa com 1% de saúde
            return 'CURED';
        }

        this.pollinationAttempts[key] = (this.pollinationAttempts[key] || 0) + 1;
        return 'FAIL';
    }

    /**
     * Processa o aumento da saúde do solo ao longo do tempo.
     * Deve ser chamado no loop principal (Host).
     */
    updateSoilHealth() {
        for (const key in this.soilHealth) {
            if (this.soilHealth[key] < 100) {
                this.soilHealth[key] += this.HEAL_SPEED;
                
                // Quando atinge 100%, transforma oficialmente em GRAMA
                if (this.soilHealth[key] >= 100) {
                    this.soilHealth[key] = 100;
                    const [x, y] = key.split(',').map(Number);
                    this.setTile(x, y, 'GRAMA');
                }
            }
        }
    }

    /**
     * Calcula a cor do tile baseada na saúde (Gradiente Cinza -> Marrom -> Verde)
     * @param {number} x, y - Coordenadas do tile
     * @param {string} baseType - O tipo original do tile no mapa
     */
    getTileColor(x, y, baseType) {
        const key = `${this._wrap(x)},${this._wrap(y)}`;
        const health = this.soilHealth[key] || 0;

        if (health <= 0) {
            return baseType === 'TERRA_QUEIMADA' ? '#34495e' : '#2ecc71';
        }

        // CORES PARA O LERP (Interpolação Linear)
        // Cinza: [52, 73, 94] -> Marrom: [127, 85, 57] -> Verde: [46, 204, 113]
        
        let r, g, b;
        if (health < 50) {
            // Fase 1: Cinza para Marrom (Terra ficando úmida)
            const p = health / 50;
            r = 52 + (127 - 52) * p;
            g = 73 + (85 - 73) * p;
            b = 94 + (57 - 94) * p;
        } else {
            // Fase 2: Marrom para Verde (Grama crescendo)
            const p = (health - 50) / 50;
            r = 127 + (46 - 127) * p;
            g = 85 + (204 - 85) * p;
            b = 57 + (113 - 57) * p;
        }

        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }

    setTile(x, y, type) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;

        if (type === 'FLOR') {
            if (!this.flowerData[key]) {
                this.flowerData[key] = {
                    currentPollen: this.DEFAULT_MAX_POLLEN,
                    maxPollen: this.DEFAULT_MAX_POLLEN,
                    lastCollectTime: Date.now(),
                    lastRegenTime: Date.now()
                };
            }
            if (!this.growingPlants[key]) this.addGrowingPlant(x, y);
        } else if (type === 'FLOR_COOLDOWN') {
            if (this.flowerData[key]) this.flowerData[key].currentPollen = 0;
        } else {
            delete this.flowerData[key];
        }

        if (this.modifiedTiles[key] === type) return false;
        
        this.modifiedTiles[key] = type;

        // Se o tile virou algo que não seja terra queimada, garantimos que a saúde é 100
        if (type !== 'TERRA_QUEIMADA') this.soilHealth[key] = 100;

        return true;
    }

    getFlowerDataSafely(x, y) {
        const wx = this._wrap(Math.round(x));
        const wy = this._wrap(Math.round(y));
        return this.flowerData[`${wx},${wy}`] || null;
    }

    collectPollenFromFlower(x, y) {
        const data = this.getFlowerDataSafely(x, y);
        if (!data || data.currentPollen <= 0) return 0;
        data.currentPollen -= 1;
        data.lastCollectTime = Date.now();
        data.lastRegenTime = Date.now();
        return 1; 
    }

    updateFlowers() {
        const now = Date.now();
        for (const key in this.flowerData) {
            const data = this.flowerData[key];
            if (now - data.lastCollectTime >= this.POLLEN_REGEN_COOLDOWN) {
                if (data.currentPollen < data.maxPollen) {
                    if (now - data.lastRegenTime >= this.POLLEN_REGEN_INTERVAL) {
                        data.currentPollen = Math.min(data.maxPollen, data.currentPollen + 1);
                        data.lastRegenTime = now;
                    }
                }
            }
        }
    }

    getModifiedTile(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        return this.modifiedTiles[`${wx},${wy}`] || null;
    }

    addGrowingPlant(x, y, ownerId = null) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;
        if (!this.growingPlants[key]) {
            this.growingPlants[key] = {
                time: Date.now(),
                lastHealTime: Date.now(),
                owner: ownerId 
            };
        }
    }

    resetPlantTimer(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;
        if (this.growingPlants[key]) {
            this.growingPlants[key].time = Date.now();
            this.growingPlants[key].lastHealTime = Date.now();
        } else {
            this.addGrowingPlant(x, y);
        }
    }

    getPlayersInHealRange(flowerX, flowerY, players, range = 1.5) {
        const nearbyPlayers = [];
        const fx = this._wrap(flowerX);
        const fy = this._wrap(flowerY);
        const halfWorld = this.worldSize / 2;
        for (const id in players) {
            const p = players[id];
            if (p.hp !== undefined && p.hp <= 0) continue;
            const rawPx = p.pos ? p.pos.x : p.x;
            const rawPy = p.pos ? p.pos.y : p.y;
            const px = this._wrap(rawPx);
            const py = this._wrap(rawPy);
            let dx = Math.abs(px - fx);
            if (dx > halfWorld) dx = this.worldSize - dx;
            let dy = Math.abs(py - fy);
            if (dy > halfWorld) dy = this.worldSize - dy;
            if (Math.sqrt(dx * dx + dy * dy) <= range) nearbyPlayers.push(id);
        }
        return nearbyPlayers;
    }

    removeGrowingPlant(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;
        delete this.growingPlants[key];
        delete this.flowerData[key];
        delete this.soilHealth[key];
    }

    getOrganicSpreadShape(startX, startY, minCells = 3, maxCells = 6) {
        const count = Math.floor(Math.random() * (maxCells - minCells + 1)) + minCells;
        const result = [];
        const visited = new Set();
        const frontier = [{ x: Math.round(startX), y: Math.round(startY), step: 0 }];
        visited.add(`${this._wrap(frontier[0].x)},${this._wrap(frontier[0].y)}`);

        while (frontier.length > 0 && result.length < count) {
            const randomIndex = Math.floor(Math.random() * frontier.length);
            const current = frontier.splice(randomIndex, 1)[0];
            result.push({
                x: current.x,
                y: current.y,
                delay: current.step * this.SPREAD_DELAY 
            });
            const neighbors = [{x:current.x, y:current.y-1}, {x:current.x, y:current.y+1}, {x:current.x-1, y:current.y}, {x:current.x+1, y:current.y}];
            for (const n of neighbors) {
                const wx = this._wrap(n.x);
                const wy = this._wrap(n.y);
                const key = `${wx},${wy}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    frontier.push({ ...n, step: current.step + 1 });
                }
            }
        }
        return result;
    }

    getFullState() {
        return { 
            tiles: this.modifiedTiles, 
            plants: this.growingPlants,
            flowers: this.flowerData,
            soilHealth: this.soilHealth, // NOVO: Incluído no save/sync
            worldTime: this.worldTime 
        };
    }

    applyFullState(stateData) {
        if (stateData) {
            this.modifiedTiles = stateData.tiles || {};
            this.flowerData = stateData.flowers || {}; 
            this.soilHealth = stateData.soilHealth || {}; // Sincroniza a saúde do solo
            const rawPlants = stateData.plants || {};
            this.growingPlants = {};
            for (const [key, val] of Object.entries(rawPlants)) {
                this.growingPlants[key] = {
                    time: val.time || Date.now(),
                    lastHealTime: val.lastHealTime || Date.now(),
                    owner: val.owner || null
                };
            }
            this.worldTime = stateData.worldTime || this.START_TIME;
        }
    }

    reset() {
        this.modifiedTiles = {};
        this.growingPlants = {};
        this.flowerData = {};
        this.soilHealth = {};
        this.worldTime = this.START_TIME;
    }
}
