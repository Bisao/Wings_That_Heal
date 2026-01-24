// src/entities/player.js

export class Player {
    constructor(id, nickname, isLocal = false) {
        this.id = id;
        this.nickname = nickname;
        this.isLocal = isLocal;
        this.pos = { x: 0, y: 0 };
        this.targetPos = { x: 0, y: 0 }; // Para suavização (interpolação)
        this.pollen = 0;
        this.speed = 0.15;
    }

    update() {
        if (this.isLocal) {
            // Lógica de entrada de teclado será injetada aqui
        } else {
            // Suaviza o movimento dos outros jogadores (Interpolação Linear)
            this.pos.x += (this.targetPos.x - this.pos.x) * 0.1;
            this.pos.y += (this.targetPos.y - this.pos.y) * 0.1;
        }
    }

    draw(ctx, camera) {
        const screenX = (this.pos.x - camera.x) * 32 + window.innerWidth / 2;
        const screenY = (this.pos.y - camera.y) * 32 + window.innerHeight / 2;

        ctx.fillStyle = this.isLocal ? "yellow" : "orange";
        ctx.beginPath();
        ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = "white";
        ctx.fillText(this.nickname, screenX - 20, screenY - 15);
    }
}
