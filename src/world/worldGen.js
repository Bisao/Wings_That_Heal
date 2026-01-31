export class WorldGenerator {
    constructor(seed) {
        this.seedVal = this.hashSeed(seed);
        
        // Configurações do Mundo
        this.chunkSize = 16;
        this.tileSize = 32;
        this.worldSize = 4000; // Tamanho do mundo finito (4000x4000 tiles)
        
        // Inicializa o Perlin Noise com a Seed
        this.perm = new Uint8Array(512);
        this.p = new Uint8Array(256);
        this.initNoise(this.seedVal);

        this.hives = []; // Lista de coordenadas {x, y} das colmeias
        this.generateHives();
    }

    hashSeed(s) {
        let h = 0;
        for(let i=0; i<s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        return h;
    }

    // --- IMPLEMENTAÇÃO DE PERLIN NOISE (2D) ---
    initNoise(seed) {
        for (let i = 0; i < 256; i++) {
            this.p[i] = i;
        }
        
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
        const AA = this.perm[A];
        const AB = this.perm[A + 1];
        const B = this.perm[X + 1] + Y;
        const BA = this.perm[B];
        const BB = this.perm[B + 1];

        return this.lerp(v, 
            this.lerp(u, this.grad(this.perm[AA], x, y), this.grad(this.perm[BA], x - 1, y)),
            this.lerp(u, this.grad(this.perm[AB], x, y - 1), this.grad(this.perm[BB], x - 1, y - 1))
        );
    }

    // [NOVO] Ruído Fractal (Soma de oitavas para irregularidade)
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

    random(salt) {
        const x = Math.sin(this.seedVal + salt) * 10000;
        return x - Math.floor(x);
    }

    generateHives() {
        this.hives.push({ x: 0, y: 0 }); // Colmeia Central (Spawn Principal)
        let attempts = 0;
        
        while (this.hives.length < 8 && attempts < 2000) {
            attempts++;
            const angle = this.random(attempts) * Math.PI * 2;
            const dist = 60 + (this.random(attempts + 100) * 400); 
            
            const px = Math.round(Math.cos(angle) * dist);
            const py = Math.round(Math.sin(angle) * dist);

            let tooClose = false;
            for (let h of this.hives) {
                const d = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
                if (d < 80) { tooClose = true; break; } 
            }

            if (!tooClose) this.hives.push({ x: px, y: py });
        }
        console.log(`[WorldGen] ${this.hives.length} colmeias geradas. Seed: ${this.seedVal}`);
    }

    getTileAt(x, y) {
        // 1. MUNDO FINITO (TOROIDAL)
        let wx = ((x % this.worldSize) + this.worldSize) % this.worldSize;
        let wy = ((y % this.worldSize) + this.worldSize) % this.worldSize;

        // 2. ESTRUTURAS FIXAS (COLMEIAS e SAFE ZONES)
        for (let h of this.hives) {
            if (h.x === x && h.y === y) return 'COLMEIA';
            // Garante uma flor perto da colmeia para testes/cura inicial
            if (x === h.x + 2 && y === h.y + 2) return 'FLOR';
            
            const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
            if (dist <= 6.0) return 'GRAMA_SAFE'; // Área segura um pouco maior
        }

        // 3. GERAÇÃO PROCEDURAL IRREGULAR (FRACTAL)
        // Usamos scale menor para formas grandes, e octaves=4 para as bordas rugosas
        const scale = 0.03; 
        const noiseVal = this.fractalNoise(wx * scale, wy * scale, 4, 0.5);

        // Biomas Hostis mais orgânicos
        const distFromCenter = Math.sqrt(x*x + y*y);
        
        // Lava agora aparece em formas irregulares ("manchas" ou "rios" quebrados)
        // Isso cria perigos naturais e paredes para o combate
        if (noiseVal > 0.45 && distFromCenter > 25) {
            return 'LAVA'; 
        }
        
        // Padrão: Terra Queimada (onde inimigos podem spawnar)
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
