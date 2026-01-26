export class SaveSystem {
    constructor() {
        this.DB_KEY = 'BloomKeepers_Save_Data_v1';
        this.BACKUP_KEY = 'BloomKeepers_Backup_Data_v1';
        this.lastSaveTime = 0;
    }

    /**
     * Salva o estado completo do jogo.
     * Cria um backup automático do save anterior antes de sobrescrever.
     * @param {Object} data - Objeto contendo { world, host, guests }
     */
    save(data) {
        try {
            const jsonString = JSON.stringify({
                timestamp: Date.now(),
                version: '1.0',
                data: data
            });

            // 1. Tenta criar um backup do save atual antes de sobrescrever
            const currentSave = localStorage.getItem(this.DB_KEY);
            if (currentSave) {
                localStorage.setItem(this.BACKUP_KEY, currentSave);
            }

            // 2. Salva o novo estado
            localStorage.setItem(this.DB_KEY, jsonString);
            
            this.lastSaveTime = Date.now();
            console.log(`[SaveSystem] Jogo salvo com sucesso! (${new Date().toLocaleTimeString()})`);
            return true;
        } catch (error) {
            console.error("[SaveSystem] CRÍTICO: Falha ao salvar jogo!", error);
            // Aqui você poderia adicionar um alerta na UI se quisesse
            return false;
        }
    }

    /**
     * Carrega o jogo. Tenta o save principal, se falhar, tenta o backup.
     * @returns {Object|null} Retorna os dados do jogo ou null se não houver save.
     */
    load() {
        // Tenta carregar o Principal
        let rawData = localStorage.getItem(this.DB_KEY);
        
        if (!rawData) {
            console.log("[SaveSystem] Nenhum save principal encontrado.");
            // Tenta carregar o Backup se o principal não existir
            rawData = localStorage.getItem(this.BACKUP_KEY);
            if (rawData) console.log("[SaveSystem] Restaurando a partir do Backup...");
        }

        if (!rawData) return null;

        try {
            const parsed = JSON.parse(rawData);
            console.log(`[SaveSystem] Save carregado. Data: ${new Date(parsed.timestamp).toLocaleString()}`);
            return parsed.data;
        } catch (error) {
            console.error("[SaveSystem] Save corrompido! Tentando carregar backup...", error);
            
            // Tentativa final com backup se o JSON parse falhou no principal
            const backupData = localStorage.getItem(this.BACKUP_KEY);
            if (backupData) {
                try {
                    const parsedBackup = JSON.parse(backupData);
                    return parsedBackup.data;
                } catch (e) {
                    console.error("[SaveSystem] Backup também está corrompido.");
                }
            }
            return null;
        }
    }

    /**
     * Verifica se existe algum save game
     */
    hasSave() {
        return localStorage.getItem(this.DB_KEY) !== null;
    }

    /**
     * Limpa todo o progresso (Reset)
     */
    clear() {
        localStorage.removeItem(this.DB_KEY);
        localStorage.removeItem(this.BACKUP_KEY);
        console.log("[SaveSystem] Save deletado.");
    }
}
