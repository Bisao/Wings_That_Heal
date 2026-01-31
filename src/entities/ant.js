export class Ant {
    constructor(id, x, y, type = 'worker') {
        this.id = id;
        this.x = x;
        this.y = y;
        this.type = type; // 'worker' ou 'soldier'
        
        // Atributos de Combate
        this.hp = type === 'soldier' ? 60 : 30;
        this.maxHp = this.hp;
        this.damage = type === 'soldier' ? 10 : 5;
        this.speed = type === 'soldier' ? 0.04 : 0.035; // Soldados são mais lentos, mas tankam mais
        
        // Física
        this.radius = 0.4; // Tamanho da Hitbox
        this.angle = 0; // Direção que está olhando (em radianos)
        
        // Visual
        this.wobble = Math.random() * 100; // Variação inicial para animação
        this.sprite = new Image();
        this.sprite.src = type === 'soldier' ? 'assets/AntSoldier.png' : 'assets/Ant.png';
        
        // Estado
        this.targetId = null;
    }

    /**
     * Atualiza a IA da formiga.
     * @param {Array} players - Lista de todos os jogadores (locais e remotos)
     */
    update(players) {
        if (this.hp <= 0) return;

        // 1. Encontrar o jogador vivo mais próximo
        let nearest = null;
        let minDist = Infinity;

        players.forEach(p => {
            if (p.hp > 0) { // Só persegue quem está vivo
                const dx = p.pos.x - this.x;
                const dy = p.pos.y - this.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist < minDist && dist < 15) { // Range de detecção (15 tiles)
                    minDist = dist;
                    nearest = p;
                }
            }
        });

        // 2. Movimentação
        if (nearest) {
            this.targetId = nearest.id;
            const dx = nearest.pos.x - this.x;
            const dy = nearest.pos.y - this.y;
            
            // Calcula o ângulo para olhar para o player
            this.angle = Math.atan2(dy, dx);

            // Normaliza o vetor para velocidade constante
            if (minDist > 0.5) { // Para de andar se estiver muito colado (evita tremedeira)
                const moveX = (dx / minDist) * this.speed;
                const moveY = (dy / minDist) * this.speed;

                this.x += moveX;
                this.y += moveY;
            }
        } else {
            // Comportamento Ocioso (Idle): Vagueia levemente ou fica parado
            this.wobble += 0.05;
            // Opcional: Adicionar lógica de patrulha aqui
        }

        // Atualiza animação das pernas
        this.wobble += 0.2;
    }

    draw(ctx, cam, canvas, tileSize) {
        if (this.hp <= 0) return;

        const sX = (this.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.y - cam.y) * tileSize + canvas.height / 2;
        const zoomScale = tileSize / 32;

        // Se estiver fora da tela, não desenha (Otimização)
        if (sX < -50 || sX > canvas.width + 50 || sY < -50 || sY > canvas.height + 50) return;

        ctx.save();
        ctx.translate(sX, sY);
        
        // Rotação baseada no ângulo de movimento (+90 graus porque o sprite geralmente aponta pra cima)
        ctx.rotate(this.angle + Math.PI / 2);

        // Desenha Sprite ou Fallback Procedural
        if (this.sprite.complete && this.sprite.naturalWidth !== 0) {
            const size = (this.type === 'soldier' ? 40 : 32) * zoomScale;
            
            // Efeito de oscilação ao andar (simula passos)
            const walkWobble = Math.sin(this.wobble) * (2 * zoomScale);
            
            ctx.drawImage(this.sprite, -size/2 + walkWobble, -size/2, size, size);
        } else {
            // --- DESENHO PROCEDURAL (Caso a imagem não carregue) ---
            // Corpo
            ctx.fillStyle = this.type === 'soldier' ? "#8B0000" : "#2c3e50"; // Vermelho escuro ou Cinza escuro
            ctx.beginPath();
            ctx.ellipse(0, 0, 8 * zoomScale, 12 * zoomScale, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Cabeça
            ctx.beginPath();
            ctx.arc(0, -10 * zoomScale, 6 * zoomScale, 0, Math.PI * 2);
            ctx.fill();

            // Pernas (Animadas)
            ctx.strokeStyle = "black";
            ctx.lineWidth = 2;
            const legOffset = Math.sin(this.wobble) * 3;
            
            ctx.beginPath();
            // Esq
            ctx.moveTo(-5 * zoomScale, -5 * zoomScale); ctx.lineTo((-12 + legOffset) * zoomScale, -8 * zoomScale);
            ctx.moveTo(-5 * zoomScale, 0); ctx.lineTo((-12 - legOffset) * zoomScale, 0);
            ctx.moveTo(-5 * zoomScale, 5 * zoomScale); ctx.lineTo((-12 + legOffset) * zoomScale, 8 * zoomScale);
            // Dir
            ctx.moveTo(5 * zoomScale, -5 * zoomScale); ctx.lineTo((12 - legOffset) * zoomScale, -8 * zoomScale);
            ctx.moveTo(5 * zoomScale, 0); ctx.lineTo((12 + legOffset) * zoomScale, 0);
            ctx.moveTo(5 * zoomScale, 5 * zoomScale); ctx.lineTo((12 - legOffset) * zoomScale, 8 * zoomScale);
            ctx.stroke();
        }

        ctx.restore();

        // --- BARRA DE VIDA (HP) ---
        // Desenhado após o restore() para não girar junto com a formiga
        if (this.hp < this.maxHp) {
            const barW = 24 * zoomScale;
            const barH = 4 * zoomScale;
            const barY = sY - (25 * zoomScale);

            ctx.fillStyle = "black";
            ctx.fillRect(sX - barW/2, barY, barW, barH);
            
            ctx.fillStyle = "#e74c3c"; // Vermelho
            ctx.fillRect(sX - barW/2, barY, Math.max(0, barW * (this.hp / this.maxHp)), barH);
        }
    }
}
