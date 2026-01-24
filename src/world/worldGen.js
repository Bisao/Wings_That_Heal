export class WorldGenerator {
    constructor(seed) {
        this.seed = this.hashSeed(seed);
        this.chunkSize = 16;
        this.tileSize = 32;
    }

    hashSeed(s) {
        let h = 0;
        for(let i=0; i<s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        return h;
    }

    noise(x, y) {
        const n = Math.sin(x * 12.9 + y * 78.2 + this.seed) * 43758.5;
        return n - Math.floor(n);
    }

    getTileAt(x, y) {
        const dist = Math.sqrt(x*x + y*y);
        if (x === 0 && y === 0) return 'COLMEIA';
        if (dist < 3) return 'GRAMA';
        const val = this.noise(x, y);
        if (val > 0.97) return 'FLOR_POLEM';
        return 'TERRA_QUEIMADA';
    }

    getChunk(cX, cY) {
        let tiles = [];
        for(let y=0; y<this.chunkSize; y++) {
            for(let x=0; x<this.chunkSize; x++) {
                let wX = cX * this.chunkSize + x;
                let wY = cY * this.chunkSize + y;
                tiles.push({ x: wX, y: wY, type: this.getTileAt(wX, wY) });
            }
        }
        return tiles;
    }
}
