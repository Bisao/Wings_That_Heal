export class Player {
    constructor(id, nickname, isLocal = false) {
        this.id = id;
        this.nickname = nickname;
        this.isLocal = isLocal;
        this.pos = { x: 0, y: 0 };
        this.targetPos = { x: 0, y: 0 };
        this.speed = 0.15;
        this.currentDir = 'Down';
        this.pollen = 0; // Inventário

        // Carregar Sprites
        this.sprites = {};
        const dirs = ['Up', 'Down', 'Left', 'Right', 'Idle', 'LeftIdle', 'RightIdle'];
        dirs.forEach(d => {
            this.sprites[d] = new Image();
            this.sprites[d].src = `assets/Bee${d}.png`;
        });
    }

    update(moveVector) {
        if (this.isLocal) {
            const isMoving = moveVector.x !== 0 || moveVector.y !== 0;
            if (isMoving) {
                if (Math.abs(moveVector.x) > Math.abs(moveVector.y)) {
                    this.currentDir = moveVector.x > 0 ? 'Right' : 'Left';
                } else {
                    this.currentDir = moveVector.y > 0 ? 'Down' : 'Up';
                }
            } else {
                // Estados de Idle
                if(this.currentDir === 'Left') this.currentDir = 'LeftIdle';
                if(this.currentDir === 'Right') this.currentDir = 'RightIdle';
                if(this.currentDir === 'Up' || this.currentDir === 'Down') this.currentDir = 'Idle';
            }
        } else {
            // Interpolação para suavizar lag
            this.pos.x += (this.targetPos.x - this.pos.x) * 0.2;
            this.pos.y += (this.targetPos.y - this.pos.y) * 0.2;
        }
    }

    draw(ctx, cam, canvas, tileSize) {
        const sX = (this.pos.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.pos.y - cam.y) * tileSize + canvas.height / 2;

        const sprite = this.sprites[this.currentDir] || this.sprites['Idle'];

        if (sprite.complete && sprite.naturalWidth !== 0) {
            ctx.drawImage(sprite, sX - tileSize/2, sY - tileSize/2, tileSize, tileSize);
        } else {
            // Fallback (bolinha amarela) se imagem falhar
            ctx.fillStyle = "yellow";
            ctx.beginPath();
            ctx.arc(sX, sY, 10, 0, Math.PI*2);
            ctx.fill();
        }

        // Nome
        ctx.fillStyle = "white";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.strokeText(this.nickname, sX, sY - 20);
        ctx.fillText(this.nickname, sX, sY - 20);
    }
}
