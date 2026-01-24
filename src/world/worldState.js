export class WorldState {
    constructor() {
        this.modifiedTiles = {}; // "x,y": "TIPO"
        this.growingPlants = {}; // "x,y": timestamp_inicio (Apenas Host usa)
    }

    setTile(x, y, type) {
        const key = `${x},${y}`;
        if (this.modifiedTiles[key] === type) return false;
        
        this.modifiedTiles[key] = type;
        return true;
    }

    getModifiedTile(x, y) {
        return this.modifiedTiles[`${x},${y}`] || null;
    }

    // --- MÉTODOS DE SINCRONIZAÇÃO E GROWTH ---
    
    // Registra uma planta para crescer (Host Only)
    addGrowingPlant(x, y) {
        const key = `${x},${y}`;
        // Só registra se já não estiver crescendo
        if (!this.growingPlants[key]) {
            this.growingPlants[key] = Date.now();
        }
    }

    // Remove da lista de crescimento (quando vira adulta)
    removeGrowingPlant(x, y) {
        delete this.growingPlants[`${x},${y}`];
    }

    getFullState() {
        return {
            tiles: this.modifiedTiles,
            plants: this.growingPlants
        };
    }

    applyFullState(stateData) {
        if (stateData) {
            this.modifiedTiles = stateData.tiles || {};
            this.growingPlants = stateData.plants || {};
        }
    }
}
