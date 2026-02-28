/**
 * WorldState.js
 * Gerencia o estado dos tiles, crescimento de plantas, pólen e a SAÚDE DO SOLO.
 * Atualizado para suportar transição gradual de cores e cura natural (gradiente).
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
        this.CHANCE_OF_CURE = 0.05; // 5% de chance de iniciar a cura do tile a cada frame
        this.SPREAD_DELAY = 1500;   // Reduzido (era 3000) para compensar a lentidão visual do gradiente
        
        // NOVO: Velocidade da cura (quanto de 'saúde' o solo ganha por frame/chamada)
        this.HEAL_SPEED = 0.5;      // 0.5 por chamada significa ~3.3% por segundo a 60fps

        // CONFIGURAÇÕES DE PÓLEN (Mecânica de Coleta e Regeneração)
        this.POLLEN_REGEN_COOLDOWN = 10000; // 10 segundos sem coleta para iniciar regen
        this.POLLEN_REGEN_INTERVAL = 3000;  // +1 de pólen a cada 3 segundos
        this.DEFAULT_MAX_POLLEN = 10;       // Capacidade padrão inicial de uma flor

        this.worldSize = 4000;
        this.START_TIME = new Date('2074-02-09T06:00:00').getTime();
        this.worldTime = this.START_TIME;
    }

    _wrap(c) {
        return ((c % this.worldSize) + this.worldSize) % this.worldSize;
    }

    /**
     * Tenta iniciar o processo de polinização em um tile.
     * Agora ele inicia o "plantio" (soilHealth > 0) em vez de curar na hora.
     */
    attemptPollination(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;

        // Se o tile já está em processo de cura ou já curado, ignora
        if (this.soilHealth[key] !== undefined && this.soilHealth[key] > 0) return 'FAIL';
        
        const current = this.getModifiedTile(wx, wy);
        if (current && current !== 'TERRA_QUEIMADA') return 'FAIL';

        // Lógica de Sorte para INICIAR a vida no solo
        if (Math.random() < this.CHANCE_OF_CURE) {
            delete this.pollinationAttempts[key];
            this.soilHealth[key] = 1; // Dá o start no processo de gradiente (1% de vida)
            return 'CURED';
        }

        // Incrementa persistência para tentar de novo
        this.pollinationAttempts[key] = (this.pollinationAttempts[key] || 0) + 1;
        return 'FAIL';
    }

    /**
     * NOVO: Processa o aumento da saúde do solo ao longo do tempo.
     * Deve ser chamado no loop de update do Host no Game.js
     */
    updateSoilHealth() {
        for (const key in this.soilHealth) {
            if (this.soilHealth[key] < 100) {
                this.soilHealth[key] += this.HEAL_SPEED;
                
                // Quando atinge 100%, consolida oficialmente como GRAMA no modifiedTiles
                if (this.soilHealth[key] >= 100) {
                    this.soilHealth[key] = 100;
                    const [x, y] = key.split(',').map(Number);
                    this.setTile(x, y, 'GRAMA');
                }
            }
        }
    }

    /**
     * NOVO: Retorna a cor exata do tile calculando o Gradiente (Lerp)
     * Cinza -> Marrom Sépia -> Verde
     */
    getTileColor(x, y, baseColor) {
        const wx = this._wrap(Math.round(x));
        const wy = this._wrap(Math.round(y));
        const key = `${wx},${wy}`;
        
        const health = this.soilHealth[key] || 0;

        // Se está morto (0) ou já curado completamente (100), usa a cor padrão
        if (health <= 0) return baseColor; // Retorna a cor cinza que você passa no Game.js
        if (health >= 100) return '#2ecc71'; // Verde final

        // PALETA DE INTERPOLAÇÃO (LERP)
        // Cinza Escuro: rgb(52, 73, 94)  [Equivalente ao seu #34495e]
        // Marrom Sépia: rgb(127, 85, 57)
        // Verde Grama:  rgb(46, 204, 113) [Equivalente ao seu #2ecc71]
        
        let r, g, b;
        if (health < 50) {
            // Fase 1: Cinza (0%) para Marrom Sépia (50%)
            const p = health / 50; 
            r = 52 + (127 - 52) * p;
            g = 73 + (85 - 73) * p;
            b = 94 + (57 - 94) * p;
        } else {
            // Fase 2: Marrom Sépia (50%) para Verde Grama (100%)
            const p = (health - 50) / 50;
            r = 127 + (46 - 127) * p;
            g = 85 + (204 - 85) * p;
            b = 57 + (113 - 57) * p;
        }

        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }

    /**
     * Define o tipo de um tile e gerencia o registro de dados de flores.
     */
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
            if (!this.growingPlants[key]) {
                this.addGrowingPlant(x, y);
            }
        } else if (type === 'FLOR_COOLDOWN') {
            if (this.flowerData[key]) {
                this.flowerData[key].currentPollen = 0;
            }
        } else {
            delete this.flowerData[key];
        }

        if (this.modifiedTiles[key] === type) return false;
        
        this.modifiedTiles[key] = type;

        // Se um tile foi curado instataneamente (ex: admin panel), ajustamos a saúde para não bugar o desenho
        if (type === 'GRAMA' || type === 'FLOR') {
            this.soilHealth[key] = 100;
        }

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
            
            if (Math.sqrt(dx * dx + dy * dy) <= range) {
                nearbyPlayers.push(id);
            }
        }
        return nearbyPlayers;
    }

    removeGrowingPlant(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;
        
        delete this.growingPlants[key];
        delete this.flowerData[key];
        delete this.soilHealth[key]; // Limpa saúde se a planta for removida/destruída
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

            const neighbors = [
                { x: current.x, y: current.y - 1 },
                { x: current.x, y: current.y + 1 },
                { x: current.x - 1, y: current.y },
                { x: current.x + 1, y: current.y }
            ];

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
            soilHealth: this.soilHealth, // NOVO: Exporta a saúde para salvar/sincronizar
            worldTime: this.worldTime 
        };
    }

    applyFullState(stateData) {
        if (stateData) {
            this.modifiedTiles = stateData.tiles || {};
            this.flowerData = stateData.flowers || {}; 
            this.soilHealth = stateData.soilHealth || {}; // NOVO: Carrega a saúde
            
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
        this.soilHealth = {}; // NOVO: Reseta a saúde
        this.worldTime = this.START_TIME;
    }
}
