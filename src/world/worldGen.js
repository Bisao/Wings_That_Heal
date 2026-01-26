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

    random(salt) {
        const x = Math.sin(this.seedVal + salt) * 10000;
        return x - Math.floor(x);
    }

    generateHives() {
        // Colmeia 0 (Sempre na origem para o Host)
        this.hives.push({ x: 0, y: 0 });

        let attempts = 0;
        // Geramos as outras colmeias de forma determinística baseada na Seed
        while (this.hives.length < 8 && attempts < 2000) {
            attempts++;
            const angle = this.random(attempts) * Math.PI * 2;
            const dist = 40 + (this.random(attempts + 100) * 260);
            
            const px = Math.round(Math.cos(angle) * dist);
            const py = Math.round(Math.sin(angle) * dist);

            let tooClose = false;
            for (let h of this.hives) {
                const d = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
                // Evita que uma colmeia nasça em cima da outra
                if (d < 50) { tooClose = true; break; }
            }

            if (!tooClose) this.hives.push({ x: px, y: py });
        }
        console.log(`[WorldGen] ${this.hives.length} colmeias geradas com a Seed: ${this.seedVal}`);
    }

    /**
     * Determina o tipo de tile em uma coordenada específica do mundo.
     * @param {number} x Coordenada X global
     * @param {number} y Coordenada Y global
     */
    getTileAt(x, y) {
        for (let h of this.hives) {
            // 1. A Colmeia em si
            if (h.x === x && h.y === y) return 'COLMEIA';
            
            // 2. A PRIMEIRA FLOR (Recurso Inicial)
            // Agora usamos uma lógica mais robusta: se o tile está a exatamente 2 blocos de distância 
            // na diagonal sudeste e não há colmeia, vira uma FLOR.
            if (x === h.x + 2 && y === h.y + 2) {
                return 'FLOR';
            }

            // 3. ÁREA SEGURA (Grama ao redor da colmeia)
            // Calculamos a distância de Chebyshev ou Euclidiana para criar um círculo/quadrado de segurança
            const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
            if (dist <= 3.2) { 
                // Se cair aqui e não for a flor (já checada acima), é grama segura
                return 'GRAMA_SAFE'; 
            }
        }

        // 4. TERRA QUEIMADA (Resto do mundo infectado)
        return 'TERRA_QUEIMADA';
    }

    /**
     * Gera os tiles de um chunk específico para renderização eficiente.
     * @param {number} cX Índice do Chunk X
     * @param {number} cY Índice do Chunk Y
     */
    getChunk(cX, cY) {
        let tiles = [];
        for(let y=0; y<this.chunkSize; y++) {
            for(let x=0; x<this.chunkSize; x++) {
                let wX = cX * this.chunkSize + x;
                let wY = cY * this.chunkSize + y;
                // Importante: o tipo de tile é determinado pelo estado original do mundo aqui,
                // mas no main.js ele é sobrescrito pelo WorldState (tiles curados)
                tiles.push({ x: wX, y: wY, type: this.getTileAt(wX, wY) });
            }
        }
        return tiles;
    }

    getHiveLocations() {
        return this.hives;
    }
}
