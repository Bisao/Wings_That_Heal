export class Player {
    constructor(id, nickname, isLocal = false) {
        this.id = id;
        this.nickname = nickname;
        this.isLocal = isLocal;
        
        this.pos = { x: 0, y: 0 };
        this.targetPos = { x: 0, y: 0 };
        this.homeBase = { x: 0, y: 0 }; 
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

        // [NOVO] Controle de efeitos visuais de cura
        this.healEffectTimer = 0;

        // COR ÚNICA: Gera uma cor baseada no nome do jogador
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
        // Gera cor em HSL para garantir que seja brilhante e visível
        return `hsl(${Math.abs(hash) % 360}, 85%, 65%)`;
    }

    /**
     * [NOVO] Método para aplicar cura recebida via Network.
     * Isso garante que convidados processem a cura localmente.
     */
    applyHeal(amount) {
        if (this.hp <= 0) return; // Não cura se estiver desmaiado (opcional)
        
        this.hp = Math.min(this.maxHp, this.hp + amount);
        this.healEffectTimer = 30; // Ativa efeito visual por 30 frames
        
        // Se houver um sistema de som global, você pode disparar aqui
        // if (window.playSound) window.playSound('heal');
    }

    update(moveVector) {
        // Reduz timer de efeito visual
        if (this.healEffectTimer > 0) this.healEffectTimer--;

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
        if (this.homeBase) {
            this.pos = { ...this.homeBase };
            this.targetPos = { ...this.pos };
        }
    }

    serialize() {
        return {
            id: this.id,
            nickname: this.nickname,
            x: this.pos.x,
            y: this.pos.y,
            stats: {
                level: this.level,
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
            this.hp = data.stats.hp || 100;
            this.maxHp = data.stats.maxHp || 100;
            this.pollen = data.stats.pollen || 0;
            this.maxPollen = data.stats.maxPollen || 100;
            this.tilesCured = data.stats.tilesCured || 0;
        }
    }

    // --- RENDERIZAÇÃO ATUALIZADA PARA MULTI-PARTY ---
    draw(ctx, cam, canvas, tileSize, remotePlayers = {}, partyMemberIds = [], partyIcon = "") {
        const sX = (this.pos.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.pos.y - cam.y) * tileSize + canvas.height / 2;
        
        const isDead = this.hp <= 0;
        const sprite = isDead ? (this.sprites['Fainted'] || this.sprites['Idle']) : (this.sprites[this.currentDir] || this.sprites['Idle']);
        const zoomScale = tileSize / 32;
        
        const isPartner = Array.isArray(partyMemberIds) ? partyMemberIds.includes(this.id) : this.id === partyMemberIds;

        // BÚSSOLA DE MULTI-PARTY
        if (this.isLocal && Array.isArray(partyMemberIds) && partyMemberIds.length > 0) {
            partyMemberIds.forEach(memberId => {
                const partner = remotePlayers[memberId];
                if (partner) {
                    const dx = partner.pos.x - this.pos.x;
                    const dy = partner.pos.y - this.pos.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);

                    if (dist > 2) {
                        const angle = Math.atan2(dy, dx);
                        const orbitRadius = 45 * zoomScale; 
                        const arrowX = sX + Math.cos(angle) * orbitRadius;
                        const arrowY = sY + Math.sin(angle) * orbitRadius;

                        ctx.save();
                        ctx.translate(arrowX, arrowY);
                        ctx.rotate(angle);
                        
                        ctx.fillStyle = partner.color; 
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = partner.color;
                        
                        ctx.beginPath();
                        ctx.moveTo(8 * zoomScale, 0);
                        ctx.lineTo(-6 * zoomScale, -6 * zoomScale);
                        ctx.lineTo(-3 * zoomScale, 0);
                        ctx.lineTo(-6 * zoomScale, 6 * zoomScale);
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();
                    }
                }
            });
        }

        // [NOVO] Efeito Visual de Cura (Partículas de Cruz ou Brilho)
        if (this.healEffectTimer > 0) {
            ctx.save();
            ctx.fillStyle = "#2ecc71";
            ctx.font = `${14 * zoomScale}px Arial`;
            ctx.globalAlpha = this.healEffectTimer / 30;
            ctx.fillText("✚", sX + (Math.sin(Date.now()/50)*10), sY - (30 * zoomScale) - (30 - this.healEffectTimer));
            ctx.restore();
        }

        // 1. Balanço (Bobbing)
        const floatY = isDead ? 0 : Math.sin(Date.now() / 200) * (3 * zoomScale); 
        const drawY = sY - (12 * zoomScale) + floatY;

        // 2. Sombra
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.ellipse(sX, sY + (8 * zoomScale), (isDead ? 12 : 10) * zoomScale, 4 * zoomScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // 3. Sprite
        ctx.save();
        ctx.translate(sX, drawY);
        if (isDead) ctx.rotate(Math.PI / 2);
        
        if (sprite.complete && sprite.naturalWidth !== 0) {
            ctx.drawImage(sprite, -tileSize/2, -tileSize/2, tileSize, tileSize);
        } else {
            ctx.fillStyle = isDead ? "gray" : "yellow";
            ctx.beginPath(); ctx.arc(0, 0, 10 * zoomScale, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();

        // 4. Nickname e Party Icon
        const iconDisplay = (isPartner && partyIcon) ? partyIcon : (isPartner ? "🛡️" : "");
        const nameText = isPartner ? `${iconDisplay} ${this.nickname}` : this.nickname;

        ctx.fillStyle = isDead ? "#666" : this.color; 
        
        ctx.font = `bold ${12 * zoomScale}px sans-serif`; 
        ctx.textAlign = "center";
        ctx.strokeStyle = "black"; 
        ctx.lineWidth = 3; 
        
        const nickY = drawY - (20 * zoomScale);
        ctx.strokeText(nameText, sX, nickY); 
        ctx.fillText(nameText, sX, nickY);

        // Barra de HP
        if (!this.isLocal || this.hp < this.maxHp) { // Mostra barra se não for local ou se estiver ferido
            const barW = 30 * zoomScale;
            const barH = 4 * zoomScale;
            const barY = nickY - (12 * zoomScale);
            ctx.fillStyle = "black";
            ctx.fillRect(sX - barW/2, barY, barW, barH);
            ctx.fillStyle = isPartner ? "#2ecc71" : "#e74c3c";
            ctx.fillRect(sX - barW/2, barY, Math.max(0, barW * (this.hp / this.maxHp)), barH);
        }

        // Alerta de Resgate Ativo
        if (isPartner && isDead) {
            const pulse = Math.abs(Math.sin(Date.now() / 300));
            ctx.font = `bold ${11 * zoomScale}px sans-serif`;
            ctx.fillStyle = `rgba(46, 204, 113, ${0.5 + pulse * 0.5})`;
            ctx.strokeText("🆘 RESGATE!", sX, nickY - (25 * zoomScale));
            ctx.fillText("🆘 RESGATE!", sX, nickY - (25 * zoomScale));
        }
    }
}
