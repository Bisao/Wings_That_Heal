export class WorldGenerator {
    constructor(seed) {
        // Garante que a seed seja sempre tratada como string para gerar o hash
        this.seedString = seed.toString();
        this.seedVal = this.hashSeed(this.seedString);
        
        // Configurações do Mundo (Sincronizado com WorldState)
        this.chunkSize = 16;
        this.tileSize = 32;
        this.worldSize = 4000; 
        
        // Inicializa o Perlin Noise
        this.perm = new Uint8Array(512);
        this.p = new Uint8Array(256);
        this.initNoise(this.seedVal);

        // Gera as colmeias de forma determinística baseada na Seed
        this.hives = []; 
        this.generateHives();
    }

    /**
     * Gera um hash numérico único a partir da string da seed.
     * Isso garante que "Mundo1" gere sempre o mesmo mapa, e "Mundo2" outro.
     */
    hashSeed(s) {
        let h = 0xdeadbeef;
        for(let i=0; i<s.length; i++) {
            h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
        }
        return ((h ^ h >>> 16) >>> 0);
    }

    // --- PERLIN NOISE & RNG ---
    
    initNoise(seed) {
        for (let i = 0; i < 256; i++) this.p[i] = i;
        
        // Embaralha usando a seed (LCG simples para consistência entre browsers)
        let state = seed;
        for (let i = 255; i > 0; i--) {
            state = Math.imul(1664525, state) + 1013904223 | 0;
            const j = Math.abs(state) % (i + 1);
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }

        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
        }
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y) {
        let X = Math.floor(x) & 255;
        let Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this.fade(x);
        const v = this.fade(y);
        const A = this.perm[X] + Y;
        const B = this.perm[X + 1] + Y;
        return this.lerp(v, 
            this.lerp(u, this.grad(this.perm[this.perm[A]], x, y), this.grad(this.perm[this.perm[B]], x - 1, y)),
            this.lerp(u, this.grad(this.perm[this.perm[A + 1]], x, y - 1), this.grad(this.perm[this.perm[B + 1]], x - 1, y - 1))
        );
    }

    /**
     * Gera números pseudo-aleatórios determinísticos baseados na seed do mundo.
     * @param {number} salt - Um modificador para obter números diferentes na mesma seed.
     */
    random(salt) {
        const x = Math.sin(this.seedVal + salt) * 10000;
        return x - Math.floor(x);
    }

    fractalNoise(x, y, octaves = 4, persistence = 0.5) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        for(let i=0; i<octaves; i++) {
            total += this.noise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / maxValue;
    }

    // --- GERAÇÃO DE MUNDO ---

    generateHives() {
        // Colmeia 0 é sempre no centro (0,0) ou próximo
        this.hives.push({ x: 0, y: 0 }); 
        
        let attempts = 0;
        // Gera até 12 colmeias distribuídas pelo mundo
        while (this.hives.length < 12 && attempts < 2000) {
            attempts++;
            
            // Usa pseudo-aleatoriedade para espalhar
            const angle = this.random(attempts * 1.1) * Math.PI * 2;
            const dist = 100 + (this.random(attempts * 0.7) * (this.worldSize / 2 - 200)); 
            
            const px = Math.round(Math.cos(angle) * dist);
            const py = Math.round(Math.sin(angle) * dist);

            // Verifica distância mínima entre colmeias (evita sobreposição)
            let tooClose = false;
            for (let h of this.hives) {
                const d = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
                if (d < 150) { tooClose = true; break; } 
            }

            if (!tooClose) this.hives.push({ x: px, y: py });
        }
        console.log(`[WorldGen] ${this.hives.length} colmeias geradas para Seed: ${this.seedString}`);
    }

    /**
     * Retorna o tipo de tile em uma coordenada específica.
     * Esta função é determinística: mesma seed + mesmo x,y = mesmo tile.
     */
    getTileAt(x, y) {
        // Lógica Toroidal (Wrap-around)
        let wx = ((x % this.worldSize) + this.worldSize) % this.worldSize;
        let wy = ((y % this.worldSize) + this.worldSize) % this.worldSize;

        // 1. Verifica Estruturas Fixas (Colmeias e Safe Zones)
        for (let h of this.hives) {
            // A Colmeia exata
            if (Math.round(x) === h.x && Math.round(y) === h.y) return 'COLMEIA';
            
            // Flor de teste/tutorial ao lado da colmeia
            if (Math.round(x) === h.x + 2 && Math.round(y) === h.y + 2) return 'FLOR';
            
            // Zona segura (Grama verde ao redor da colmeia)
            const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
            if (dist <= 8.0) return 'GRAMA_SAFE'; 
        }

        // 2. Geração de Terreno Procedural (Ruído Fractal)
        // Scale baixo = formas maiores (continentes)
        const scale = 0.02; 
        const noiseVal = this.fractalNoise(wx * scale, wy * scale, 3, 0.5);

        // 3. Biomas
        
        // Lava: Apenas longe do centro e em áreas de ruído alto
        const distFromCenter = Math.sqrt(x*x + y*y);
        if (noiseVal > 0.60 && distFromCenter > 50) {
            return 'LAVA'; 
        }

        // Padrão do mundo hostil
        return 'TERRA_QUEIMADA';
    }

    getChunk(cX, cY) {
        let tiles = [];
        for(let y=0; y<this.chunkSize; y++) {
            for(let x=0; x<this.chunkSize; x++) {
                // Calcula posição global do tile
                let wX = cX * this.chunkSize + x;
                let wY = cY * this.chunkSize + y;
                
                // Obtém o tipo
                const type = this.getTileAt(wX, wY);
                
                // Otimização: Só enviamos tiles que NÃO sejam Terra Queimada (padrão)
                // ou enviamos tudo se for necessário desenhar o grid completo
                tiles.push({ x: wX, y: wY, type: type });
            }
        }
        return tiles;
    }

    getHiveLocations() {
        return this.hives;
    }
}
