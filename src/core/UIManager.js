export class UIManager {
    constructor() {
        this.injectGameStyles();
        this.months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
    }

    /**
     * Exibe mensagens de erro/aviso no topo da tela (Toast)
     */
    showError(msg) {
        let toast = document.getElementById('toast-msg');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast-msg';
            // Estilos inline básicos para garantir funcionamento se o CSS falhar
            toast.style.cssText = "position: fixed; top: 10%; left: 50%; transform: translateX(-50%); background: rgba(231, 76, 60, 0.95); color: white; padding: 15px 25px; border-radius: 50px; font-weight: 900; z-index: 9999; box-shadow: 0 5px 20px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; pointer-events: none;";
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.opacity = "1";
        
        if (window.toastTimeout) clearTimeout(window.toastTimeout);
        window.toastTimeout = setTimeout(() => {
            toast.style.opacity = "0";
        }, 3000);
    }

    /**
     * Atualiza as barras de HP, XP e Pólen
     */
    updateHUD(localPlayer) {
        if (!localPlayer) return;

        document.getElementById('hud-name').innerText = localPlayer.nickname;
        document.getElementById('hud-lvl').innerText = localPlayer.level;

        // HP
        document.getElementById('bar-hp-fill').style.width = `${(localPlayer.hp / localPlayer.maxHp) * 100}%`;
        document.getElementById('bar-hp-text').innerText = `${Math.ceil(localPlayer.hp)}/${localPlayer.maxHp}`;

        // XP
        document.getElementById('bar-xp-fill').style.width = `${(localPlayer.xp / localPlayer.maxXp) * 100}%`;
        document.getElementById('bar-xp-text').innerText = `${Math.floor(localPlayer.xp)}/${localPlayer.maxXp}`;

        // Pólen
        document.getElementById('bar-pollen-fill').style.width = `${(localPlayer.pollen / localPlayer.maxPollen) * 100}%`;
        document.getElementById('bar-pollen-text').innerText = `${localPlayer.pollen}/${localPlayer.maxPollen}`;
    }

    /**
     * Atualiza o relógio do jogo e o overlay de dia/noite
     */
    updateEnvironment(worldTime) {
        if (!worldTime) return;
        
        const date = new Date(worldTime);
        const day = String(date.getDate()).padStart(2, '0');
        const month = this.months[date.getMonth()];
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        const timeEl = document.getElementById('hud-time');
        if (timeEl) {
            timeEl.innerText = `${day} ${month} ${year} - ${hours}:${minutes}`;
        }

        // Ciclo Dia/Noite
        const h = date.getHours() + date.getMinutes() / 60;
        // Fórmula de intensidade da escuridão (pico à meia-noite)
        const darknessIntensity = (Math.cos(h / 24 * Math.PI * 2) + 1) / 2;
        
        const overlay = document.getElementById('day-night-overlay');
        if (overlay) {
            overlay.style.opacity = darknessIntensity * 0.85;
        }
    }

    /**
     * Atualiza a tabela de classificação (Ranking)
     */
    updateRanking(guestDataDB, localPlayer, remotePlayers) {
        // Compila dados de todos os jogadores (Offline/Guest + Online)
        let rankingData = Object.entries(guestDataDB).map(([nick, stats]) => ({
            nick: nick,
            score: stats.tilesCured || 0
        }));

        if (localPlayer) {
            const existingLocal = rankingData.find(r => r.nick === localPlayer.nickname);
            if (existingLocal) {
                existingLocal.score = Math.max(existingLocal.score, localPlayer.tilesCured);
            } else {
                rankingData.push({ nick: localPlayer.nickname, score: localPlayer.tilesCured });
            }
        }

        Object.values(remotePlayers).forEach(p => {
            const existing = rankingData.find(r => r.nick === p.nickname);
            if (existing) {
                existing.score = Math.max(existing.score, p.tilesCured);
            } else {
                rankingData.push({ nick: p.nickname, score: p.tilesCured });
            }
        });

        // Ordena do maior para o menor
        rankingData.sort((a, b) => b.score - a.score);
        
        // Renderiza Top 3 (Mini Widget)
        const rankingList = document.getElementById('ranking-list');
        if (rankingList) {
            if (rankingData.length === 0) {
                rankingList.innerHTML = '<div class="rank-item" style="justify-content:center; color:#555">Nenhum dado</div>';
            } else {
                const top3 = rankingData.slice(0, 3);
                rankingList.innerHTML = top3.map((player, index) => {
                    const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : '🥉');
                    const isMe = localPlayer && player.nick === localPlayer.nickname ? 'color:white; font-weight:bold' : '';
                    return `<div class="rank-item" style="${isMe}">
                                <span>${medal} ${player.nick}</span>
                                <b>${player.score}</b>
                            </div>`;
                }).join('');
            }
        }

        // Renderiza Lista Completa (Tela de 'Tab')
        const fullList = document.getElementById('ranking-full-list');
        if (fullList) {
            fullList.innerHTML = rankingData.map((player, index) => {
                const pos = index + 1;
                const isMe = localPlayer && player.nick === localPlayer.nickname ? 'background:rgba(241,196,15,0.1);' : '';
                return `<div class="rank-item" style="padding:10px; border-bottom:1px solid #222; ${isMe}">
                            <span>${pos}º ${player.nick}</span>
                            <b style="color:var(--accent-green)">${player.score} Curas</b>
                        </div>`;
            }).join('');
        }
    }

    /**
     * Atualiza coordenadas na tela (Debug)
     */
    updateCoords(x, y) {
        const el = document.getElementById('hud-coords');
        if(el) el.innerText = `${x}, ${y}`;
    }

    /**
     * Injeta o CSS do jogo
     */
    injectGameStyles() {
        if (document.getElementById('wings-game-styles')) return;
        const style = document.createElement('style');
        style.id = 'wings-game-styles';
        style.innerHTML = `
            :root {
                --primary: #FFD700;
                --accent-green: #2ecc71;
                --danger: #e74c3c;
                --dark-bg: rgba(0, 0, 0, 0.6);
                --glass: rgba(255, 255, 255, 0.15);
            }
            #lobby-overlay {
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                z-index: 10000;
                background-image: url('assets/background_lobby.png');
                background-position: center 30%; 
                background-repeat: no-repeat;
                background-size: cover;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }
            #lobby-overlay::before {
                content: "";
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                background: linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.8) 100%);
                z-index: -1;
                pointer-events: none;
            }
            .main-menu-container {
                display: flex;
                flex-direction: column;
                gap: 20px;
                width: 90%;
                max-width: 350px;
            }
            .main-menu-btn {
                padding: 25px;
                font-size: 18px;
                font-weight: 900;
                text-transform: uppercase;
                color: #2c1e0f;
                background: linear-gradient(to bottom, #FFD700, #F39C12);
                border: 3px solid #fff;
                border-radius: 25px;
                cursor: pointer;
                box-shadow: 0 8px 0 #c77d00, 0 15px 25px rgba(0,0,0,0.4);
                font-family: 'Nunito', sans-serif;
                text-shadow: 1px 1px 0 rgba(255,255,255,0.4);
            }
            .lobby-modal {
                background: rgba(15, 15, 15, 0.9) !important;
                border: 2px solid var(--primary);
                backdrop-filter: blur(15px);
                border-radius: 25px;
                box-shadow: 0 30px 80px rgba(0,0,0,0.8), inset 0 0 30px rgba(255, 215, 0, 0.1);
                width: 90%; max-width: 400px; 
                max-height: 85vh;
                overflow-y: auto;
                padding: 25px;
                color: white;
                display: none;
            }
            .lobby-modal.active { display: block; }
            .lobby-modal input {
                background: rgba(0,0,0,0.4) !important;
                border: 1px solid rgba(255,255,255,0.15) !important;
                color: white !important;
                border-radius: 12px;
                padding: 15px;
            }
            .lobby-modal button.btn-action {
                background: var(--primary) !important;
                color: #2c1e0f !important;
                font-weight: 900;
                text-transform: uppercase;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                padding: 18px;
                border-radius: 18px;
            }
            #hud-time {
                display: block !important;
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(5px);
                padding: 8px 20px;
                border-radius: 20px;
                color: var(--primary);
                font-weight: 900;
                font-size: 14px;
                letter-spacing: 1px;
                z-index: 8000;
                border: 1px solid rgba(255, 215, 0, 0.3);
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                white-space: nowrap;
                pointer-events: none;
            }
            #rpg-hud {
                position: fixed;
                top: 10px;
                left: 10px;
                width: auto;
                max-width: 250px;
                background: transparent !important;
                border: none !important;
                padding: 0 !important;
                display: flex;
                flex-direction: column;
                gap: 5px;
                font-family: 'Segoe UI', sans-serif;
                pointer-events: none; 
                z-index: 5000;
            }
            #hud-info {
                background: var(--dark-bg);
                backdrop-filter: blur(5px);
                padding: 5px 12px;
                border-radius: 15px;
                color: white;
                font-weight: bold;
                display: inline-block;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                margin-bottom: 2px;
                border-left: 3px solid var(--primary);
                font-size: 12px;
            }
            .hud-stat-row {
                display: flex;
                align-items: center;
                gap: 5px;
                background: rgba(0,0,0,0.5);
                padding: 3px 6px;
                border-radius: 8px;
                width: 180px; 
            }
            .hud-icon { width: 18px; text-align: center; font-size: 12px; }
            .hud-bar-bg {
                flex: 1;
                height: 6px;
                background: rgba(255,255,255,0.2);
                border-radius: 3px;
                overflow: hidden;
                position: relative;
            }
            .hud-bar-fill {
                height: 100%;
                border-radius: 3px;
                transition: width 0.3s ease-out;
                box-shadow: 0 0 5px currentColor;
            }
            .hud-text {
                font-size: 9px;
                color: #eee;
                width: 40px;
                text-align: right;
                font-family: monospace;
            }
            #chat-toggle-btn {
                display: flex !important;
                justify-content: center;
                align-items: center;
                position: fixed;
                bottom: 160px; 
                right: 20px; 
                width: 55px;
                height: 55px;
                background: var(--primary) !important;
                border: 3px solid white !important;
                border-radius: 50% !important;
                box-shadow: 0 5px 15px rgba(0,0,0,0.4) !important;
                z-index: 9999 !important; 
                font-size: 24px;
                cursor: pointer;
                opacity: 1 !important;
                visibility: visible !important;
                transition: transform 0.2s;
            }
            #chat-toggle-btn:active { transform: scale(0.9); }
            #btn-skills {
                display: flex !important;
                justify-content: center;
                align-items: center;
                position: fixed;
                top: 150px; 
                left: 10px;
                width: 45px;
                height: 45px;
                background: #8e44ad !important;
                border: 2px solid white !important;
                border-radius: 50% !important;
                box-shadow: 0 5px 15px rgba(0,0,0,0.4) !important;
                z-index: 9000 !important;
                font-size: 20px;
                color: white;
                cursor: pointer;
                transition: transform 0.2s;
            }
            #btn-skills:active { transform: scale(0.9); }
            #toast-msg {
                background: linear-gradient(135deg, #FFD700, #F39C12) !important;
                color: #333 !important;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3) !important;
                border: 2px solid white !important;
            }
            @media (max-width: 600px) {
                #rpg-hud { top: 5px; left: 5px; transform: scale(0.9); transform-origin: top left; }
                #ranking-container { top: 50px; right: 5px; transform: scale(0.8); transform-origin: top right; }
                #hud-time { top: 40px; font-size: 11px; padding: 4px 10px; } 
                #btn-skills { top: 120px; left: 5px; width: 40px; height: 40px; }
                #lobby-overlay { background-position: 50% 20%; }
            }
        `;
        document.head.appendChild(style);
    }
}
