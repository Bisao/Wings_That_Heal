export class SaveSystem {
    constructor() {
        this.DB_KEY = 'BloomKeepers_Save_Data_v1';
        this.BACKUP_KEY = 'BloomKeepers_Backup_Data_v1';
        this.lastSaveTime = 0;
    }

    save(data) {
        try {
            // Garantir que não estamos salvando referências circulares ou nulas
            const saveObj = {
                timestamp: Date.now(),
                version: '1.0',
                data: data
            };

            const jsonString = JSON.stringify(saveObj);

            const currentSave = localStorage.getItem(this.DB_KEY);
            if (currentSave) {
                localStorage.setItem(this.BACKUP_KEY, currentSave);
            }

            localStorage.setItem(this.DB_KEY, jsonString);
            this.lastSaveTime = Date.now();
            console.log(`[SaveSystem] Jogo salvo com sucesso! (${new Date().toLocaleTimeString()})`);
            return true;
        } catch (error) {
            console.error("[SaveSystem] CRÍTICO: Falha ao salvar jogo!", error);
            return false;
        }
    }

    load() {
        let rawData = localStorage.getItem(this.DB_KEY);
        if (!rawData) {
            rawData = localStorage.getItem(this.BACKUP_KEY);
        }

        if (!rawData) return null;

        try {
            const parsed = JSON.parse(rawData);
            return parsed.data;
        } catch (error) {
            console.error("[SaveSystem] Save corrompido!", error);
            return null;
        }
    }

    hasSave() { return localStorage.getItem(this.DB_KEY) !== null; }
    clear() {
        localStorage.removeItem(this.DB_KEY);
        localStorage.removeItem(this.BACKUP_KEY);
    }
}
