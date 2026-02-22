export class Projectile {
    constructor(x, y, vx, vy, ownerId, damage) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.ownerId = ownerId; // ID de quem atirou (para não se acertar)
        this.damage = damage;
        this.life = 60; // Duração em frames (aprox 1 segundo a 60fps)
        this.maxLife = 60; // Referência fixa para calcular o desvanecimento (fade out)
        this.radius = 0.2; // Tamanho da Hitbox (em tiles)
    }

    /**
     * Atualiza a posição do projétil.
     * Retorna false se o tempo de vida acabou (para ser removido do array).
     */
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        
        return this.life > 0;
    }

    draw(ctx, cam, canvas, tileSize) {
        // Conversão de coordenadas do mundo para a tela
        const sX = (this.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.y - cam.y) * tileSize + canvas.height / 2;
        const zoom = tileSize / 32;

        // Otimização: Não desenha se estiver fora da tela
        if (sX < -20 || sX > canvas.width + 20 || sY < -20 || sY > canvas.height + 20) return;

        ctx.save();
        ctx.translate(sX, sY);

        // Calcula a opacidade baseada na vida restante (dá o efeito de se desfazer no ar)
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;

        // Efeito de Brilho (Pólen Energizado)
        ctx.shadowBlur = 8 * alpha; // O brilho também diminui junto com a opacidade
        ctx.shadowColor = "#f1c40f"; // Amarelo brilhante
        ctx.fillStyle = "#f39c12";   // Laranja suave

        // Leve efeito de dispersão: o pólen "espalha" (aumenta de tamanho) um pouquinho antes de sumir
        const spread = 1 + (1 - alpha) * 0.5; 

        // Desenho do corpo principal
        ctx.beginPath();
        ctx.arc(0, 0, 5 * zoom * spread, 0, Math.PI * 2);
        ctx.fill();

        // Núcleo branco para dar sensação de energia
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, 2.5 * zoom * spread, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
