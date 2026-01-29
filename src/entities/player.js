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
        
        // [NOVO] Controle de Invulnerabilidade (Escudo pós-ressurreição)
        this.invulnerableTimer = 0;
        
        // [NOVO] Controle visual do prompt de resgate
        this.showRescuePrompt = false;

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
     * [NOVO] Método para aplicar cura recebida via Network ou Onda.
     * Isso garante que convidados processem a cura localmente.
     */
    applyHeal(amount) {
        if (this.hp <= 0) return; // Não cura se estiver desmaiado
        
        this.hp = Math.min(this.maxHp, this.hp + amount);
        this.healEffectTimer = 30; // Ativa efeito visual por 30 frames
    }

    /**
     * [NOVO] Define o estado de invulnerabilidade (Escudo)
     * @param {number} frames - Duração em frames (ex: 180 para 3s)
     */
    setInvulnerable(frames) {
        this.invulnerableTimer = frames;
    }

    update(moveVector) {
        // Reduz timer de efeito visual
        if (this.healEffectTimer > 0) this.healEffectTimer--;
        
        // Reduz timer de invulnerabilidade
        if (this.invulnerableTimer > 0) this.invulnerableTimer--;
        
        // Reseta o prompt a cada frame (o main.js que deve setar como true se estiver perto)
        this.showRescuePrompt = false;

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
            // Lógica de interpolação para jogadores remotos (evita travamentos)
            const dist = Math.sqrt(Math.pow(this.targetPos.x - this.pos.x, 2) + Math.pow(this.targetPos.y - this.pos.y, 2));
            if (dist > 5) {
                // Se estiver muito longe, teletransporta (correção de lag extremo)
                this.pos.x = this.targetPos.x;
                this.pos.y = this.targetPos.y;
            } else {
                // Movimento suave (Lerp)
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
        // Ao renascer na base, também ganha um pouco de escudo
        this.setInvulnerable(180);
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
    draw(ctx, cam, canvas, tileSize, remotePlayers = {}, partyMemberIds = [], partyIcon = "", isMobileDevice = false) {
        const sX = (this.pos.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.pos.y - cam.y) * tileSize + canvas.height / 2;
        
        const isDead = this.hp <= 0;
        const sprite = isDead ? (this.sprites['Fainted'] || this.sprites['Idle']) : (this.sprites[this.currentDir] || this.sprites['Idle']);
        const zoomScale = tileSize / 32;
        
        // Verifica se este player é membro da party (Funciona para Local e Remoto)
        const isPartner = Array.isArray(partyMemberIds) ? partyMemberIds.includes(this.id) : this.id === partyMemberIds;

        // BÚSSOLA DE MULTI-PARTY (Só desenha se for o player local e tiver parceiros)
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
        if (isDead) {
            ctx.rotate(Math.PI / 2);
            ctx.filter = "grayscale(100%) brightness(0.8)"; // Escurece se estiver morto
        }
        
        if (sprite.complete && sprite.naturalWidth !== 0) {
            ctx.drawImage(sprite, -tileSize/2, -tileSize/2, tileSize, tileSize);
        } else {
            ctx.fillStyle = isDead ? "gray" : "yellow";
            ctx.beginPath(); ctx.arc(0, 0, 10 * zoomScale, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();

        // [NOVO] Visual de Imunidade / Escudo (Desenha sobre o sprite)
        if (this.invulnerableTimer > 0) {
            ctx.save();
            ctx.strokeStyle = `rgba(46, 204, 113, ${Math.min(1, this.invulnerableTimer / 30)})`;
            ctx.lineWidth = 3 * zoomScale;
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#2ecc71";
            ctx.beginPath();
            // Raio oscila levemente para dar efeito de energia
            const shieldPulse = Math.sin(Date.now() / 100) * 2;
            ctx.arc(sX, sY, (20 * zoomScale) + shieldPulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 4. Nickname e Party Icon
        // Se for parceiro e tiver ícone definido, usa o ícone. Senão, usa o escudo padrão.
        const iconDisplay = (isPartner && partyIcon) ? partyIcon : (isPartner ? "🛡️" : "");
        const nameText = isPartner ? `${iconDisplay} ${this.nickname}` : this.nickname;

        ctx.fillStyle = isDead ? "#999" : this.color; 
        
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

        // Alerta de Resgate Ativo (SOS)
        if (isPartner && isDead) {
            const pulse = Math.abs(Math.sin(Date.now() / 200)); // Pulso mais rápido
            const floatAlert = Math.sin(Date.now() / 150) * 5; // Movimento vertical
            
            ctx.font = `bold ${12 * zoomScale}px sans-serif`;
            ctx.fillStyle = `rgba(231, 76, 60, ${0.5 + pulse * 0.5})`; // Vermelho alerta
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            
            const alertY = nickY - (30 * zoomScale) + floatAlert;
            ctx.strokeText("🆘 SOS!", sX, alertY);
            ctx.fillText("🆘 SOS!", sX, alertY);
        }

        // [NOVO] Prompt de Interação para Resgate (Tecla E ou Botão Touch)
        if (this.showRescuePrompt) {
            const promptY = sY - (50 * zoomScale);
            const promptPulse = Math.sin(Date.now() / 100) * (2 * zoomScale);
            
            ctx.save();
            ctx.translate(sX, promptY + promptPulse);
            
            // Fundo do botão/tecla
            ctx.fillStyle = "#2ecc71"; // Verde
            ctx.strokeStyle = "white";
            ctx.lineWidth = 3;
            
            if (isMobileDevice) {
                // Desenha Círculo com Cruz (Estilo Botão de Médico)
                ctx.beginPath();
                ctx.arc(0, 0, 18 * zoomScale, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                // Cruz branca
                ctx.fillStyle = "white";
                ctx.fillRect(-5 * zoomScale, -10 * zoomScale, 10 * zoomScale, 20 * zoomScale);
                ctx.fillRect(-10 * zoomScale, -5 * zoomScale, 20 * zoomScale, 10 * zoomScale);
            } else {
                // Desenha Tecla [E]
                const boxS = 30 * zoomScale;
                ctx.fillRect(-boxS/2, -boxS/2, boxS, boxS);
                ctx.strokeRect(-boxS/2, -boxS/2, boxS, boxS);
                
                ctx.fillStyle = "white";
                ctx.font = `bold ${18 * zoomScale}px Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("E", 0, 2 * zoomScale);
            }
            
            // Texto "CURAR" abaixo
            ctx.fillStyle = "white";
            ctx.font = `bold ${10 * zoomScale}px sans-serif`;
            ctx.strokeStyle = "black";
            ctx.lineWidth = 2;
            ctx.strokeText("CURAR", 0, -25 * zoomScale);
            ctx.fillText("CURAR", 0, -25 * zoomScale);
            
            ctx.restore();
        }

        // [ATUALIZADO] Efeito Visual de Cura (Desenhado por último para ficar no topo)
        if (this.healEffectTimer > 0) {
            ctx.save();
            ctx.fillStyle = "#2ecc71";
            ctx.font = `bold ${16 * zoomScale}px Arial`;
            ctx.shadowColor = "black";
            ctx.shadowBlur = 4;
            ctx.globalAlpha = this.healEffectTimer / 30;
            // O texto flutua para cima
            ctx.fillText("✚", sX + (Math.sin(Date.now()/50)*5), sY - (35 * zoomScale) - (30 - this.healEffectTimer));
            ctx.restore();
        }
    }
}
