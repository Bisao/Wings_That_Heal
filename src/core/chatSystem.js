export class ChatSystem {
    constructor() {
        this.isVisible = false;
        this.unreadCount = 0;
        this.activeTab = 'GLOBAL'; // 'GLOBAL' ou 'SYSTEM'
        
        // Elementos DOM (serão criados no index.html depois)
        this.container = document.getElementById('chat-container');
        this.toggleBtn = document.getElementById('chat-toggle-btn');
        this.messagesBox = document.getElementById('chat-messages');
        this.input = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('chat-send-btn');
        this.glowIndicator = document.getElementById('chat-notification-glow');

        // Tabs
        this.tabGlobal = document.getElementById('tab-global');
        this.tabSystem = document.getElementById('tab-system');

        this.setupListeners();
    }

    setupListeners() {
        // Toggle (Abrir/Fechar)
        this.toggleBtn.onclick = () => this.toggleChat();

        // Troca de Abas
        this.tabGlobal.onclick = () => this.switchTab('GLOBAL');
        this.tabSystem.onclick = () => this.switchTab('SYSTEM');

        // Enviar com Enter
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.triggerSend();
        });

        // Enviar com Botão
        this.sendBtn.onclick = () => this.triggerSend();

        // Bloquear propagação de teclas para o jogo (para não andar enquanto digita)
        this.input.addEventListener('keydown', (e) => e.stopPropagation());
    }

    toggleChat() {
        this.isVisible = !this.isVisible;
        
        if (this.isVisible) {
            this.container.style.display = 'flex';
            this.toggleBtn.classList.add('open');
            this.toggleBtn.innerHTML = '◀'; // Seta para fechar
            this.unreadCount = 0;
            this.updateNotification();
            // Foca no input se for Desktop
            if (!this.isMobile()) this.input.focus();
        } else {
            this.container.style.display = 'none';
            this.toggleBtn.classList.remove('open');
            this.toggleBtn.innerHTML = '💬'; // Ícone de chat
        }
    }

    switchTab(tab) {
        this.activeTab = tab;
        
        // Atualiza visual das abas
        if (tab === 'GLOBAL') {
            this.tabGlobal.classList.add('active');
            this.tabSystem.classList.remove('active');
            this.input.disabled = false;
            this.input.placeholder = "Digite sua mensagem...";
        } else {
            this.tabSystem.classList.add('active');
            this.tabGlobal.classList.remove('active');
            this.input.disabled = true; // Não se escreve no chat do sistema
            this.input.placeholder = "Log do Sistema (Apenas Leitura)";
        }

        // Filtra mensagens
        this.filterMessages();
    }

    addMessage(type, sender, text) {
        // Tipos: 'GLOBAL', 'SYSTEM', 'SELF'
        
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg msg-${type.toLowerCase()}`;
        msgDiv.dataset.type = type === 'SYSTEM' ? 'SYSTEM' : 'GLOBAL';
        
        // Timestamp simples
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'SYSTEM') {
            msgDiv.innerHTML = `<span class="msg-time">[${time}]</span> <span class="msg-text">${text}</span>`;
        } else {
            // Mensagem de Player
            const senderName = type === 'SELF' ? 'Você' : sender;
            const colorClass = type === 'SELF' ? 'name-self' : 'name-other';
            msgDiv.innerHTML = `<span class="msg-time">[${time}]</span> <span class="${colorClass}">${senderName}:</span> <span class="msg-text">${text}</span>`;
        }

        this.messagesBox.appendChild(msgDiv);
        this.scrollToBottom();

        // Notificação se fechado
        if (!this.isVisible) {
            this.unreadCount++;
            this.updateNotification();
        }

        // Se a mensagem chegou na aba que não estamos vendo, talvez avisar?
        // Por enquanto, vamos filtrar visualmente apenas.
        this.filterMessages();
    }

    filterMessages() {
        const msgs = this.messagesBox.children;
        for (let msg of msgs) {
            if (this.activeTab === 'GLOBAL') {
                // Global vê tudo ou só players? Geralmente Global vê players.
                // Vamos deixar SYSTEM visível no Global também ou separar estrito?
                // Pedido: "Separar". Então Global só vê Global, System só vê System.
                if (msg.dataset.type === 'GLOBAL') msg.style.display = 'block';
                else msg.style.display = 'none';
            } else {
                // Aba System
                if (msg.dataset.type === 'SYSTEM') msg.style.display = 'block';
                else msg.style.display = 'none';
            }
        }
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.messagesBox.scrollTop = this.messagesBox.scrollHeight;
    }

    updateNotification() {
        if (this.unreadCount > 0) {
            this.toggleBtn.classList.add('notify');
        } else {
            this.toggleBtn.classList.remove('notify');
        }
    }

    triggerSend() {
        const text = this.input.value.trim();
        if (!text) return;

        // Limpa input
        this.input.value = '';

        // Dispara evento para o main.js enviar pela rede
        window.dispatchEvent(new CustomEvent('chatSend', { detail: text }));
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}
