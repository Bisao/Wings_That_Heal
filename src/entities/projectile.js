export class Projectile {
    constructor(x, y, vx, vy, ownerId, damage) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.ownerId = ownerId; // ID de quem atirou (para não se acertar)
        this.damage = damage;
        this.life = 60; // Duração em frames (aprox 1 segundo a 60fps)
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

        // Efeito de Brilho (Pólen Energizado)
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#f1c40f"; // Amarelo brilhante
        ctx.fillStyle = "#f39c12";   // Laranja suave

        // Desenho do corpo principal
        ctx.beginPath();
        ctx.arc(0, 0, 5 * zoom, 0, Math.PI * 2);
        ctx.fill();

        // Núcleo branco para dar sensação de energia
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, 2.5 * zoom, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
