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
        // Gera uma tabela de permutação baseada na seed
        for (let i = 0; i < 256; i++) {
            this.p[i] = i;
        }
        
        // Embaralha usando a seed (LCG simples)
        let state = seed;
        for (let i = 255; i > 0; i--) {
            state = Math.imul(1664525, state) + 1013904223 | 0;
            const j = Math.abs(state) % (i + 1);
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }

        // Duplica para evitar overflow na busca
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
        // Encontra o quadrado unitário que contém o ponto
        let X = Math.floor(x) & 255;
        let Y = Math.floor(y) & 255;
        
        // Coordenadas relativas dentro do quadrado
        x -= Math.floor(x);
        y -= Math.floor(y);
        
        const u = this.fade(x);
        const v = this.fade(y);
        
        // Hash das coordenadas dos 4 cantos do quadrado
        const A = this.perm[X] + Y;
        const AA = this.perm[A];
        const AB = this.perm[A + 1];
        const B = this.perm[X + 1] + Y;
        const BA = this.perm[B];
        const BB = this.perm[B + 1];

        // Interpolação
        return this.lerp(v, 
            this.lerp(u, this.grad(this.perm[AA], x, y), this.grad(this.perm[BA], x - 1, y)),
            this.lerp(u, this.grad(this.perm[AB], x, y - 1), this.grad(this.perm[BB], x - 1, y - 1))
        );
    }

    // Pseudo-random determinístico auxiliar para as colmeias
    random(salt) {
        const x = Math.sin(this.seedVal + salt) * 10000;
        return x - Math.floor(x);
    }

    generateHives() {
        // Colmeia 0 (Sempre na origem para o Host)
        this.hives.push({ x: 0, y: 0 });

        let attempts = 0;
        // Geramos as outras colmeias espalhadas pelo mundo finito
        while (this.hives.length < 8 && attempts < 2000) {
            attempts++;
            const angle = this.random(attempts) * Math.PI * 2;
            
            // Distância variada, mas mantendo dentro de um raio jogável inicial
            const dist = 60 + (this.random(attempts + 100) * 400); 
            
            const px = Math.round(Math.cos(angle) * dist);
            const py = Math.round(Math.sin(angle) * dist);

            // Garante que a colmeia respeite o mundo toroidal (opcional na geração, mas bom para consistência)
            // Aqui mantemos coordenadas brutas para facilitar o cálculo de distância linear inicial

            let tooClose = false;
            for (let h of this.hives) {
                const d = Math.sqrt(Math.pow(px - h.x, 2) + Math.pow(py - h.y, 2));
                if (d < 80) { tooClose = true; break; } // Aumentei a distância mínima
            }

            if (!tooClose) this.hives.push({ x: px, y: py });
        }
        console.log(`[WorldGen] ${this.hives.length} colmeias geradas. Seed: ${this.seedVal}`);
    }

    /**
     * Determina o tipo de tile em uma coordenada específica do mundo.
     */
    getTileAt(x, y) {
        // 1. LÓGICA DE MUNDO FINITO (TOROIDAL)
        // O operador % cria o loop. Se x=4001, vira 1. Se x=-1, vira 3999.
        let wx = ((x % this.worldSize) + this.worldSize) % this.worldSize;
        let wy = ((y % this.worldSize) + this.worldSize) % this.worldSize;

        // 2. VERIFICAÇÃO DE ESTRUTURAS (SAFE ZONES)
        // Verifica colmeias baseadas nas coordenadas brutas (ou ajustadas se as colmeias fossem fixas no grid toroidal)
        // Para simplificar a jogabilidade local, verificamos a distância direta para as colmeias geradas perto do 0,0
        // Se quiséssemos colmeias em todo o planeta, teríamos que adaptar a geração delas também.
        
        for (let h of this.hives) {
            // A Colmeia em si
            if (h.x === x && h.y === y) return 'COLMEIA';
            
            // A PRIMEIRA FLOR (Recurso Inicial)
            if (x === h.x + 2 && y === h.y + 2) {
                return 'FLOR';
            }

            // ÁREA SEGURA
            const dist = Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2));
            if (dist <= 4.0) { 
                return 'GRAMA_SAFE'; 
            }
        }

        // 3. GERAÇÃO PROCEDURAL DE TERRENO (NOISE)
        // Escala do ruído: quanto menor, mais "largos" são os continentes
        const scale = 0.05; 
        const noiseVal = this.noise(wx * scale, wy * scale);

        // Definição de Biomas Hostis baseada no valor do ruído (-1 a 1)
        
        // LAVA: Lagos de magma que causam dano e bloqueiam caminho
        // Geramos apenas se estiver longe o suficiente da base inicial (0,0) para não spawn kill
        const distFromCenter = Math.sqrt(x*x + y*y);
        
        if (noiseVal > 0.6 && distFromCenter > 20) {
            return 'LAVA'; // Você precisará definir a cor/sprite disto no main.js (ex: vermelho/laranja)
        }

        // VARIAÇÕES DE TERRA QUEIMADA (Puramente estético ou funcional no futuro)
        // Por enquanto, tudo retorna como terra queimada para manter a mecânica de cura
        return 'TERRA_QUEIMADA';
    }

    getChunk(cX, cY) {
        let tiles = [];
        for(let y=0; y<this.chunkSize; y++) {
            for(let x=0; x<this.chunkSize; x++) {
                let wX = cX * this.chunkSize + x;
                let wY = cY * this.chunkSize + y;
                
                // Pega o tile gerado proceduralmente
                let type = this.getTileAt(wX, wY);
                
                tiles.push({ x: wX, y: wY, type: type });
            }
        }
        return tiles;
    }

    getHiveLocations() {
        return this.hives;
    }
}
