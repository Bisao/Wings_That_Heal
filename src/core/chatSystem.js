export class ChatSystem {
    constructor() {
        this.isVisible = false;
        this.unreadCount = 0;
        this.activeTab = 'GLOBAL'; 
        this.channels = ['GLOBAL', 'SYSTEM']; 
        this.notifications = {}; // { 'Canal': true }
        
        // Elementos do DOM (Baseados no seu index.html)
        this.container = document.getElementById('chat-container');
        this.toggleBtn = document.getElementById('chat-toggle-btn');
        this.tabsContainer = document.getElementById('chat-tabs-container');
        this.messagesBox = document.getElementById('chat-messages');
        this.input = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('chat-send-btn');

        // Hooks para o GameManager travar o input
        this.onChatOpen = null;
        this.onChatClose = null;

        if (this.container) {
            this.setupListeners();
            this.renderTabs();
        } else {
            console.error("[Chat] Container não encontrado no HTML!");
        }
    }

    setupListeners() {
        this.toggleBtn.onclick = () => this.toggleChat();
        
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.triggerSend();
        });

        this.sendBtn.onclick = () => this.triggerSend();
        
        // Impede que 'W', 'A', 'S', 'D' movam o boneco enquanto digita
        this.input.addEventListener('keydown', (e) => e.stopPropagation());
    }

    renderTabs() {
        this.tabsContainer.innerHTML = '';
        this.channels.forEach(channel => {
            const btn = document.createElement('button');
            const hasNotify = this.notifications[channel] && this.activeTab !== channel;
            
            // Reutiliza classes existentes no seu CSS (.tab-btn)
            // Adiciona cor vermelha inline se tiver notificação
            btn.className = `tab-btn ${this.activeTab === channel ? 'active' : ''}`;
            if (hasNotify) btn.style.color = '#e74c3c'; 
            
            let label = channel;
            if (channel === 'PARTY') label = `👥 GRUPO`;
            else if (channel !== 'GLOBAL' && channel !== 'SYSTEM') {
                label = `👤 ${channel.substring(0, 8)}`; 
            }

            btn.innerText = label;
            
            // Estilo específico para abas de chat (menores que as do menu)
            btn.style.padding = '8px';
            btn.style.fontSize = '10px';

            btn.onclick = () => this.switchTab(channel);
            this.tabsContainer.appendChild(btn);
        });
    }

    toggleChat() {
        this.isVisible = !this.isVisible;
        if (this.isVisible) {
            this.container.style.display = 'flex'; // Flex para alinhar input embaixo
            this.toggleBtn.innerHTML = '✖'; // X para fechar
            this.toggleBtn.style.left = '275px'; // Move o botão para o lado da janela
            this.unreadCount = 0;
            this.updateNotification();
            
            if(this.onChatOpen) this.onChatOpen();
            
            // Foca no input se não for mobile (mobile abre teclado virtual, atrapalha)
            if (!this.isMobile()) this.input.focus();
        } else {
            this.container.style.display = 'none';
            this.toggleBtn.innerHTML = '💬'; 
            this.toggleBtn.style.left = '15px'; // Volta para o canto
            
            if(this.onChatClose) this.onChatClose();
        }
    }

    switchTab(tab) {
        this.activeTab = tab;
        this.notifications[tab] = false; 
        
        if (tab === 'SYSTEM') {
            this.input.disabled = true;
            this.input.placeholder = "Apenas leitura...";
        } else {
            this.input.disabled = false;
            if (tab === 'GLOBAL') this.input.placeholder = "Mensagem Global...";
            else if (tab === 'PARTY') this.input.placeholder = "Mensagem para o Grupo...";
            else this.input.placeholder = `Cochichar para ${tab}...`;
        }

        this.renderTabs();
        this.filterMessages();
    }

    openPartyTab() {
        if (!this.channels.includes('PARTY')) {
            this.channels.push('PARTY');
            this.addMessage('SYSTEM', null, 'Canal de Grupo aberto.');
        }
        this.renderTabs();
    }

    closePartyTab() {
        this.channels = this.channels.filter(c => c !== 'PARTY');
        if (this.activeTab === 'PARTY') this.switchTab('GLOBAL');
        
        // Remove mensagens antigas de party para limpar memória visual
        const msgs = this.messagesBox.querySelectorAll('div[data-channel="PARTY"]');
        msgs.forEach(m => m.remove());
        
        this.renderTabs();
        this.addMessage('SYSTEM', null, 'Grupo encerrado.');
    }

    openPrivateTab(targetNick) {
        if (!this.channels.includes(targetNick)) {
            this.channels.push(targetNick);
        }
        this.switchTab(targetNick);
        if (!this.isVisible) this.toggleChat();
    }

    addMessage(type, sender, text) {
        let targetChannel = 'GLOBAL';
        
        if (type === 'SYSTEM') targetChannel = 'SYSTEM';
        else if (type === 'PARTY') {
            targetChannel = 'PARTY';
            if (!this.channels.includes('PARTY')) this.openPartyTab();
        }
        else if (type === 'WHISPER' || type === 'WHISPER_SELF') {
            targetChannel = sender;
            if (!this.channels.includes(targetChannel)) {
                this.channels.push(targetChannel);
                this.renderTabs();
            }
        }
        if (type === 'SELF') targetChannel = 'GLOBAL';

        const msgDiv = document.createElement('div');
        msgDiv.dataset.channel = targetChannel;
        msgDiv.style.marginBottom = '5px';
        msgDiv.style.fontSize = '12px';
        msgDiv.style.wordWrap = 'break-word';
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'SYSTEM') {
            msgDiv.style.color = '#f1c40f'; // Amarelo
            msgDiv.innerHTML = `[${time}] <b>SISTEMA:</b> ${text}`;
        } else {
            const isSelf = type === 'SELF' || type === 'WHISPER_SELF' || (type === 'PARTY' && sender === 'Você');
            const senderDisplayName = isSelf ? 'Você' : sender;
            
            let color = '#ddd'; // Padrão Branco/Cinza
            let prefix = '';

            if (type === 'PARTY') { color = '#2ecc71'; prefix = '[GP] '; } // Verde
            if (type === 'WHISPER' || type === 'WHISPER_SELF') { color = '#9b59b6'; prefix = '[PV] '; } // Roxo

            msgDiv.innerHTML = `
                <span style="color:#666; font-size:10px;">[${time}]</span> 
                <span style="color:${color}; font-weight:bold; cursor:pointer;" class="msg-author">${prefix}${senderDisplayName}:</span> 
                <span style="color:#eee;">${this.escapeHTML(text)}</span>
            `;

            // Clique no nome para abrir opções (Cochicho/Party)
            if (!isSelf && type === 'GLOBAL') {
                const authorSpan = msgDiv.querySelector('.msg-author');
                authorSpan.onclick = (e) => {
                    e.stopPropagation();
                    // Dispara evento para o GameManager abrir o modal de player
                    window.dispatchEvent(new CustomEvent('playerClicked', { detail: sender }));
                };
            }
        }

        this.messagesBox.appendChild(msgDiv);
        this.limitMessages(50); // Mantém apenas as últimas 50 mensagens para leveza

        // Notificação se não estiver na aba
        if (this.activeTab !== targetChannel) {
            this.notifications[targetChannel] = true;
            this.renderTabs();
        }

        // Notificação no botão se fechado
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
            this.toggleBtn.style.border = '2px solid #e74c3c'; // Borda vermelha
            this.toggleBtn.innerHTML = `💬 ${this.unreadCount}`;
        } else {
            this.toggleBtn.style.border = '2px solid #f1c40f'; // Borda amarela padrão
            if (!this.isVisible) this.toggleBtn.innerHTML = '💬';
        }
    }

    triggerSend() {
        const text = this.input.value.trim();
        if (!text) return;
        this.input.value = '';

        if (this.activeTab === 'GLOBAL') {
            window.dispatchEvent(new CustomEvent('chatSend', { detail: { type: 'GLOBAL', text } }));
            this.addMessage('SELF', 'Você', text);
        } else if (this.activeTab === 'PARTY') {
            window.dispatchEvent(new CustomEvent('chatSend', { detail: { type: 'PARTY', text } }));
            this.addMessage('PARTY', 'Você', text);
        } else {
            window.dispatchEvent(new CustomEvent('chatSend', { detail: { type: 'WHISPER', target: this.activeTab, text } }));
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
