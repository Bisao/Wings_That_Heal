export class ParticleSystem {
    constructor() {
        this.pollenParticles = [];
        this.smokeParticles = [];
        this.sakuraParticles = []; // [NOVO] Partículas da Árvore Mestra
        this.healParticles = [];   // [NOVO] Feedback de cura
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
            speedY: -(Math.random() * 0.03 + 0.01), // Sobe
            wobbleTick: Math.random() * 100,
            wobbleSpeed: Math.random() * 0.05 + 0.02,
            wobbleAmp: 0.01,
            life: Math.random() * 0.6 + 0.4,
            decay: 0.006,
            grayVal: Math.floor(Math.random() * 60)
        });
    }

    /**
     * [NOVO] Cria uma pétala de Sakura caindo suavemente
     * @param {number} x - Posição X no mundo
     * @param {number} y - Posição Y no mundo
     */
    spawnSakuraPetal(x, y) {
        this.sakuraParticles.push({
            wx: x,
            wy: y,
            size: Math.random() * 4 + 3, // Tamanho da pétala
            speedY: Math.random() * 0.01 + 0.005, // Cai bem devagar
            wobbleTick: Math.random() * Math.PI * 2,
            wobbleSpeed: Math.random() * 0.03 + 0.01, // Balanço no vento
            wobbleAmp: 0.02,
            rotation: Math.random() * Math.PI * 2, // Rotação inicial
            rotSpeed: (Math.random() - 0.5) * 0.05, // Girando enquanto cai
            life: 1.0,
            decay: Math.random() * 0.005 + 0.002 // Desaparece lentamente
        });
    }

    /**
     * [NOVO] Cria uma partícula visual de cura (Cruz verde flutuante)
     * @param {number} x - Posição X no mundo
     * @param {number} y - Posição Y no mundo
     */
    spawnHeal(x, y) {
        this.healParticles.push({
            wx: x + (Math.random() * 0.6 - 0.3),
            wy: y + (Math.random() * 0.6 - 0.3),
            size: Math.random() * 6 + 6,
            speedY: -(Math.random() * 0.03 + 0.02), // Sobe rapidamente
            life: 1.0,
            decay: 0.02 // SOME rápido
        });
    }

    /**
     * Atualiza a física de todas as partículas
     */
    update() {
        // Atualiza Pólen
        this.pollenParticles.forEach(p => {
            p.wy += p.speedY; // Cai
            p.life -= 0.02;
        });
        this.pollenParticles = this.pollenParticles.filter(p => p.life > 0);

        // Atualiza Fumaça
        this.smokeParticles.forEach(p => {
            p.wy += p.speedY;
            p.life -= p.decay;
            p.wobbleTick += p.wobbleSpeed;
            p.wx += Math.sin(p.wobbleTick) * p.wobbleAmp;
            if (!p.isEmber) p.size += 0.03; // Fumaça expande
        });
        this.smokeParticles = this.smokeParticles.filter(p => p.life > 0);

        // Atualiza Sakura
        this.sakuraParticles.forEach(p => {
            p.wobbleTick += p.wobbleSpeed;
            p.wx += Math.sin(p.wobbleTick) * p.wobbleAmp; // Movimento de folha caindo (senoide)
            p.wy += p.speedY; // Gravidade
            p.rotation += p.rotSpeed; // Giro
            p.life -= p.decay;
        });
        this.sakuraParticles = this.sakuraParticles.filter(p => p.life > 0);

        // Atualiza Cura
        this.healParticles.forEach(p => {
            p.wy += p.speedY; // Flutua pra cima
            p.life -= p.decay;
        });
        this.healParticles = this.healParticles.filter(p => p.life > 0);
    }

    /**
     * Renderiza as partículas no canvas
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
                ctx.fillStyle = `rgba(231, 76, 60, ${p.life})`; // Laranja/Vermelho
            } else {
                ctx.fillStyle = `rgba(${p.grayVal},${p.grayVal},${p.grayVal},${p.life * 0.4})`;
            }
            ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel);
        });

        // Desenha Pólen
        this.pollenParticles.forEach(p => {
            const psX = (p.wx - cam.x) * rTileSize + canvas.width / 2;
            const psY = (p.wy - cam.y) * rTileSize + canvas.height / 2;
            ctx.fillStyle = `rgba(241,196,15,${p.life})`; // Amarelo
            ctx.fillRect(psX, psY, p.size * zoomLevel, p.size * zoomLevel);
        });

        // Desenha Sakura (Pétalas)
        this.sakuraParticles.forEach(p => {
            const psX = (p.wx - cam.x) * rTileSize + canvas.width / 2;
            const psY = (p.wy - cam.y) * rTileSize + canvas.height / 2;
            
            ctx.save();
            ctx.translate(psX, psY);
            ctx.rotate(p.rotation);
            ctx.fillStyle = `rgba(255, 183, 197, ${p.life})`; // Rosa Sakura clássico
            
            // Desenha um formato mais ovalzinho para parecer uma pétala
            ctx.beginPath();
            ctx.ellipse(0, 0, (p.size * zoomLevel) / 2, p.size * zoomLevel, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Desenha Cura (Cruzinhas verdes)
        this.healParticles.forEach(p => {
            const psX = (p.wx - cam.x) * rTileSize + canvas.width / 2;
            const psY = (p.wy - cam.y) * rTileSize + canvas.height / 2;
            
            ctx.fillStyle = `rgba(46, 204, 113, ${p.life})`; // Verde cura
            ctx.font = `bold ${p.size * zoomLevel}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "#27ae60";
            ctx.shadowBlur = 5;
            ctx.fillText("+", psX, psY);
            ctx.shadowBlur = 0; // reseta
        });
    }
}
