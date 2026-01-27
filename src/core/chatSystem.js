export class ChatSystem {
    constructor() {
        this.isVisible = false;
        this.unreadCount = 0;
        this.activeTab = 'GLOBAL'; 
        this.channels = ['GLOBAL', 'SYSTEM']; 
        this.notifications = {}; 
        
        this.container = document.getElementById('chat-container');
        this.toggleBtn = document.getElementById('chat-toggle-btn');
        this.tabsContainer = document.getElementById('chat-tabs-container');
        this.messagesBox = document.getElementById('chat-messages');
        this.input = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('chat-send-btn');

        if (this.container) {
            this.setupListeners();
            this.renderTabs();
            this.injectBasicStyles();
        }
    }

    injectBasicStyles() {
        // Garante que o container de abas tenha um layout flexível
        if (this.tabsContainer) {
            this.tabsContainer.style.display = 'flex';
            this.tabsContainer.style.overflowX = 'auto';
            this.tabsContainer.style.background = '#000';
            this.tabsContainer.style.gap = '2px';
        }
    }

    setupListeners() {
        this.toggleBtn.onclick = () => this.toggleChat();
        
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.triggerSend();
        });

        this.sendBtn.onclick = () => this.triggerSend();
        
        // Impede que as teclas de movimento interfiram no chat
        this.input.addEventListener('keydown', (e) => e.stopPropagation());
    }

    renderTabs() {
        if (!this.tabsContainer) return;
        this.tabsContainer.innerHTML = '';
        this.channels.forEach(channel => {
            const btn = document.createElement('button');
            const hasNotify = this.notifications[channel] && this.activeTab !== channel;
            
            btn.className = `chat-tab ${this.activeTab === channel ? 'active' : ''}`;
            
            // Estilo inline para garantir funcionamento imediato
            btn.style.flex = "1";
            btn.style.padding = "10px 5px";
            btn.style.fontSize = "10px";
            btn.style.border = "none";
            btn.style.background = this.activeTab === channel ? "var(--primary)" : "#1a1a1a";
            btn.style.color = this.activeTab === channel ? "#000" : (hasNotify ? "var(--danger)" : "#666");
            btn.style.fontWeight = "bold";

            let label = channel;
            if (channel === 'PARTY') label = `👥 GP`;
            else if (channel !== 'GLOBAL' && channel !== 'SYSTEM') {
                label = `👤 ${channel.substring(0, 5)}`; 
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
            this.container.style.flexDirection = 'column';
            this.toggleBtn.innerHTML = '◀'; 
            this.unreadCount = 0;
            this.updateNotification();
            
            // No mobile, o focus() pode bugar o scroll da página, usamos um pequeno delay
            if (this.isMobile()) {
                setTimeout(() => this.input.focus(), 300);
            } else {
                this.input.focus();
            }
        } else {
            this.container.style.display = 'none';
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
            this.input.placeholder = tab === 'GLOBAL' ? "Mensagem Global..." : 
                                   (tab === 'PARTY' ? "Mensagem Grupo..." : `Privado para ${tab}...`);
        }

        this.renderTabs();
        this.filterMessages();
    }

    openPartyTab() {
        if (!this.channels.includes('PARTY')) {
            this.channels.push('PARTY');
            this.addMessage('SYSTEM', null, 'Chat de grupo ativado.');
        }
        this.renderTabs();
    }

    closePartyTab() {
        this.channels = this.channels.filter(c => c !== 'PARTY');
        if (this.activeTab === 'PARTY') this.switchTab('GLOBAL');
        const msgs = this.messagesBox.querySelectorAll('[data-channel="PARTY"]');
        msgs.forEach(m => m.remove());
        this.renderTabs();
    }

    addMessage(type, sender, text) {
        if (!this.messagesBox) return;
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
        msgDiv.style.padding = "4px 8px";
        msgDiv.style.fontSize = "12px";
        msgDiv.style.borderBottom = "1px solid #111";
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'SYSTEM') {
            msgDiv.style.color = "var(--primary)";
            msgDiv.innerHTML = `<small>[${time}]</small> 💡 ${text}`;
        } else {
            const isSelf = type === 'SELF' || type === 'WHISPER_SELF' || (type === 'PARTY' && sender === 'Você');
            const senderDisplayName = isSelf ? 'Você' : sender;
            const color = type === 'PARTY' ? "#2ecc71" : (isSelf ? "var(--primary)" : "#eee");

            msgDiv.innerHTML = `
                <small style="color:#444">[${time}]</small> 
                <b style="color:${color}; cursor:pointer" class="chat-nick">${senderDisplayName}:</b> 
                <span style="color:#ccc">${this.escapeHTML(text)}</span>
            `;

            if (!isSelf && type === 'GLOBAL') {
                msgDiv.querySelector('.chat-nick').onclick = () => {
                    window.dispatchEvent(new CustomEvent('playerClicked', { detail: sender }));
                };
            }
        }

        this.messagesBox.appendChild(msgDiv);
        this.limitMessages(this.isMobile() ? 50 : 150);

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
        if (!this.toggleBtn) return;
        if (this.unreadCount > 0) {
            this.toggleBtn.style.background = "var(--danger)";
            this.toggleBtn.innerHTML = `💬 ${this.unreadCount}`;
        } else {
            this.toggleBtn.style.background = "rgba(0,0,0,0.85)";
            if (!this.isVisible) this.toggleBtn.innerHTML = '💬';
        }
    }

    triggerSend() {
        const text = this.input.value.trim();
        if (!text) return;
        this.input.value = '';

        const detail = { text };
        if (this.activeTab === 'GLOBAL') {
            detail.type = 'GLOBAL';
            this.addMessage('SELF', 'Você', text);
        } else if (this.activeTab === 'PARTY') {
            detail.type = 'PARTY';
            this.addMessage('PARTY', 'Você', text);
        } else {
            detail.type = 'WHISPER';
            detail.target = this.activeTab;
            this.addMessage('WHISPER_SELF', this.activeTab, text);
        }
        window.dispatchEvent(new CustomEvent('chatSend', { detail }));
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
