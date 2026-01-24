// src/entities/player.js

export class Player {
    constructor(id, nickname, isLocal = false) {
        this.id = id;
        this.nickname = nickname;
        this.isLocal = isLocal;
        this.pos = { x: 0, y: 0 };
        this.targetPos = { x: 0, y: 0 };
        this.speed = 0.15;
        this.currentDir = 'Down'; // Direção padrão
        this.isMoving = false;
        
        // Carregamento de Sprites
        this.sprites = {};
        this.loadSprites();
    }

    loadSprites() {
        const directions = ['Up', 'Down', 'Left', 'Right', 'LeftIdle', 'RightIdle', 'Idle'];
        directions.forEach(dir => {
            const img = new Image();
            img.src = `assets/Bee${dir}.png`;
            this.sprites[dir] = img;
        });
    }

    update(moveVector) {
        if (this.isLocal) {
            this.isMoving = (moveVector.x !== 0 || moveVector.y !== 0);
            if (this.isMoving) {
                if (Math.abs(moveVector.x) > Math.abs(moveVector.y)) {
                    this.currentDir = moveVector.x > 0 ? 'Right' : 'Left';
                } else {
                    this.currentDir = moveVector.y > 0 ? 'Down' : 'Up';
                }
            } else {
                // Lógica simples para Idle
                if (this.currentDir === 'Left') this.currentDir = 'LeftIdle';
                if (this.currentDir === 'Right') this.currentDir = 'RightIdle';
                if (this.currentDir === 'Down' || this.currentDir === 'Up') this.currentDir = 'Idle';
            }
        } else {
            // Suavização para players remotos
            this.pos.x += (this.targetPos.x - this.pos.x) * 0.2;
            this.pos.y += (this.targetPos.y - this.pos.y) * 0.2;
        }
    }

    draw(ctx, cam, canvas, tileSize) {
        const sX = (this.pos.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.pos.y - cam.y) * tileSize + canvas.height / 2;

        const sprite = this.sprites[this.currentDir] || this.sprites['Idle'];
        
        if (sprite.complete) {
            // Desenha a abelha (centralizada no tile)
            ctx.drawImage(sprite, sX - tileSize/2, sY - tileSize/2, tileSize, tileSize);
        } else {
            // Fallback caso a imagem não carregue
            ctx.fillStyle = "yellow";
            ctx.beginPath();
            ctx.arc(sX, sY, 12, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(this.nickname, sX, sY - 25);
    }
}
