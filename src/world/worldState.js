export class WorldState {
    constructor() {
        this.modifiedTiles = {}; 
        this.growingPlants = {}; 
        
        // [NOVO] Define o tamanho do mundo para lógica toroidal (Deve bater com WorldGenerator)
        this.worldSize = 4000;
        
        // NOVO: Define o tempo inicial (01 de Janeiro de 2074, 12:00:00)
        // Usamos timestamp para facilitar o cálculo
        this.worldTime = new Date('2074-02-09T06:00:00').getTime();
    }

    /**
     * [NOVO] Helper para normalizar coordenadas (Mundo Redondo/Toroidal).
     * Garante que 4001 vire 1, e -1 vire 3999.
     */
    _wrap(c) {
        return ((c % this.worldSize) + this.worldSize) % this.worldSize;
    }

    setTile(x, y, type) {
        // Normaliza as coordenadas antes de criar a chave
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;

        // Otimização: Só altera se for diferente
        if (this.modifiedTiles[key] === type) return false;
        
        this.modifiedTiles[key] = type;
        
        // Sincronização automática: Se o tile mudou para FLOR, 
        // marcamos a planta como pronta para curar na lógica interna
        if (type === 'FLOR' && this.growingPlants[key]) {
            this.growingPlants[key].isReadyToHeal = true;
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
     * AGORA ACEITA ownerId PARA SABER QUEM PLANTOU.
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
                isReadyToHeal: false, // Começa como false, só vira true ao virar FLOR
                owner: ownerId 
            };
        }
    }

    /**
     * [NOVO] Reinicia o cronômetro da planta para o momento atual.
     * Soluciona o bug do cooldown da flor.
     */
    resetPlantTimer(x, y) {
        const wx = this._wrap(x);
        const wy = this._wrap(y);
        const key = `${wx},${wy}`;

        if (this.growingPlants[key]) {
            this.growingPlants[key].time = Date.now();
            this.growingPlants[key].lastHealTime = Date.now();
            this.growingPlants[key].isReadyToHeal = false; // Reseta o sinal de prontidão
        } else {
            this.addGrowingPlant(x, y); // Já usa coordenadas normalizadas internamente
        }
    }

    /**
     * Identifica jogadores próximos para cura.
     * Esta função deve ser chamada pelo Host para validar quem recebe a cura.
     * [ATUALIZADO] Suporta lógica toroidal (distância através da borda do mundo).
     */
    getPlayersInHealRange(flowerX, flowerY, players, range = 1.5) {
        const nearbyPlayers = [];
        const fx = this._wrap(flowerX);
        const fy = this._wrap(flowerY);
        const halfWorld = this.worldSize / 2;

        for (const id in players) {
            const p = players[id];
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
            
            if (dx <= range && dy <= range) {
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
     */
    applyFullState(stateData) {
        if (stateData) {
            this.modifiedTiles = stateData.tiles || {};
            
            const rawPlants = stateData.plants || {};
            this.growingPlants = {};

            for (const [key, val] of Object.entries(rawPlants)) {
                if (typeof val === 'number') {
                    this.growingPlants[key] = { 
                        time: val, 
                        lastHealTime: Date.now(),
                        isReadyToHeal: false,
                        owner: null 
                    };
                } else {
                    this.growingPlants[key] = val;
                    // Garante que as propriedades novas existam em saves antigos
                    if (this.growingPlants[key].isReadyToHeal === undefined) {
                        const [x, y] = key.split(',').map(Number);
                        const currentType = this.getModifiedTile(x, y); // Usa a versão que já faz wrap
                        this.growingPlants[key].isReadyToHeal = (currentType === 'FLOR');
                    }
                    if (!this.growingPlants[key].lastHealTime) {
                        this.growingPlants[key].lastHealTime = Date.now();
                    }
                }
            }

            this.worldTime = stateData.worldTime || new Date('2074-01-01T12:00:00').getTime();
            console.log("[WorldState] Estado do mundo carregado.");
        }
    }

    reset() {
        this.modifiedTiles = {};
        this.growingPlants = {};
        this.worldTime = new Date('2074-01-01T12:00:00').getTime();
    }
}
