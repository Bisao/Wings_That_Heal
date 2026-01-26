export class ChatSystem {
    constructor() {
        this.isVisible = false;
        this.unreadCount = 0;
        this.activeTab = 'GLOBAL'; 
        this.channels = ['GLOBAL', 'SYSTEM']; 
        this.notifications = {}; // Armazena notificações por canal { 'Nick': true }
        
        this.container = document.getElementById('chat-container');
        this.toggleBtn = document.getElementById('chat-toggle-btn');
        this.tabsContainer = document.getElementById('chat-tabs-container');
        this.messagesBox = document.getElementById('chat-messages');
        this.input = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('chat-send-btn');

        this.setupListeners();
        this.renderTabs();
    }

    setupListeners() {
        this.toggleBtn.onclick = () => this.toggleChat();
        
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.triggerSend();
        });

        this.sendBtn.onclick = () => this.triggerSend();
        
        // Impede que as teclas de movimento do jogo interfiram no chat
        this.input.addEventListener('keydown', (e) => e.stopPropagation());
    }

    renderTabs() {
        this.tabsContainer.innerHTML = '';
        this.channels.forEach(channel => {
            const btn = document.createElement('button');
            const hasNotify = this.notifications[channel] && this.activeTab !== channel;
            
            btn.className = `chat-tab ${this.activeTab === channel ? 'active' : ''} ${hasNotify ? 'tab-notify' : ''}`;
            
            let label = channel;
            if (channel !== 'GLOBAL' && channel !== 'SYSTEM') {
                label = `👤 ${channel}`; 
            }

            btn.innerText = label;
            btn.onclick = () => this.switchTab(channel);
            this.tabsContainer.appendChild(btn);
        });
    }

    toggleChat() {
        this.isVisible = !this.isVisible;
        if (this.isVisible) {
            this.container.style.display = 'flex';
            this.toggleBtn.classList.add('open');
            this.toggleBtn.innerHTML = '◀'; 
            this.unreadCount = 0;
            this.updateNotification();
            if (!this.isMobile()) this.input.focus();
        } else {
            this.container.style.display = 'none';
            this.toggleBtn.classList.remove('open');
            this.toggleBtn.innerHTML = '💬'; 
        }
    }

    switchTab(tab) {
        this.activeTab = tab;
        this.notifications[tab] = false; // Limpa notificação da aba ao entrar
        
        if (tab === 'SYSTEM') {
            this.input.disabled = true;
            this.input.placeholder = "Apenas leitura...";
        } else {
            this.input.disabled = false;
            this.input.placeholder = tab === 'GLOBAL' ? "Mensagem Global..." : `Cochichar para ${tab}...`;
        }

        this.renderTabs();
        this.filterMessages();
    }

    openPrivateTab(targetNick) {
        if (!this.channels.includes(targetNick)) {
            this.channels.push(targetNick);
        }
        this.switchTab(targetNick);
        if (!this.isVisible) this.toggleChat();
    }

    /**
     * @param {string} type - 'GLOBAL', 'SELF', 'SYSTEM', 'WHISPER', 'WHISPER_SELF'
     * @param {string} sender - Nickname de quem enviou
     * @param {string} text - Conteúdo
     */
    addMessage(type, sender, text) {
        let targetChannel = 'GLOBAL';
        
        if (type === 'SYSTEM') targetChannel = 'SYSTEM';
        
        if (type === 'WHISPER' || type === 'WHISPER_SELF') {
            // No cochicho, o canal é sempre o nome do "Outro"
            targetChannel = sender;
            
            if (!this.channels.includes(targetChannel)) {
                this.channels.push(targetChannel);
                this.renderTabs();
            }

            // Notifica a aba se não estiver nela
            if (this.activeTab !== targetChannel) {
                this.notifications[targetChannel] = true;
                this.renderTabs();
            }
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg msg-${type.toLowerCase().replace('_self', '')}`;
        msgDiv.dataset.channel = targetChannel;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'SYSTEM') {
            msgDiv.innerHTML = `<span class="msg-time">[${time}]</span> <span class="msg-text">💡 ${text}</span>`;
        } else {
            const isSelf = type === 'SELF' || type === 'WHISPER_SELF';
            const senderDisplayName = isSelf ? 'Você' : sender;
            const colorClass = isSelf ? 'name-self' : 'name-other';
            const whisperPrefix = (type === 'WHISPER' || type === 'WHISPER_SELF') ? '🔒 ' : '';

            msgDiv.innerHTML = `
                <span class="msg-time">[${time}]</span> 
                <span class="${colorClass}" data-nick="${sender}">${whisperPrefix}${senderDisplayName}:</span> 
                <span class="msg-text">${this.escapeHTML(text)}</span>
            `;

            // Clique no nome para abrir perfil/cochicho (apenas Global)
            if (!isSelf && type === 'GLOBAL') {
                const nameSpan = msgDiv.querySelector(`.${colorClass}`);
                nameSpan.onclick = (e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('playerClicked', { detail: sender }));
                };
            }
        }

        this.messagesBox.appendChild(msgDiv);
        this.limitMessages(200); // Mantém performance

        if (!this.isVisible && type !== 'SYSTEM') {
            this.unreadCount++;
            this.updateNotification();
        }

        this.filterMessages();
    }

    limitMessages(limit) {
        while (this.messagesBox.children.length > limit) {
            this.messagesBox.removeChild(this.messagesBox.firstChild);
        }
    }

    filterMessages() {
        const msgs = this.messagesBox.children;
        for (let msg of msgs) {
            msg.style.display = (msg.dataset.channel === this.activeTab) ? 'block' : 'none';
        }
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.messagesBox.scrollTop = this.messagesBox.scrollHeight;
    }

    updateNotification() {
        if (this.unreadCount > 0) {
            this.toggleBtn.classList.add('notify');
            this.toggleBtn.innerHTML = `💬 (${this.unreadCount})`;
        } else {
            this.toggleBtn.classList.remove('notify');
            if (!this.isVisible) this.toggleBtn.innerHTML = '💬';
        }
    }

    triggerSend() {
        const text = this.input.value.trim();
        if (!text) return;

        this.input.value = '';

        if (this.activeTab === 'GLOBAL') {
            window.dispatchEvent(new CustomEvent('chatSend', { detail: { type: 'GLOBAL', text } }));
            // Adicionamos para nós mesmos
            this.addMessage('SELF', 'Você', text);
        } else {
            // Envia Whisper para o dono da aba
            window.dispatchEvent(new CustomEvent('chatSend', { 
                detail: { type: 'WHISPER', target: this.activeTab, text } 
            }));
            this.addMessage('WHISPER_SELF', this.activeTab, text);
        }
    }

    escapeHTML(str) {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}
