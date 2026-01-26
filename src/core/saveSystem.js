export class SaveSystem {
    constructor() {
        this.DB_KEY = 'WingsThatHeal_Save_v1';
        this.BACKUP_KEY = 'WingsThatHeal_Backup_v1';
    }

    save(data) {
        try {
            const jsonString = JSON.stringify({
                timestamp: Date.now(),
                version: '1.0',
                data: data
            });

            // Backup antes de sobrescrever
            const currentSave = localStorage.getItem(this.DB_KEY);
            if (currentSave) {
                localStorage.setItem(this.BACKUP_KEY, currentSave);
            }

            localStorage.setItem(this.DB_KEY, jsonString);
            return true;
        } catch (error) {
            console.error("[SaveSystem] Falha ao salvar!", error);
            return false;
        }
    }

    load() {
        let rawData = localStorage.getItem(this.DB_KEY);
        
        if (!rawData) {
            // Tenta backup
            rawData = localStorage.getItem(this.BACKUP_KEY);
            if (rawData) console.log("[SaveSystem] Restaurando do Backup...");
        }

        if (!rawData) return null;

        try {
            const parsed = JSON.parse(rawData);
            return parsed.data;
        } catch (error) {
            console.error("[SaveSystem] Save corrompido! Tentando backup...", error);
            const backupData = localStorage.getItem(this.BACKUP_KEY);
            if (backupData) {
                try {
                    return JSON.parse(backupData).data;
                } catch (e) {
                    console.error("[SaveSystem] Backup também corrompido.");
                }
            }
            return null;
        }
    }

    clear() {
        localStorage.removeItem(this.DB_KEY);
        localStorage.removeItem(this.BACKUP_KEY);
    }
}
