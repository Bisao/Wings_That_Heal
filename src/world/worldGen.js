export class WorldGenerator {
    constructor(seed) {
        this.seedVal = this.hashSeed(seed);
        this.chunkSize = 16;
        this.tileSize = 32;
        this.hives = []; // Lista de coordenadas {x, y} das colmeias
        this.generateHives();
    }

    hashSeed(s) {
        let h = 0;
        for(let i=0; i<s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        return h;
    }

    // Função pseudo-aleatória determinística baseada na seed do mundo
    // Retorna número entre 0 e 1
    random(salt) {
        const x = Math.sin(this.seedVal + salt) * 10000;
        return x - Math.floor(x);
    }

    generateHives() {
        // A Colmeia 0 é sempre a Central (Base do Host)
        this.hives.push({ x: 0, y: 0 });

        let attempts = 0;
        // Tenta gerar mais 7 colmeias
        while (this.hives.length < 8 && attempts < 2000) {
            attempts++;
            
            // Gera coordenadas aleatórias num raio entre 40 e 300 tiles
            const angle = this.random(attempts) * Math.PI * 2;
            const dist = 40 + (this.random(attempts + 100) * 260);
            
            const px = Math.round(Math.cos(angle) * dist);
            const py = Math.round(Math.sin(angle) * dist);

            // Verifica se está longe o suficiente de todas as outras colmeias
            let tooClose = false;
            for (let h of this.hives) {
                const d = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
                if (d < 50) { // Distância mínima de 50 tiles entre colmeias
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                this.hives.push({ x: px, y: py });
            }
        }
        console.log(`[WorldGen] ${this.hives.length} colmeias geradas.`);
    }

    getTileAt(x, y) {
        // 1. Verifica se é uma Colmeia
        for (let h of this.hives) {
            if (h.x === x && h.y === y) return 'COLMEIA';
            
            // Cria uma área segura de 3 tiles ao redor da colmeia
            const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
            if (dist <= 3) return 'GRAMA_SAFE';
        }

        // 2. Ruído para variações no terreno queimado (Futuro: Pedras, Cinzas)
        // const n = this.noise(x, y);

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

    // Retorna a lista de colmeias para o main.js usar no spawn
    getHiveLocations() {
        return this.hives;
    }
}
