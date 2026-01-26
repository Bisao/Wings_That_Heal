export class WorldState {
    constructor() {
        this.modifiedTiles = {}; 
        this.growingPlants = {}; 
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

    addGrowingPlant(x, y, ownerId = null) {
        const key = `${x},${y}`;
        if (!this.growingPlants[key]) {
            this.growingPlants[key] = {
                time: Date.now(),
                owner: ownerId 
            };
        }
    }

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
            
            // Migração de compatibilidade
            const rawPlants = stateData.plants || {};
            this.growingPlants = {};

            for (const [key, val] of Object.entries(rawPlants)) {
                if (typeof val === 'number') {
                    this.growingPlants[key] = { time: val, owner: null };
                } else {
                    this.growingPlants[key] = val;
                }
            }
            console.log("[WorldState] Sincronizado.");
        }
    }

    reset() {
        this.modifiedTiles = {};
        this.growingPlants = {};
    }
}
