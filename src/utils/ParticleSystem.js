export class ParticleSystem {
    constructor() {
        this.pollenParticles = [];
        this.smokeParticles = [];
    }

    /**
     * Cria uma partícula de pólen (amarela)
     * @param {number} x - Posição X no mundo
     * @param {number} y - Posição Y no mundo
     */
    spawnPollen(x, y) {
        this.pollenParticles.push({
            wx: x + (Math.random() * 0.4 - 0.2),
            wy: y + (Math.random() * 0.4 - 0.2),
            size: Math.random() * 3 + 2,
            speedY: Math.random() * 0.02 + 0.01,
            life: 1.0
        });
    }

    /**
     * Cria uma partícula de fumaça ou brasa
     * @param {number} tx - Posição X no mundo
     * @param {number} ty - Posição Y no mundo
     */
    spawnSmoke(tx, ty) {
        const isEmber = Math.random() < 0.15;
        this.smokeParticles.push({
            wx: tx + Math.random(),
            wy: ty + Math.random(),
            isEmber: isEmber,
            size: isEmber ? (Math.random() * 3 + 1) : (Math.random() * 5 + 2),
            speedY: -(Math.random() * 0.03 + 0.01),
            wobbleTick: Math.random() * 100,
            wobbleSpeed: Math.random() * 0.05 + 0.02,
            wobbleAmp: 0.01,
            life: Math.random() * 0.6 + 0.4,
            decay: 0.006,
            grayVal: Math.floor(Math.random() * 60)
        });
    }

    /**
     * Atualiza a física de todas as partículas
     */
    update() {
        // Atualiza Pólen
        this.pollenParticles.forEach(p => {
            p.wy += p.speedY;
            p.life -= 0.02;
        });
        this.pollenParticles = this.pollenParticles.filter(p => p.life > 0);

        // Atualiza Fumaça
        this.smokeParticles.forEach(p => {
            p.wy += p.speedY;
            p.life -= p.decay;
            p.wobbleTick += p.wobbleSpeed;
            p.wx += Math.sin(p.wobbleTick) * p.wobbleAmp;
            if (!p.isEmber) p.size += 0.03;
        });
        this.smokeParticles = this.smokeParticles.filter(p => p.life > 0);
    }

    /**
     * Renderiza as partículas
     * @param {CanvasRenderingContext2D} ctx 
     * @param {Object} cam - Câmera {x, y}
     * @param {HTMLCanvasElement} canvas 
     * @param {number} rTileSize - Tamanho real do tile renderizado (world.tileSize * zoomLevel)
     * @param {number} zoomLevel - Nível de zoom atual
     */
    draw(ctx, cam, canvas, rTileSize, zoomLevel) {
        // Desenha Fumaça
        this.smokeParticles.forEach(p => {
            const psX = (p.wx - cam.x) * rTileSize + canvas.width / 2;
            const psY = (p.wy - cam.y) * rTileSize + canvas.height / 2;
            
            if (p.isEmber) {
                ctx.fillStyle = `rgba(231, 76, 60, ${p.life})`;
            } else {
                ctx.fillStyle = `rgba(${p.grayVal},${p.grayVal},${p.grayVal},${p.life * 0.4})`;
            }
            ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel);
        });

        // Desenha Pólen
        this.pollenParticles.forEach(p => {
            const psX = (p.wx - cam.x) * rTileSize + canvas.width / 2;
            const psY = (p.wy - cam.y) * rTileSize + canvas.height / 2;
            ctx.fillStyle = `rgba(241,196,15,${p.life})`;
            ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel);
        });
    }
}
