export class WorldState {
    constructor() {
        this.modifiedTiles = {}; 
        this.growingPlants = {}; 
    }

    setTile(x, y, type) {
        const key = `${x},${y}`;
        // Otimização: Só altera se for diferente
        if (this.modifiedTiles[key] === type) return false;
        
        this.modifiedTiles[key] = type;
        return true;
    }

    getModifiedTile(x, y) {
        return this.modifiedTiles[`${x},${y}`] || null;
    }

    /**
     * Adiciona uma planta em crescimento.
     * AGORA ACEITA ownerId PARA SABER QUEM PLANTOU.
     */
    addGrowingPlant(x, y, ownerId = null) {
        const key = `${x},${y}`;
        // Só adiciona se não existir
        if (!this.growingPlants[key]) {
            this.growingPlants[key] = {
                time: Date.now(),
                owner: ownerId // Salva o ID do player dono para pontuação futura
            };
        }
    }

    /**
     * [NOVO] Reinicia o cronômetro da planta para o momento atual.
     * Soluciona o bug do cooldown da flor.
     */
    resetPlantTimer(x, y) {
        const key = `${x},${y}`;
        if (this.growingPlants[key]) {
            this.growingPlants[key].time = Date.now();
        } else {
            // Se por acaso a planta não estiver na lista (ex: bug de sync), adiciona agora
            this.addGrowingPlant(x, y);
        }
    }

    removeGrowingPlant(x, y) {
        delete this.growingPlants[`${x},${y}`];
    }

    /**
     * Exporta o estado do mundo para o SaveSystem
     */
    getFullState() {
        return { 
            tiles: this.modifiedTiles, 
            plants: this.growingPlants 
        };
    }

    /**
     * Importa o estado do mundo vindo do Save
     */
    applyFullState(stateData) {
        if (stateData) {
            this.modifiedTiles = stateData.tiles || {};
            
            // Lógica de Migração para garantir compatibilidade com saves antigos
            const rawPlants = stateData.plants || {};
            this.growingPlants = {};

            for (const [key, val] of Object.entries(rawPlants)) {
                if (typeof val === 'number') {
                    // Save Antigo (era só timestamp): Converte para novo formato sem dono
                    this.growingPlants[key] = { time: val, owner: null };
                } else {
                    // Save Novo (já é objeto): Mantém
                    this.growingPlants[key] = val;
                }
            }
            
            console.log("[WorldState] Estado do mundo carregado.");
        }
    }

    /**
     * Limpa o estado (Útil para 'Sair para o Menu')
     */
    reset() {
        this.modifiedTiles = {};
        this.growingPlants = {};
    }
}
