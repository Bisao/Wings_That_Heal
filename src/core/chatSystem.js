export class ChatSystem {
    constructor() {
        this.isVisible = false;
        this.unreadCount = 0;
        this.activeTab = 'GLOBAL'; 
        this.channels = ['GLOBAL', 'SYSTEM']; 
        this.notifications = {}; // Armazena notificações por canal { 'Canal': true }
        
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
        
        // Impede que as teclas de movimento do jogo interfiram no chat ao digitar
        this.input.addEventListener('keydown', (e) => e.stopPropagation());
    }

    renderTabs() {
        this.tabsContainer.innerHTML = '';
        this.channels.forEach(channel => {
            const btn = document.createElement('button');
            const hasNotify = this.notifications[channel] && this.activeTab !== channel;
            
            btn.className = `chat-tab ${this.activeTab === channel ? 'active' : ''} ${hasNotify ? 'tab-notify' : ''}`;
            
            let label = channel;
            if (channel === 'PARTY') label = `👥 PARTY`;
            else if (channel !== 'GLOBAL' && channel !== 'SYSTEM') {
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
        this.notifications[tab] = false; 
        
        if (tab === 'SYSTEM') {
            this.input.disabled = true;
            this.input.placeholder = "Apenas leitura...";
        } else {
            this.input.disabled = false;
            if (tab === 'GLOBAL') this.input.placeholder = "Mensagem Global...";
            else if (tab === 'PARTY') this.input.placeholder = "Mensagem para a Party...";
            else this.input.placeholder = `Cochichar para ${tab}...`;
        }

        this.renderTabs();
        this.filterMessages();
    }

    /**
     * Gerenciamento de Party
     */
    openPartyTab() {
        if (!this.channels.includes('PARTY')) {
            this.channels.push('PARTY');
            this.addMessage('SYSTEM', null, 'Você entrou em uma party. Aba de chat de grupo liberada.');
        }
        this.renderTabs();
    }

    closePartyTab() {
        this.channels = this.channels.filter(c => c !== 'PARTY');
        if (this.activeTab === 'PARTY') this.switchTab('GLOBAL');
        
        // Remove mensagens antigas da party do DOM
        const msgs = this.messagesBox.querySelectorAll('.chat-msg[data-channel="PARTY"]');
        msgs.forEach(m => m.remove());
        
        this.renderTabs();
        this.addMessage('SYSTEM', null, 'Você saiu da party. Aba de grupo fechada.');
    }

    openPrivateTab(targetNick) {
        if (!this.channels.includes(targetNick)) {
            this.channels.push(targetNick);
        }
        this.switchTab(targetNick);
        if (!this.isVisible) this.toggleChat();
    }

    /**
     * @param {string} type - 'GLOBAL', 'SELF', 'SYSTEM', 'WHISPER', 'WHISPER_SELF', 'PARTY'
     * @param {string} sender - Nickname de quem enviou
     * @param {string} text - Conteúdo
     */
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

        // Correção: Se for do tipo SELF (nossas mensagens globais), o canal deve ser GLOBAL
        if (type === 'SELF') targetChannel = 'GLOBAL';

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg msg-${type.toLowerCase().replace('_self', '')}`;
        msgDiv.dataset.channel = targetChannel;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'SYSTEM') {
            msgDiv.innerHTML = `<span class="msg-time">[${time}]</span> <span class="msg-text">💡 ${text}</span>`;
        } else {
            const isSelf = type === 'SELF' || type === 'WHISPER_SELF' || (type === 'PARTY' && sender === 'Você');
            const senderDisplayName = isSelf ? 'Você' : sender;
            
            let colorClass = 'name-other';
            if (isSelf) colorClass = 'name-self';
            if (type === 'PARTY') colorClass = 'name-party';

            let prefix = '';
            if (type === 'WHISPER' || type === 'WHISPER_SELF') prefix = '🔒 ';
            if (type === 'PARTY') prefix = '🛡️ ';

            msgDiv.innerHTML = `
                <span class="msg-time">[${time}]</span> 
                <span class="${colorClass}" data-nick="${sender}">${prefix}${senderDisplayName}:</span> 
                <span class="msg-text">${this.escapeHTML(text)}</span>
            `;

            // Clique no nome para ações (apenas no Global)
            if (!isSelf && type === 'GLOBAL') {
                const nameSpan = msgDiv.querySelector(`.${colorClass}`);
                nameSpan.onclick = (e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('playerClicked', { detail: sender }));
                };
            }
        }

        this.messagesBox.appendChild(msgDiv);
        this.limitMessages(200);

        // Notificações visuais
        if (this.activeTab !== targetChannel) {
            this.notifications[targetChannel] = true;
            this.renderTabs();
        }

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
            this.addMessage('SELF', 'Você', text);
        } else if (this.activeTab === 'PARTY') {
            window.dispatchEvent(new CustomEvent('chatSend', { detail: { type: 'PARTY', text } }));
            this.addMessage('PARTY', 'Você', text);
        } else {
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
