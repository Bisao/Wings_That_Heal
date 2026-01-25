export class Player {
    constructor(id, nickname, isLocal = false) {
        this.id = id;
        this.nickname = nickname;
        this.isLocal = isLocal;
        
        this.pos = { x: 0, y: 0 };
        this.targetPos = { x: 0, y: 0 };
        this.speed = 0.06; 
        this.currentDir = 'Down';
        
        // --- SISTEMA DE RPG ---
        this.hp = 100;
        this.maxHp = 100;
        
        this.pollen = 0;
        this.maxPollen = 100;

        this.level = 1;
        this.xp = 0;
        this.maxXp = 100; 

        this.tilesCured = 0;

        this.sprites = {};
        ['Up', 'Down', 'Left', 'Right', 'Idle', 'LeftIdle', 'RightIdle'].forEach(d => {
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
                if(this.currentDir === 'Left') this.currentDir = 'LeftIdle';
                else if(this.currentDir === 'Right') this.currentDir = 'RightIdle';
                else if(this.currentDir === 'Up' || this.currentDir === 'Down') this.currentDir = 'Idle';
            }
        } else {
            const dist = Math.sqrt(Math.pow(this.targetPos.x - this.pos.x, 2) + Math.pow(this.targetPos.y - this.pos.y, 2));
            if (dist > 5) {
                this.pos.x = this.targetPos.x;
                this.pos.y = this.targetPos.y;
            } else {
                this.pos.x += (this.targetPos.x - this.pos.x) * 0.2;
                this.pos.y += (this.targetPos.y - this.pos.y) * 0.2;
            }
        }
    }

    respawn() {
        this.hp = this.maxHp;
        this.pollen = 0;
        this.xp = Math.floor(this.xp / 2); 
        this.currentDir = 'Down';
    }

    serialize() {
        return {
            id: this.id,
            nickname: this.nickname,
            x: this.pos.x,
            y: this.pos.y,
            stats: {
                level: this.level,
                xp: this.xp,
                maxXp: this.maxXp,
                hp: this.hp,
                maxHp: this.maxHp,
                pollen: this.pollen,
                maxPollen: this.maxPollen,
                tilesCured: this.tilesCured 
            }
        };
    }

    deserialize(data) {
        if (!data) return;
        if (data.x !== undefined) this.pos.x = data.x;
        if (data.y !== undefined) this.pos.y = data.y;
        if (this.isLocal) this.targetPos = { ...this.pos }; 

        if (data.stats) {
            this.level = data.stats.level || 1;
            this.xp = data.stats.xp || 0;
            this.maxXp = data.stats.maxXp || 100;
            this.hp = data.stats.hp || 100;
            this.maxHp = data.stats.maxHp || 100;
            this.pollen = data.stats.pollen || 0;
            this.maxPollen = data.stats.maxPollen || 100;
            this.tilesCured = data.stats.tilesCured || 0;
        }
    }

    // --- RENDERIZAÇÃO ---
    draw(ctx, cam, canvas, tileSize, partyPartnerId = null) {
        const sX = (this.pos.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.pos.y - cam.y) * tileSize + canvas.height / 2;
        const sprite = this.sprites[this.currentDir] || this.sprites['Idle'];
        const zoomScale = tileSize / 32;

        // Identifica se este player é da party
        const isPartner = this.id === partyPartnerId;

        // 1. Balanço (Bobbing)
        const floatY = Math.sin(Date.now() / 200) * (3 * zoomScale); 
        const drawY = sY - (12 * zoomScale) + floatY;

        // 2. Sombra
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.ellipse(sX, sY + (8 * zoomScale), 10 * zoomScale, 4 * zoomScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // 3. Sprite
        if (sprite.complete && sprite.naturalWidth !== 0) {
            ctx.drawImage(sprite, sX - tileSize/2, drawY - tileSize/2, tileSize, tileSize);
        } else {
            ctx.fillStyle = "yellow";
            ctx.beginPath(); ctx.arc(sX, drawY, 10 * zoomScale, 0, Math.PI*2); ctx.fill();
        }

        // 4. Nickname e Level
        // Se for parceiro, usa cor dourada e adiciona ícone
        const nameText = isPartner ? `[GROUP] ${this.nickname}` : this.nickname;
        ctx.fillStyle = isPartner ? "#f1c40f" : "white"; 
        
        ctx.font = `bold ${12 * zoomScale}px sans-serif`; 
        ctx.textAlign = "center";
        ctx.strokeStyle = "black"; 
        ctx.lineWidth = 3; 
        
        const nickY = drawY - (20 * zoomScale);
        ctx.strokeText(nameText, sX, nickY); 
        ctx.fillText(nameText, sX, nickY);

        // Barra de HP pequena sobre a cabeça (Apenas para outros players)
        if (!this.isLocal) {
            const barW = 30 * zoomScale;
            const barH = 4 * zoomScale;
            const barY = nickY - (12 * zoomScale);
            
            // Fundo
            ctx.fillStyle = "black";
            ctx.fillRect(sX - barW/2, barY, barW, barH);
            // Vida
            ctx.fillStyle = isPartner ? "#2ecc71" : "#e74c3c";
            ctx.fillRect(sX - barW/2, barY, barW * (this.hp / this.maxHp), barH);
        }
    }
}
