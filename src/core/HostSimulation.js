import { Ant } from '../entities/ant.js';
import { WaveEffect } from '../entities/WaveEffect.js';

export class HostSimulation {
    constructor(world, worldState, net) {
        this.world = world;
        this.worldState = worldState;
        this.net = net;

        this.hiveWaveTick = 0;
        this.enemySpawnTick = 0;
        this.simulationInterval = null;

        // Constantes de Simulação
        this.GROWTH_TIMES = { BROTO: 5000, MUDA: 10000, FLOR: 15000 };
        this.FLOWER_COOLDOWN_TIME = 10000;
        this.XP_PASSIVE_CURE = 5;
    }

    /**
     * Inicia o loop de simulação do Host
     * @param {Object} refs - Referências para objetos do jogo (enemies, players, callbacks, etc)
     */
    start(refs) {
        if (this.simulationInterval) clearInterval(this.simulationInterval);

        this.simulationInterval = setInterval(() => {
            this.update(refs);
        }, 1000); // Roda a cada 1 segundo
    }

    stop() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }
    }

    update(refs) {
        const { 
            localPlayer, remotePlayers, enemies, activeWaves, 
            hiveRegistry, guestDataDB, 
            fnChangeTile, fnSaveProgress, fnGainXp 
        } = refs;

        // 1. Passagem de Tempo
        this.worldState.worldTime += 60000; // +1 minuto por tick
        this.net.sendPayload({ type: 'TIME_SYNC', time: this.worldState.worldTime });

        let changed = false;
        const now = Date.now();

        // 2. Ondas da Colmeia Naturais (Ondas passivas do mapa)
        this.hiveWaveTick++;
        if (this.hiveWaveTick >= 3) {
            this.hiveWaveTick = 0;
            const hives = this.world.getHiveLocations();
            hives.forEach(h => {
                this.net.sendPayload({ type: 'WAVE_SPAWN', x: h.x, y: h.y, radius: 4.0, color: "rgba(241, 196, 15, ALPHA)", amount: 5 });
                activeWaves.push(new WaveEffect(h.x, h.y, 4.0, "rgba(241, 196, 15, ALPHA)", 5));
            });
        }

        // 3. Spawn de Inimigos (A cada 10 segundos)
        this.enemySpawnTick++;
        if (this.enemySpawnTick >= 10) {
            this.enemySpawnTick = 0;
            const players = [localPlayer, ...Object.values(remotePlayers)];
            
            // Escolhe um jogador aleatório para ser o alvo do spawn
            if (players.length > 0) {
                const target = players[Math.floor(Math.random() * players.length)];
                
                // Tenta spawnar inimigos perto dele (GARANTIA DE NÃO SPAWNAR NA BASE)
                for(let i=0; i<5; i++) {
                    let spawnX = target.pos.x + (Math.random() * 30 - 15);
                    let spawnY = target.pos.y + (Math.random() * 30 - 15);
                    
                    const distToPlayer = Math.sqrt(Math.pow(spawnX - target.pos.x, 2) + Math.pow(spawnY - target.pos.y, 2));
                    const tile = this.worldState.getModifiedTile(Math.round(spawnX), Math.round(spawnY)) || this.world.getTileAt(Math.round(spawnX), Math.round(spawnY));
                    
                    // Só nasce em Terra Queimada e a pelo menos 10 blocos de distância
                    if (tile === 'TERRA_QUEIMADA' && distToPlayer > 10) {
                        const groupSize = 2 + Math.floor(Math.random() * 3);
                        for(let j=0; j < groupSize; j++) {
                            const enemyId = `ant_${Date.now()}_${j}`;
                            const ox = spawnX + (Math.random() * 2 - 1);
                            const oy = spawnY + (Math.random() * 2 - 1);
                            
                            enemies.push(new Ant(enemyId, ox, oy, 'worker'));
                            this.net.sendPayload({ type: 'SPAWN_ENEMY', id: enemyId, x: ox, y: oy, type: 'worker' });
                        }
                        break;
                    }
                }
            }
        }

        // 4. Registro de Spawn Points para novos jogadores
        Object.values(remotePlayers).forEach(p => {
            if (p.nickname && hiveRegistry[p.nickname] === undefined) {
                const usedIndices = Object.values(hiveRegistry);
                for(let i=1; i<8; i++) {
                    if (!usedIndices.includes(i)) {
                        hiveRegistry[p.nickname] = i;
                        break;
                    }
                }
            }
        });

        // 5. Crescimento de Plantas e Cura (LÓGICA GLOBAL DE CURA APLICADA)
        for (const [key, rawData] of Object.entries(this.worldState.growingPlants)) {
            // Garante que o dado seja um objeto para podermos salvar o 'lastHealTime'
            let plantData = rawData;
            if (typeof rawData === 'number') {
                plantData = { time: rawData, lastHealTime: rawData, owner: null };
                this.worldState.growingPlants[key] = plantData; // Atualiza no estado
            }

            const startTime = plantData.time;
            const lastHeal = plantData.lastHealTime || startTime;
            const ownerId = plantData.owner || null;
            const [x, y] = key.split(',').map(Number);
            
            const elapsedSinceStart = now - startTime;
            const elapsedSinceHeal = now - lastHeal;
            const currentType = this.worldState.getModifiedTile(x, y);

            // Estágios de crescimento
            if (currentType === 'GRAMA' && elapsedSinceStart > this.GROWTH_TIMES.BROTO) { fnChangeTile(x, y, 'BROTO', ownerId); changed = true; }
            else if (currentType === 'BROTO' && elapsedSinceStart > this.GROWTH_TIMES.MUDA) { fnChangeTile(x, y, 'MUDA', ownerId); changed = true; }
            else if (currentType === 'MUDA' && elapsedSinceStart > this.GROWTH_TIMES.FLOR) { fnChangeTile(x, y, 'FLOR', ownerId); changed = true; }
            else if (currentType === 'FLOR_COOLDOWN' && elapsedSinceStart > this.FLOWER_COOLDOWN_TIME) { fnChangeTile(x, y, 'FLOR', ownerId); changed = true; }

            // Lógica de Cura da Flor
            if (currentType === 'FLOR' && elapsedSinceHeal >= 3000) {
                plantData.lastHealTime = now;
                
                // 1. Efeito visual de cura (Onda Verde espalhada pela rede)
                this.net.sendPayload({ type: 'WAVE_SPAWN', x: x, y: y, radius: 2.0, color: "rgba(46, 204, 113, ALPHA)", amount: 10 });
                activeWaves.push(new WaveEffect(x, y, 2.0, "rgba(46, 204, 113, ALPHA)", 10));

                // 2. [NOVO] Cura Explícita dos Jogadores Próximos (Garante o HP para todos)
                const allPlayers = [localPlayer, ...Object.values(remotePlayers)];
                allPlayers.forEach(p => {
                    // Só cura se o player não estiver desmaiado e precisar de HP
                    if (p.hp > 0 && p.hp < p.maxHp) {
                        const distToFlower = Math.sqrt(Math.pow(p.pos.x - x, 2) + Math.pow(p.pos.y - y, 2));
                        if (distToFlower <= 2.5) { // Raio de efeito da flor
                            if (p.id === localPlayer.id) {
                                // Cura o Host localmente
                                localPlayer.applyHeal(10);
                                fnGainXp(this.XP_PASSIVE_CURE); // Bônus passivo para o host
                            } else {
                                // Comando de rede: Diz para o Guest recuperar HP
                                this.net.sendPayload({ type: 'PLAYER_HEAL', amount: 10 }, p.id);
                            }
                        }
                    }
                });

                // 3. Cura tiles ao redor (Transforma Terra Queimada em Grama)
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const tx = x + dx;
                        const ty = y + dy;
                        const target = this.worldState.getModifiedTile(tx, ty) || this.world.getTileAt(tx, ty);
                        
                        if (target === 'TERRA_QUEIMADA') {
                            fnChangeTile(tx, ty, 'GRAMA_SAFE', ownerId);
                            
                            if (ownerId) {
                                this.net.sendPayload({ type: 'FLOWER_CURE', ownerId: ownerId, x: tx, y: ty });
                                
                                // Recompensa o dono da flor pela cura do terreno
                                if (localPlayer && ownerId === localPlayer.id) {
                                    localPlayer.tilesCured++;
                                    fnGainXp(this.XP_PASSIVE_CURE);
                                } else if (remotePlayers[ownerId]) {
                                    remotePlayers[ownerId].tilesCured++;
                                    const pName = remotePlayers[ownerId].nickname;
                                    if (pName) {
                                        if (!guestDataDB[pName]) guestDataDB[pName] = {};
                                        guestDataDB[pName].tilesCured = remotePlayers[ownerId].tilesCured;
                                    }
                                }
                            }
                            changed = true;
                        }
                    }
                }
            }
        }

        if (changed) fnSaveProgress();
    }
}
