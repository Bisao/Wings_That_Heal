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
        if (this.tabsContainer) {
            this.tabsContainer.style.display = 'flex';
            this.tabsContainer.style.overflowX = 'auto';
            this.tabsContainer.style.background = '#000';
            this.tabsContainer.style.minHeight = '35px';
            this.tabsContainer.style.borderBottom = '1px solid #222';
            this.tabsContainer.style.scrollbarWidth = 'none'; 
        }
    }

    setupListeners() {
        this.toggleBtn.onclick = () => this.toggleChat();
        
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.triggerSend();
        });

        this.sendBtn.onclick = () => this.triggerSend();
        this.input.addEventListener('keydown', (e) => e.stopPropagation());
    }

    renderTabs() {
        if (!this.tabsContainer) return;
        this.tabsContainer.innerHTML = '';
        this.channels.forEach(channel => {
            const btn = document.createElement('button');
            const hasNotify = this.notifications[channel] && this.activeTab !== channel;
            
            btn.className = `chat-tab ${this.activeTab === channel ? 'active' : ''}`;
            btn.style.flex = "1";
            btn.style.minWidth = "60px";
            btn.style.padding = "10px 5px";
            btn.style.fontSize = "10px";
            btn.style.border = "none";
            btn.style.cursor = "pointer";
            btn.style.transition = "all 0.2s";
            
            if (this.activeTab === channel) {
                btn.style.background = "var(--primary)";
                btn.style.color = "#000";
            } else if (hasNotify) {
                btn.style.background = "var(--danger)";
                btn.style.color = "#fff";
            } else {
                btn.style.background = "#1a1a1a";
                btn.style.color = "#666";
            }

            btn.style.fontWeight = "900";
            btn.style.textTransform = "uppercase";

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

    // CORREÇÃO: Lógica de Toggle com manipulação de classes CSS para movimento lateral
    toggleChat() {
        this.isVisible = !this.isVisible;
        
        if (this.isVisible) {
            // Adiciona as classes que disparam o 'left' no CSS
            this.container.classList.add('open');
            this.toggleBtn.classList.add('open');
            this.toggleBtn.innerHTML = '◀'; 
            
            this.unreadCount = 0;
            this.updateNotification();
            
            if (this.isMobile()) {
                setTimeout(() => {
                    this.input.focus();
                    this.scrollToBottom();
                }, 300);
            } else {
                this.input.focus();
                this.scrollToBottom();
            }
        } else {
            // Remove as classes para recolher o chat à esquerda
            this.container.classList.remove('open');
            this.toggleBtn.classList.remove('open');
            this.toggleBtn.innerHTML = '💬'; 
        }
    }

    switchTab(tab) {
        this.activeTab = tab;
        this.notifications[tab] = false; 
        
        if (tab === 'SYSTEM') {
            this.input.disabled = true;
            this.input.placeholder = "Log do Sistema...";
        } else {
            this.input.disabled = false;
            this.input.placeholder = tab === 'GLOBAL' ? "Zumbir no Global..." : 
                                   (tab === 'PARTY' ? "Zumbir no Grupo..." : `Sussurrar para ${tab}...`);
        }

        this.renderTabs();
        this.filterMessages();
    }

    openPartyTab() {
        if (!this.channels.includes('PARTY')) {
            this.channels.push('PARTY');
            this.addMessage('SYSTEM', null, 'Canal de Grupo (GP) estabelecido.');
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

    openPrivateTab(targetNick) {
        if (!this.channels.includes(targetNick)) {
            this.channels.push(targetNick);
        }
        this.switchTab(targetNick);
        if (!this.isVisible) this.toggleChat();
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
            targetChannel = sender === 'Você' ? this.activeTab : sender;
            if (!this.channels.includes(targetChannel)) {
                this.channels.push(targetChannel);
            }
        }
        if (type === 'SELF') targetChannel = 'GLOBAL';

        const msgDiv = document.createElement('div');
        msgDiv.dataset.channel = targetChannel;
        msgDiv.style.padding = "6px 10px";
        msgDiv.style.fontSize = "13px";
        msgDiv.style.lineHeight = "1.4";
        msgDiv.style.wordBreak = "break-word";
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'SYSTEM') {
            msgDiv.style.borderLeft = "3px solid var(--primary)";
            msgDiv.style.background = "rgba(241, 196, 15, 0.05)";
            msgDiv.innerHTML = `<small style="color:#555">[${time}]</small> <span style="color:var(--primary)">💡 ${text}</span>`;
        } else {
            const isSelf = type === 'SELF' || type === 'WHISPER_SELF' || (type === 'PARTY' && sender === 'Você');
            const senderDisplayName = isSelf ? 'Você' : sender;
            const color = type === 'PARTY' ? "#2ecc71" : (isSelf ? "var(--primary)" : "#f1c40f");

            msgDiv.innerHTML = `
                <small style="color:#444">[${time}]</small> 
                <b style="color:${color}; cursor:pointer" class="chat-nick">${senderDisplayName}:</b> 
                <span style="color:#eee">${this.escapeHTML(text)}</span>
            `;

            if (!isSelf && type !== 'SYSTEM') {
                const nickSpan = msgDiv.querySelector('.chat-nick');
                nickSpan.onclick = (e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('playerClicked', { detail: sender }));
                };
            }
        }

        this.messagesBox.appendChild(msgDiv);
        this.limitMessages(this.isMobile() ? 60 : 150);

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
            this.toggleBtn.style.borderColor = "white";
            this.toggleBtn.innerHTML = `💬 ${this.unreadCount}`;
        } else {
            this.toggleBtn.style.background = "rgba(0,0,0,0.85)";
            this.toggleBtn.style.borderColor = "var(--primary)";
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
            this.addMessage('WHISPER_SELF', 'Você', text);
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
