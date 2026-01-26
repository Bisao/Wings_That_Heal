export class WorldGenerator {
    constructor(seed) {
        this.seedVal = this.hashSeed(seed);
        this.chunkSize = 16;
        this.tileSize = 32;
        this.hives = []; // Lista de coordenadas {x, y}
        this.generateHives();
    }

    hashSeed(s) {
        let h = 0;
        for(let i=0; i<s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        return h;
    }

    random(salt) {
        const x = Math.sin(this.seedVal + salt) * 10000;
        return x - Math.floor(x);
    }

    generateHives() {
        // Colmeia 0 (Host)
        this.hives.push({ x: 0, y: 0 });

        let attempts = 0;
        while (this.hives.length < 8 && attempts < 2000) {
            attempts++;
            const angle = this.random(attempts) * Math.PI * 2;
            const dist = 40 + (this.random(attempts + 100) * 260);
            
            const px = Math.round(Math.cos(angle) * dist);
            const py = Math.round(Math.sin(angle) * dist);

            let tooClose = false;
            for (let h of this.hives) {
                const d = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
                if (d < 50) { tooClose = true; break; }
            }

            if (!tooClose) this.hives.push({ x: px, y: py });
        }
        console.log(`[WorldGen] ${this.hives.length} colmeias geradas.`);
    }

    getTileAt(x, y) {
        for (let h of this.hives) {
            // Colmeia
            if (h.x === x && h.y === y) return 'COLMEIA';
            
            // Flor Inicial (Posição Fixa)
            if (x === h.x + 2 && y === h.y + 2) return 'FLOR';

            // Área Segura
            const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
            if (dist <= 3.2) return 'GRAMA_SAFE';
        }
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

    getHiveLocations() {
        return this.hives;
    }
}
