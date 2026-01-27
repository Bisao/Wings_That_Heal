export class Player {
    constructor(id, nickname, isLocal = false) {
        this.id = id;
        this.nickname = nickname;
        this.isLocal = isLocal;
        
        this.pos = { x: 0, y: 0 };
        this.targetPos = { x: 0, y: 0 };
        this.homeBase = { x: 0, y: 0 }; 
        this.speed = 0.06; 
        this.currentDir = 'Idle';
        
        // --- STATUS RPG ---
        this.hp = 100;
        this.maxHp = 100;
        this.pollen = 0;
        this.maxPollen = 100;
        this.level = 1;
        this.xp = 0;
        this.maxXp = 100; 
        this.tilesCured = 0;
        this.color = this.generateColor(nickname);

        this.sprites = {};
        ['Up', 'Down', 'Left', 'Right', 'Idle', 'LeftIdle', 'RightIdle', 'Fainted'].forEach(d => {
            this.sprites[d] = new Image();
            this.sprites[d].src = `assets/Bee${d}.png`;
        });
    }

    generateColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash) % 360}, 85%, 65%)`;
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
            // INTERPOLAÇÃO PARA PLAYERS REMOTOS
            const dx = this.targetPos.x - this.pos.x;
            const dy = this.targetPos.y - this.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) { // Teleporte se o lag for muito alto
                this.pos.x = this.targetPos.x;
                this.pos.y = this.targetPos.y;
            } else if (dist > 0.01) {
                this.pos.x += dx * 0.15; // Desliza 15% da distância por frame
                this.pos.y += dy * 0.15;
                
                // Atualiza direção visual remota
                if (Math.abs(dx) > Math.abs(dy)) this.currentDir = dx > 0 ? 'Right' : 'Left';
                else this.currentDir = dy > 0 ? 'Down' : 'Up';
            } else {
                if(['Left', 'LeftIdle'].includes(this.currentDir)) this.currentDir = 'LeftIdle';
                else if(['Right', 'RightIdle'].includes(this.currentDir)) this.currentDir = 'RightIdle';
                else this.currentDir = 'Idle';
            }
        }
    }

    respawn() {
        this.hp = this.maxHp;
        this.pollen = 0;
        this.xp = Math.floor(this.xp / 2); 
        this.currentDir = 'Down';
        if (this.homeBase) {
            this.pos = { ...this.homeBase };
            this.targetPos = { ...this.pos };
        }
    }

    serialize() {
        return {
            id: this.id, nickname: this.nickname,
            x: this.pos.x, y: this.pos.y, dir: this.currentDir,
            stats: { level: this.level, hp: this.hp, maxHp: this.maxHp, pollen: this.pollen, maxPollen: this.maxPollen, tilesCured: this.tilesCured }
        };
    }

    deserialize(data) {
        if (!data) return;
        if (!this.isLocal) {
            if (data.x !== undefined) this.targetPos.x = data.x;
            if (data.y !== undefined) this.targetPos.y = data.y;
            if (data.dir) this.currentDir = data.dir;
        }
        if (data.stats) {
            this.level = data.stats.level || this.level;
            this.hp = data.stats.hp !== undefined ? data.stats.hp : this.hp;
            this.maxHp = data.stats.maxHp || this.maxHp;
            this.pollen = data.stats.pollen !== undefined ? data.stats.pollen : this.pollen;
            this.maxPollen = data.stats.maxPollen || this.maxPollen;
            this.tilesCured = data.stats.tilesCured || this.tilesCured;
        }
    }

    draw(ctx, cam, canvas, tileSize, remotePlayers = {}, partyMemberIds = [], partyIcon = "") {
        const sX = (this.pos.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.pos.y - cam.y) * tileSize + canvas.height / 2;
        const isDead = this.hp <= 0;
        const sprite = isDead ? (this.sprites['Fainted'] || this.sprites['Idle']) : (this.sprites[this.currentDir] || this.sprites['Idle']);
        const zoomScale = tileSize / 32;
        const isPartner = partyMemberIds.includes(this.id);

        // BÚSSOLA DE PARCEIROS
        if (this.isLocal && partyMemberIds.length > 0) {
            partyMemberIds.forEach(mId => {
                const p = remotePlayers[mId];
                if (p && p.id !== this.id) {
                    const dx = p.pos.x - this.pos.x, dy = p.pos.y - this.pos.y;
                    if (Math.sqrt(dx*dx + dy*dy) > 6) {
                        const angle = Math.atan2(dy, dx);
                        ctx.save();
                        ctx.translate(sX + Math.cos(angle) * 50 * zoomScale, sY + Math.sin(angle) * 50 * zoomScale);
                        ctx.rotate(angle);
                        ctx.fillStyle = p.color;
                        ctx.beginPath(); ctx.moveTo(10*zoomScale, 0); ctx.lineTo(-5*zoomScale, -5*zoomScale); ctx.lineTo(-5*zoomScale, 5*zoomScale); ctx.fill();
                        ctx.restore();
                    }
                }
            });
        }

        // SOMBRA E BOBBING
        const floatY = isDead ? 0 : Math.sin(Date.now() / 200) * (3 * zoomScale);
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.beginPath(); ctx.ellipse(sX, sY + 8 * zoomScale, 10 * zoomScale, 4 * zoomScale, 0, 0, Math.PI * 2); ctx.fill();

        // SPRITE
        ctx.save();
        ctx.translate(sX, sY - 12 * zoomScale + floatY);
        if (isDead) ctx.rotate(Math.PI / 2);
        if (sprite.complete) ctx.drawImage(sprite, -tileSize/2, -tileSize/2, tileSize, tileSize);
        ctx.restore();

        // UI SOBRE A CABEÇA
        ctx.textAlign = "center"; ctx.font = `bold ${12 * zoomScale}px sans-serif`;
        ctx.strokeStyle = "black"; ctx.lineWidth = 3; ctx.fillStyle = isDead ? "#666" : this.color;
        const nameLabel = isPartner ? `${partyIcon || '🛡️'} ${this.nickname}` : this.nickname;
        ctx.strokeText(nameLabel, sX, sY - 35 * zoomScale);
        ctx.fillText(nameLabel, sX, sY - 35 * zoomScale);

        if (!this.isLocal) {
            ctx.fillStyle = "black"; ctx.fillRect(sX - 15 * zoomScale, sY - 30 * zoomScale, 30 * zoomScale, 4 * zoomScale);
            ctx.fillStyle = isPartner ? "#2ecc71" : "#e74c3c";
            ctx.fillRect(sX - 15 * zoomScale, sY - 30 * zoomScale, (30 * zoomScale) * (this.hp / this.maxHp), 4 * zoomScale);
        }
    }
}
