export class WorldState {
    constructor() {
        this.modifiedTiles = {}; 
        this.growingPlants = {}; 
        
        // Define o tamanho do mundo para lógica toroidal (Deve bater com WorldGenerator)
        this.worldSize = 4000;
        
        // PADRONIZAÇÃO CRÍTICA: Data inicial exata para o cálculo da Horda de 7 Dias
        // 09 de Fevereiro de 2074, 06:00:00 AM
        this.START_TIME = new Date('2074-02-09T06:00:00').getTime();
        this.worldTime = this.START_TIME;
    }

    /**
     * Helper para normalizar coordenadas (Mundo Redondo/Toroidal).
     * Garante que 4001 vire 1, e -1 vire 3999, conectando as bordas do mapa.
     */
    _wrap(c) {
        return ((c % this.worldSize) + this.worldSize) % this.worldSize;
    }

    setTile(x, y, type) {
        // Normaliza as coordenadas antes de criar a chave
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;

        // Otimização: Só altera se o bloco for realmente modificado
        if (this.modifiedTiles[key] === type) return false;
        
        this.modifiedTiles[key] = type;
        
        // Se o tile virou FLOR, garantimos que ele exista na lista de plantas para pulsar cura
        if (type === 'FLOR') {
            if (!this.growingPlants[key]) {
                this.addGrowingPlant(x, y);
            }
        }
        
        return true;
    }

    getModifiedTile(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        return this.modifiedTiles[`${wx},${wy}`] || null;
    }

    /**
     * Adiciona uma planta em crescimento.
     * Aceita ownerId para saber quem plantou e recompensar o jogador.
     */
    addGrowingPlant(x, y, ownerId = null) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;

        // Só adiciona se não existir
        if (!this.growingPlants[key]) {
            this.growingPlants[key] = {
                time: Date.now(),
                lastHealTime: Date.now(),
                owner: ownerId 
            };
        }
    }

    /**
     * Reinicia o cronômetro da planta para o momento atual.
     * Acionado quando o jogador colhe o pólen da flor.
     */
    resetPlantTimer(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;

        if (this.growingPlants[key]) {
            this.growingPlants[key].time = Date.now();
            this.growingPlants[key].lastHealTime = Date.now();
        } else {
            this.addGrowingPlant(x, y); // Já usa coordenadas normalizadas internamente
        }
    }

    /**
     * Identifica jogadores próximos para cura (Usado pela Árvore Mestra).
     * Suporta lógica toroidal e cria uma zona de cura circular perfeita.
     */
    getPlayersInHealRange(flowerX, flowerY, players, range = 1.5) {
        const nearbyPlayers = [];
        const fx = this._wrap(flowerX);
        const fy = this._wrap(flowerY);
        const halfWorld = this.worldSize / 2;

        for (const id in players) {
            const p = players[id];
            
            // Ignora jogadores com HP zerado (para não curar defuntos, eles precisam ser Resgatados)
            if (p.hp !== undefined && p.hp <= 0) continue;

            // Verifica se o player tem as propriedades de posição
            const rawPx = p.pos ? p.pos.x : p.x;
            const rawPy = p.pos ? p.pos.y : p.y;
            
            // Normaliza posição do player
            const px = this._wrap(rawPx);
            const py = this._wrap(rawPy);
            
            // Cálculo de distância toroidal (menor caminho considerando a borda)
            let dx = Math.abs(px - fx);
            if (dx > halfWorld) dx = this.worldSize - dx;

            let dy = Math.abs(py - fy);
            if (dy > halfWorld) dy = this.worldSize - dy;
            
            // Hitbox Circular (Distância Euclidiana Verdadeira)
            if (Math.sqrt(dx * dx + dy * dy) <= range) {
                nearbyPlayers.push(id);
            }
        }
        return nearbyPlayers;
    }

    removeGrowingPlant(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        delete this.growingPlants[`${wx},${wy}`];
    }

    /**
     * Calcula um padrão orgânico de espalhamento para a cura do solo.
     * @returns {Array} Array de coordenadas {x, y} a serem curadas, em ordem de "crescimento".
     */
    getOrganicSpreadShape(startX, startY, minCells = 5, maxCells = 11) {
        // Decide aleatoriamente quantas células serão curadas
        const count = Math.floor(Math.random() * (maxCells - minCells + 1)) + minCells;
        const result = [];
        const visited = new Set();
        
        // Fila para simular o crescimento (Flood Fill aleatório)
        const frontier = [{ x: Math.round(startX), y: Math.round(startY) }];
        visited.add(`${this._wrap(frontier[0].x)},${this._wrap(frontier[0].y)}`);

        while (frontier.length > 0 && result.length < count) {
            // Sorteia um bloco da fronteira para expandir (isso quebra o formato de quadrado)
            const randomIndex = Math.floor(Math.random() * frontier.length);
            const current = frontier.splice(randomIndex, 1)[0];
            
            result.push(current);

            // Olha os 4 vizinhos adjacentes (Cima, Baixo, Esquerda, Direita)
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
                    // Adiciona na fronteira de crescimento
                    frontier.push(n);
                }
            }
        }
        
        return result;
    }

    /**
     * Exporta o estado do mundo para o SaveSystem
     */
    getFullState() {
        return { 
            tiles: this.modifiedTiles, 
            plants: this.growingPlants,
            worldTime: this.worldTime 
        };
    }

    /**
     * Importa o estado do mundo vindo do Save
     * Limpa resquícios de versões de save antigas.
     */
    applyFullState(stateData) {
        if (stateData) {
            this.modifiedTiles = stateData.tiles || {};
            
            const rawPlants = stateData.plants || {};
            this.growingPlants = {};

            // Compatibilidade e limpeza de Saves antigos
            for (const [key, val] of Object.entries(rawPlants)) {
                if (typeof val === 'number') {
                    // Saves muito antigos onde planta era só um número (timestamp)
                    this.growingPlants[key] = { 
                        time: val, 
                        lastHealTime: Date.now(),
                        owner: null 
                    };
                } else {
                    // Saves novos (Filtra a variável obsoleta isReadyToHeal se ela existir)
                    this.growingPlants[key] = {
                        time: val.time || Date.now(),
                        lastHealTime: val.lastHealTime || Date.now(),
                        owner: val.owner || null
                    };
                }
            }

            // Sincroniza o relógio do save, ou usa o começo do mundo
            this.worldTime = stateData.worldTime || this.START_TIME;
            console.log("[WorldState] Estado do mundo carregado. Relógio sincronizado.");
        }
    }

    /**
     * Reseta completamente o mapa atual
     */
    reset() {
        this.modifiedTiles = {};
        this.growingPlants = {};
        this.worldTime = this.START_TIME;
    }
}
