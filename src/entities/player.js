export class Player {
    constructor(id, nickname, isLocal = false) {
        this.id = id;
        this.nickname = nickname;
        this.isLocal = isLocal;
        
        this.pos = { x: 0, y: 0 };
        this.targetPos = { x: 0, y: 0 };
        this.homeBase = { x: 0, y: 0 }; 
        this.speed = 0.03; // Velocidade base da abelha
        this.currentDir = 'Down';
        
        // --- SISTEMA DE FÍSICA E COMBATE ---
        this.radius = 0.4; // Raio da hitbox circular (em tiles)
        this.pollenDamage = 25; 
        this.attackCooldown = 0; 
        this.attackSpeed = 90; 
        this.isAttacking = false; 

        // --- SISTEMA DE RPG (Sincronizado com SaveSystem) ---
        // Valores iniciais reduzidos para forçar uso da Skill Tree
        this.hp = 65;
        this.maxHp = 65;
        this.pollen = 0;
        this.maxPollen = 35;
        this.level = 1;
        this.xp = 0;
        this.maxXp = 100; 
        this.tilesCured = 0;

        // Atributos de Coleta/Ação
        this.skillPoints = 0; 
        this.collectionRange = 1.5; 
        this.lavaResistance = false; 
        this.passiveRegen = false; 

        // Timers de Feedback Visual
        this.healEffectTimer = 0;
        this.invulnerableTimer = 0;
        this.showRescuePrompt = false;

        // Auxiliares de Frames (Controle de Ação)
        this.collectionFrameCounter = 0;
        this.pollinateFrameCounter = 0;
        
        // NOVO: Velocidade de coleta de pólen (frames). 120 frames ≈ 2 segundos a 60 FPS
        // Pode ser aprimorado via Skill Tree (ex: reduzir para 90, 60 frames)
        this.collectionSpeed = 120; 

        // Estado de Polinização (Toggle)
        this.isPollinatingActive = false;

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
        return `hsl(${Math.abs(hash) % 360}, 85%, 65%)`;
    }

    /**
     * ATUALIZADO: Lógica de Coleta de Pólen
     * Agora usa a velocidade de coleta baseada em tempo (frames) e depende do estado da flor.
     * @param {string} tileType - Tipo do bloco sob a abelha
     * @param {object} worldState - Instância do WorldState para validar e subtrair o pólen da flor
     */
    collectPollen(tileType, worldState) {
        if (tileType !== 'FLOR' || this.pollen >= this.maxPollen || this.hp <= 0 || !worldState) {
            this.collectionFrameCounter = 0;
            return false;
        }

        this.collectionFrameCounter++;
        
        // Quando o contador atinge a velocidade de coleta (ex: 2 segundos)
        if (this.collectionFrameCounter >= this.collectionSpeed) {
            
            // Tenta puxar 1 de pólen fisicamente da flor no mundo
            const extractedAmount = worldState.collectPollenFromFlower(this.pos.x, this.pos.y);
            
            if (extractedAmount > 0) {
                // Sucesso! A flor tinha pólen, então a abelha ganha
                this.pollen += extractedAmount;
                this.collectionFrameCounter = 0;
                return true; 
            } else {
                // Flor está vazia (0 de pólen). O timer reseta, mas a abelha não ganha nada
                this.collectionFrameCounter = 0;
                return false;
            }
        }
        return false;
    }

    /**
     * Lógica de Polinização (Modo Toggle)
     * Chamada pelo Game.js continuamente se o toggle estiver ON
     */
    pollinate(tileType) {
        // Se não for terra queimada, não tiver pólen ou estiver morto, reseta o contador interno
        if (tileType !== 'TERRA_QUEIMADA' || this.pollen <= 0 || this.hp <= 0) {
            this.pollinateFrameCounter = 0;
            return false;
        }

        this.pollinateFrameCounter++;
        
        // Gasta 1 de pólen e converte o tile após 15 frames de sobrevoo
        if (this.pollinateFrameCounter >= 15) {
            this.pollen--;
            this.pollinateFrameCounter = 0;
            return true; 
        }
        return false;
    }

    shootPollen(aimX = 0, aimY = 0) {
        if (this.pollen <= 0 || this.attackCooldown > 0 || this.hp <= 0) return null;

        // Ao atirar, o gasto de pólen é imediato
        this.pollen--; 
        this.attackCooldown = this.attackSpeed;
        this.isAttacking = true;

        let vx = 0;
        let vy = 0;
        const projSpeed = 0.15; 

        if (aimX !== 0 || aimY !== 0) {
            const magnitude = Math.sqrt(aimX * aimX + aimY * aimY);
            vx = (aimX / magnitude) * projSpeed;
            vy = (aimY / magnitude) * projSpeed;
        } else {
            if (this.currentDir.includes('Up')) vy = -projSpeed;
            else if (this.currentDir.includes('Down')) vy = projSpeed;
            else if (this.currentDir.includes('Left')) vx = -projSpeed;
            else if (this.currentDir.includes('Right')) vx = projSpeed;
            else vy = projSpeed;
        }

        return {
            ownerId: this.id,
            x: this.pos.x,
            y: this.pos.y,
            vx: vx, 
            vy: vy,
            damage: this.pollenDamage,
            life: 180 
        };
    }

    resolveCollision(other) {
        if (this.hp <= 0 || other.hp <= 0) return;

        const dx = other.pos.x - this.pos.x;
        const dy = other.pos.y - this.pos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = this.radius + (other.radius || 0.4);

        if (distance < minDistance && distance > 0) {
            const overlap = minDistance - distance;
            const nx = dx / distance;
            const ny = dy / distance;

            const moveX = nx * overlap * 0.5;
            const moveY = ny * overlap * 0.5;

            this.pos.x -= moveX;
            this.pos.y -= moveY;
            other.pos.x += moveX;
            other.pos.y += moveY;
        }
    }

    applyHeal(amount) {
        if (this.hp <= 0) return; 
        this.hp = Math.min(this.maxHp, this.hp + amount);
        this.healEffectTimer = 30;
    }

    setInvulnerable(frames) {
        this.invulnerableTimer = frames;
    }

    update(moveVector, particles) {
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.attackCooldown < this.attackSpeed - 10) this.isAttacking = false;
        if (this.healEffectTimer > 0) this.healEffectTimer--;
        if (this.invulnerableTimer > 0) this.invulnerableTimer--;
        this.showRescuePrompt = false;

        const isMoving = moveVector.x !== 0 || moveVector.y !== 0;

        // Rastro de Pólen: Mais denso se a polinização automática estiver ligada
        if (this.isLocal && this.pollen > 0 && particles) {
            const particleChance = this.isPollinatingActive ? 0.6 : 0.2;
            if (isMoving && Math.random() < particleChance) {
                particles.spawnPollen(this.pos.x, this.pos.y);
            }
        }

        if (this.isLocal) {
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
        this.isPollinatingActive = false;
        if (this.homeBase) {
            this.pos = { ...this.homeBase };
            this.targetPos = { ...this.pos };
        }
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
                tilesCured: this.tilesCured,
                skillPoints: this.skillPoints 
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
            this.hp = data.stats.hp || 65;
            this.maxHp = data.stats.maxHp || 65;
            this.pollen = data.stats.pollen || 0;
            this.maxPollen = data.stats.maxPollen || 35;
            this.tilesCured = data.stats.tilesCured || 0;
            this.skillPoints = data.stats.skillPoints || 0; 
        }
    }

    draw(ctx, cam, canvas, tileSize, remotePlayers = {}, partyMemberIds = [], partyIcon = "", isMobileDevice = false) {
        const sX = (this.pos.x - cam.x) * tileSize + canvas.width / 2;
        const sY = (this.pos.y - cam.y) * tileSize + canvas.height / 2;
        
        const isDead = this.hp <= 0;
        const sprite = isDead ? (this.sprites['Fainted'] || this.sprites['Idle']) : (this.sprites[this.currentDir] || this.sprites['Idle']);
        const zoomScale = tileSize / 32;
        
        const isPartner = Array.isArray(partyMemberIds) ? partyMemberIds.includes(this.id) : this.id === partyMemberIds;

        // Setas indicadoras para parceiros de grupo
        if (this.isLocal && Array.isArray(partyMemberIds) && partyMemberIds.length > 0) {
            partyMemberIds.forEach(memberId => {
                const partner = remotePlayers[memberId];
                if (partner && partner.id !== this.id) {
                    const dx = partner.pos.x - this.pos.x;
                    const dy = partner.pos.y - this.pos.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);

                    if (dist > 5) {
                        const angle = Math.atan2(dy, dx);
                        const orbitRadius = 60 * zoomScale; 
                        const arrowX = sX + Math.cos(angle) * orbitRadius;
                        const arrowY = sY + Math.sin(angle) * orbitRadius;

                        ctx.save();
                        ctx.translate(arrowX, arrowY);
                        ctx.rotate(angle);
                        ctx.fillStyle = partner.color; 
                        ctx.beginPath();
                        ctx.moveTo(10 * zoomScale, 0);
                        ctx.lineTo(-8 * zoomScale, -6 * zoomScale);
                        ctx.lineTo(-8 * zoomScale, 6 * zoomScale);
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();
                    }
                }
            });
        }

        const floatY = isDead ? 0 : Math.sin(Date.now() / 200) * (3 * zoomScale); 
        const drawY = sY - (12 * zoomScale) + floatY;

        // Sombra
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.ellipse(sX, sY + (8 * zoomScale), (isDead ? 12 : 10) * zoomScale, 4 * zoomScale, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(sX, drawY);

        if (this.isAttacking) {
            const recoil = 2 * zoomScale;
            ctx.translate((Math.random()-0.5)*recoil, (Math.random()-0.5)*recoil);
        }

        if (isDead) {
            ctx.rotate(Math.PI / 2);
            ctx.filter = "grayscale(100%) brightness(0.8)"; 
        }
        
        if (sprite.complete && sprite.naturalWidth !== 0) {
            ctx.drawImage(sprite, -tileSize/2, -tileSize/2, tileSize, tileSize);
        } else {
            ctx.fillStyle = isDead ? "gray" : "yellow";
            ctx.beginPath(); ctx.arc(0, 0, 10 * zoomScale, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();

        // Aura visual se a polinização automática estiver ligada
        if (this.isPollinatingActive && !isDead) {
            ctx.save();
            ctx.strokeStyle = "rgba(46, 204, 113, 0.6)";
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2 * zoomScale;
            ctx.beginPath();
            ctx.arc(sX, sY, 22 * zoomScale, Date.now()/200, Date.now()/200 + Math.PI*2);
            ctx.stroke();
            ctx.restore();
        }

        const iconDisplay = (isPartner && partyIcon) ? partyIcon : (isPartner ? "🛡️" : "");
        const nameText = isPartner ? `${iconDisplay} ${this.nickname}` : this.nickname;

        ctx.fillStyle = isDead ? "#999" : this.color; 
        ctx.font = `bold ${12 * zoomScale}px sans-serif`; 
        ctx.textAlign = "center";
        ctx.strokeStyle = "black"; 
        ctx.lineWidth = 3; 
        
        const nickY = drawY - (18 * zoomScale);
        ctx.strokeText(nameText, sX, nickY); 
        ctx.fillText(nameText, sX, nickY);

        if (!this.isLocal || this.hp < this.maxHp) { 
            const barW = 24 * zoomScale;
            const barH = 3 * zoomScale;
            const barY = nickY - (10 * zoomScale);
            ctx.fillStyle = "black";
            ctx.fillRect(sX - barW/2, barY, barW, barH);
            ctx.fillStyle = isPartner ? "#2ecc71" : "#e74c3c";
            ctx.fillRect(sX - barW/2, barY, Math.max(0, barW * (this.hp / this.maxHp)), barH);
        }

        if (this.healEffectTimer > 0) {
            ctx.save();
            ctx.fillStyle = "#2ecc71";
            ctx.font = `bold ${14 * zoomScale}px Arial`;
            ctx.globalAlpha = this.healEffectTimer / 30;
            ctx.fillText("✚", sX, sY - (30 * zoomScale) - (30 - this.healEffectTimer));
            ctx.restore();
        }
    }
}
