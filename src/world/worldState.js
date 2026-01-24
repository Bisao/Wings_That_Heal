export class WorldState {
    constructor() {
        this.modifiedTiles = {}; // Armazena "x,y": "TIPO"
    }

    setTile(x, y, type) {
        const key = `${x},${y}`;
        // Só retorna true se houve mudança real (evita spam de rede)
        if (this.modifiedTiles[key] === type) return false;
        
        this.modifiedTiles[key] = type;
        return true;
    }

    getModifiedTile(x, y) {
        return this.modifiedTiles[`${x},${y}`] || null;
    }
}
