/**
 * saveSystem.js
 * Gerencia a persistência de dados localmente (LocalStorage).
 * Atualizado para suportar múltiplos mundos (Slots) baseados no ID da Colmeia.
 */
export class SaveSystem {
    constructor() {
        // Prefixos para separar os saves de outros dados do navegador
        this.PREFIX = 'BloomKeepers_World_';
        this.BACKUP_PREFIX = 'BloomKeepers_Backup_';
        this.lastSaveTime = 0;
    }

    /**
     * Gera a chave única de armazenamento baseada no ID do mundo.
     * Remove caracteres especiais para evitar erros no LocalStorage.
     */
    _getKey(worldId) {
        if (!worldId) return null;
        const safeId = worldId.replace(/[^a-zA-Z0-9_-]/g, '');
        return `${this.PREFIX}${safeId}`;
    }

    _getBackupKey(worldId) {
        if (!worldId) return null;
        const safeId = worldId.replace(/[^a-zA-Z0-9_-]/g, '');
        return `${this.BACKUP_PREFIX}${safeId}`;
    }

    /**
     * Salva os dados de um mundo específico.
     * @param {string} worldId - O ID único da Colmeia/Sala (ex: "Jardim1").
     * @param {Object} data - O objeto contendo o estado do jogo.
     */
    save(worldId, data) {
        if (!worldId) {
            console.error("[SaveSystem] Erro: Tentativa de salvar sem ID de mundo.");
            return false;
        }

        try {
            const key = this._getKey(worldId);
            const backupKey = this._getBackupKey(worldId);

            // Estrutura do Save com Metadados
            const saveObj = {
                timestamp: Date.now(),
                version: '2.0', // Versão atualizada para multi-save
                id: worldId,
                data: data
            };

            const jsonString = JSON.stringify(saveObj);

            // Sistema de Backup Rotativo:
            // Antes de salvar o novo, movemos o save atual para o slot de backup.
            const currentSave = localStorage.getItem(key);
            if (currentSave) {
                localStorage.setItem(backupKey, currentSave);
            }

            localStorage.setItem(key, jsonString);
            this.lastSaveTime = Date.now();
            console.log(`[SaveSystem] Mundo '${worldId}' salvo com sucesso! (${new Date().toLocaleTimeString()})`);
            return true;
        } catch (error) {
            console.error(`[SaveSystem] CRÍTICO: Falha ao salvar mundo '${worldId}'!`, error);
            return false;
        }
    }

    /**
     * Carrega os dados de um mundo específico.
     * @param {string} worldId - O ID da Colmeia para carregar.
     */
    load(worldId) {
        if (!worldId) return null;

        const key = this._getKey(worldId);
        const backupKey = this._getBackupKey(worldId);

        let rawData = localStorage.getItem(key);

        // Se o save principal não existir ou estiver vazio, tenta o backup
        if (!rawData) {
            console.warn(`[SaveSystem] Save principal não encontrado para '${worldId}'. Verificando backup...`);
            rawData = localStorage.getItem(backupKey);
        }

        if (!rawData) return null;

        try {
            const parsed = JSON.parse(rawData);
            
            // Verificação básica de integridade
            if (!parsed.data) {
                throw new Error("Estrutura de save inválida (sem campo data).");
            }

            console.log(`[SaveSystem] Mundo '${worldId}' carregado. (Save de: ${new Date(parsed.timestamp).toLocaleString()})`);
            return parsed.data;
        } catch (error) {
            console.error(`[SaveSystem] Save corrompido para '${worldId}'!`, error);
            // Última tentativa: Tentar carregar o backup se o principal falhou no parse
            try {
                const backupData = localStorage.getItem(backupKey);
                if (backupData) {
                    console.warn("[SaveSystem] Recuperando via Backup de emergência...");
                    const parsedBackup = JSON.parse(backupData);
                    return parsedBackup.data;
                }
            } catch (bkpError) {
                console.error("[SaveSystem] Backup também está corrompido.", bkpError);
            }
            return null;
        }
    }

    /**
     * Verifica se existe um save para este ID.
     */
    hasSave(worldId) {
        const key = this._getKey(worldId);
        return key && localStorage.getItem(key) !== null;
    }

    /**
     * Remove um save específico (ex: Deletar mundo).
     */
    deleteSave(worldId) {
        const key = this._getKey(worldId);
        const backupKey = this._getBackupKey(worldId);
        if (key) localStorage.removeItem(key);
        if (backupKey) localStorage.removeItem(backupKey);
        console.log(`[SaveSystem] Save do mundo '${worldId}' foi deletado.`);
    }

    /**
     * [PROFISSIONAL] Lista todos os mundos salvos no navegador.
     * Útil para criar um menu de "Meus Mundos".
     */
    listAllSaves() {
        const saves = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.PREFIX)) {
                const worldId = key.replace(this.PREFIX, '');
                // Tenta pegar metadados para mostrar a data
                try {
                    const raw = localStorage.getItem(key);
                    const parsed = JSON.parse(raw);
                    saves.push({
                        id: worldId,
                        timestamp: parsed.timestamp || 0,
                        dateStr: new Date(parsed.timestamp).toLocaleString()
                    });
                } catch (e) {
                    saves.push({ id: worldId, timestamp: 0, dateStr: "Desconhecido" });
                }
            }
        }
        // Retorna ordenado do mais recente para o mais antigo
        return saves.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    clearAll() {
        // Limpa apenas os saves deste jogo, não limpa outros dados do navegador
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.PREFIX) || key.startsWith(this.BACKUP_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        console.log("[SaveSystem] Todos os saves foram limpos.");
    }
}
