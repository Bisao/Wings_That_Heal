export class WorldGenerator {
    constructor(seed) {
        // Converte a string da seed (ex: "FLORESTA") em um número usável
        this.seedVal = this.hashSeed(seed);
        this.chunkSize = 16; // Tamanho do pedaço de mapa renderizado
        this.tileSize = 32;  // Tamanho visual de cada bloco (apenas referência)
        this.hives = [];     // Lista de coordenadas {x, y} das colmeias
        
        // Gera as posições das colmeias imediatamente
        this.generateHives();
    }

    /**
     * Transforma string em número inteiro único (Hash)
     */
    hashSeed(s) {
        let h = 0;
        for(let i = 0; i < s.length; i++) {
            h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        }
        return h;
    }

    /**
     * Gerador de números pseudo-aleatórios determinístico.
     * Sempre retorna o mesmo número para a mesma entrada (salt).
     */
    random(salt) {
        const x = Math.sin(this.seedVal + salt) * 10000;
        return x - Math.floor(x);
    }

    generateHives() {
        // Colmeia 0 (Sempre na origem 0,0 para o Host nascer seguro)
        this.hives.push({ x: 0, y: 0 });

        let attempts = 0;
        // Tenta gerar outras 7 colmeias espalhadas pelo mundo
        while (this.hives.length < 8 && attempts < 2000) {
            attempts++;
            // Usa o gerador determinístico
            const angle = this.random(attempts) * Math.PI * 2;
            const dist = 40 + (this.random(attempts + 100) * 260); // Distância entre 40 e 300 blocos
            
            const px = Math.round(Math.cos(angle) * dist);
            const py = Math.round(Math.sin(angle) * dist);

            // Verifica se não está muito perto de outra colmeia
            let tooClose = false;
            for (let h of this.hives) {
                const d = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
                if (d < 50) { tooClose = true; break; }
            }

            if (!tooClose) this.hives.push({ x: px, y: py });
        }
        console.log(`[WorldGen] Mundo gerado com ${this.hives.length} colmeias.`);
    }

    /**
     * Define qual o tipo de terreno em uma coordenada X, Y específica.
     */
    getTileAt(x, y) {
        for (let h of this.hives) {
            // 1. O Centro da colmeia é o bloco 'COLMEIA' (Cura rápida)
            if (h.x === x && h.y === y) return 'COLMEIA';
            
            // 2. FLOR INICIAL (Recurso garantido perto da base)
            if (x === h.x + 2 && y === h.y + 2) return 'FLOR';

            // 3. ÁREA SEGURA (Grama ao redor da colmeia)
            const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
            if (dist <= 3.2) return 'GRAMA_SAFE';
        }

        // 4. O resto do mundo é perigoso
        return 'TERRA_QUEIMADA';
    }

    /**
     * Retorna um array de tiles para desenhar na tela (Otimização de render)
     */
    getChunk(cX, cY) {
        let tiles = [];
        for(let y=0; y<this.chunkSize; y++) {
            for(let x=0; x<this.chunkSize; x++) {
                let wX = cX * this.chunkSize + x;
                let wY = cY * this.chunkSize + y;
                tiles.push({ 
                    x: wX, 
                    y: wY, 
                    type: this.getTileAt(wX, wY) 
                });
            }
        }
        return tiles;
    }

    getHiveLocations() {
        return this.hives;
    }
}
