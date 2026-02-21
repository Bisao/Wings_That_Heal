export class ChatSystem {
    constructor() {
        this.isVisible = false;
        this.unreadCount = 0;
        this.activeTab = 'GLOBAL'; 
        this.channels = ['GLOBAL', 'SYSTEM']; 
        this.notifications = {}; 
        this.isDropdownOpen = false; // Controle do menu de abas
        
        // Dados da Party
        this.currentPartyName = "";
        this.currentPartyIcon = "";

        // Elementos DOM
        this.container = document.getElementById('chat-container');
        this.toggleBtn = document.getElementById('chat-toggle-btn');
        
        // Vamos recriar a estrutura interna do chat via JS para garantir o novo layout
        if (this.container) {
            this.rebuildDOM(); // Reconstrói o HTML interno para o novo layout
            
            this.headerTitle = document.getElementById('chat-header-title');
            this.dropdown = document.getElementById('chat-channel-dropdown');
            this.messagesBox = document.getElementById('chat-messages');
            this.input = document.getElementById('chat-input');
            this.sendBtn = document.getElementById('chat-send-btn');
            this.closeBtn = document.getElementById('chat-close-btn');

            this.injectProfessionalStyles();
            this.setupListeners();
            this.renderHeader(); // Renderiza o título inicial
        }
    }

    // Reconstrói a estrutura HTML para suportar o Menu Dropdown e o novo design
    rebuildDOM() {
        this.container.innerHTML = `
            <div id="chat-header-area">
                <button id="chat-header-title">GLOBAL ▾</button>
                <button id="chat-close-btn">✖</button>
            </div>
            
            <div id="chat-channel-dropdown" class="hidden">
            </div>

            <div id="chat-messages"></div>
            
            <div id="chat-input-area">
                <input type="text" id="chat-input" placeholder="Zumbir..." maxlength="100" autocomplete="off">
                <button id="chat-send-btn">➤</button>
            </div>
        `;
    }

    injectProfessionalStyles() {
        const styleId = 'wings-chat-style';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            :root {
                --honey: #FFD700;
                --honey-dark: #F39C12;
                --leaf: #8BC34A;
                --wax: #FFF8E1;
                --text-dark: #5D4037;
                --danger: #e74c3c;
            }

            /* Container Flutuante com Bordas Arredondadas (Orgânico) */
            #chat-container {
                position: fixed;
                bottom: 110px; /* Acima do joystick no PC/Tablet */
                left: 20px;
                width: 320px; /* Largura base */
                height: 45vh; /* Altura responsiva */
                max-height: 400px;
                background: rgba(255, 248, 225, 0.95); /* Cor de Cera translúcida */
                border: 2px solid var(--honey);
                border-radius: 20px;
                display: flex;
                flex-direction: column;
                z-index: 9000;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s;
                transform: scale(0); /* Começa oculto */
                transform-origin: bottom left;
                opacity: 0;
                pointer-events: none;
                font-family: 'Nunito', Tahoma, Geneva, Verdana, sans-serif;
                overflow: hidden;
            }

            #chat-container.open {
                transform: scale(1);
                opacity: 1;
                pointer-events: auto;
            }

            /* Header: Onde fica o seletor de canal */
            #chat-header-area {
                background: var(--honey);
                padding: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 2px solid rgba(0,0,0,0.05);
            }

            #chat-header-title {
                background: rgba(255,255,255,0.3);
                border: none;
                border-radius: 12px;
                padding: 5px 15px;
                font-weight: 900;
                color: var(--text-dark);
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
                transition: background 0.2s;
            }
            #chat-header-title:active { transform: scale(0.95); }

            #chat-close-btn {
                background: none;
                border: none;
                color: var(--text-dark);
                font-weight: bold;
                font-size: 18px;
                cursor: pointer;
                padding: 5px 10px;
            }

            /* Menu Dropdown (A Colmeia de Abas) */
            #chat-channel-dropdown {
                position: absolute;
                top: 45px; /* Logo abaixo do header */
                left: 0;
                width: 100%;
                background: var(--wax);
                border-bottom: 2px solid var(--honey);
                max-height: 200px;
                overflow-y: auto;
                z-index: 10;
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                display: none; /* Controlado via JS */
                flex-direction: column;
            }
            #chat-channel-dropdown.show { display: flex; }

            .channel-item {
                padding: 12px 20px;
                border-bottom: 1px solid rgba(0,0,0,0.05);
                background: transparent;
                border: none;
                text-align: left;
                font-weight: 800;
                color: var(--text-dark);
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-family: 'Nunito', sans-serif;
            }
            .channel-item:hover { background: rgba(255, 215, 0, 0.2); }
            .channel-item.active { background: rgba(139, 195, 74, 0.2); color: #33691E; }
            .channel-notify {
                width: 10px; height: 10px; background: var(--danger); border-radius: 50%;
                box-shadow: 0 0 5px var(--danger);
            }

            /* Área de Mensagens */
            #chat-messages {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                scrollbar-width: thin;
                scrollbar-color: var(--honey) transparent;
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            
            /* Área de Input */
            #chat-input-area {
                padding: 10px;
                background: white;
                display: flex;
                gap: 8px;
                border-top: 1px solid rgba(0,0,0,0.05);
            }

            #chat-input {
                flex: 1;
                border: 2px solid #EEE;
                border-radius: 20px;
                padding: 10px 15px;
                font-size: 14px;
                font-family: 'Nunito', sans-serif;
                outline: none;
                transition: border-color 0.2s;
                background: #f9f9f9;
                color: #333;
                width: 100%; /* Resolve problemas flex no mobile */
            }
            #chat-input:focus { border-color: var(--leaf); background: white; }

            #chat-send-btn {
                background: var(--leaf);
                color: white;
                border: none;
                width: 42px;
                height: 42px;
                border-radius: 50%;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                display: flex; align-items: center; justify-content: center;
                font-size: 18px;
            }
            #chat-send-btn:active { transform: scale(0.9); }

            /* Responsividade Mobile Horizontal */
            @media (max-width: 900px) and (orientation: landscape) {
                #chat-container {
                    width: 45vw;
                    height: 85vh;
                    left: 15px; top: 15px; bottom: auto;
                }
            }

            /* [ATUALIZADO] Responsividade Mobile Vertical (Retrato) */
            @media (max-width: 600px) and (orientation: portrait) {
                #chat-container {
                    width: calc(100% - 30px); /* Ocupa a tela com margem de 15px dos lados */
                    left: 15px;
                    bottom: 120px; /* Sobe o suficiente para liberar os joysticks base */
                    height: 50vh; /* Usa metade da tela */
                    max-height: none;
                    transform-origin: bottom center;
                }
                
                #chat-input-area {
                    padding: 8px;
                }
                
                #chat-input {
                    padding: 12px; /* Maior para facilitar o toque */
                    font-size: 16px; /* Evita o zoom automático agressivo do iOS ao focar num input */
                }
            }
        `;
        document.head.appendChild(style);
    }

    setupListeners() {
        // Botão da Bolha (Abrir chat)
        this.toggleBtn.onclick = () => this.toggleChat();

        // Botão Fechar (Dentro do chat)
        this.closeBtn.onclick = () => this.toggleChat();

        // Botão Título (Abrir/Fechar Menu de Canais)
        this.headerTitle.onclick = () => this.toggleDropdown();
        
        // Input
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Evita pular linha caso o input vire textarea no futuro
                this.triggerSend();
            }
        });
        
        // Impede que as teclas do jogo (WASD) movam o boneco enquanto digita no PC
        this.input.addEventListener('keydown', (e) => e.stopPropagation());
        
        // Retira o foco do input ao rolar a lista de mensagens (esconde o teclado no celular)
        this.messagesBox.addEventListener('touchstart', () => {
            if (this.isMobile() && document.activeElement === this.input) {
                this.input.blur();
            }
        }, {passive: true});

        this.sendBtn.onclick = () => {
            this.triggerSend();
            if (this.isMobile()) this.input.focus(); // Tenta manter o teclado aberto para próxima mensagem
        };
    }

    // --- LÓGICA DE INTERFACE ---

    // Renderiza o botão do topo com o nome do canal atual
    renderHeader() {
        let label = this.activeTab;
        if (this.activeTab === 'PARTY') {
            label = `${this.currentPartyIcon || '👥'} ${this.currentPartyName || 'Grupo'}`;
        } else if (this.activeTab !== 'GLOBAL' && this.activeTab !== 'SYSTEM') {
            label = `👤 ${this.activeTab.substring(0, 8)}...`; 
        }

        // Adiciona um indicador visual (bolinha vermelha) no header se houver mensagens em OUTROS canais
        const hasExternalNotify = Object.entries(this.notifications).some(([key, val]) => val === true && key !== this.activeTab);
        const notifyDot = hasExternalNotify ? `<span style="color:var(--danger); font-size:24px; line-height:0; margin-left: 5px;">•</span>` : '';

        this.headerTitle.innerHTML = `${label} ${notifyDot} ▾`;
        this.headerTitle.style.background = (this.activeTab === 'PARTY') ? 'rgba(46, 204, 113, 0.4)' : 'rgba(255,255,255,0.3)';
    }

    // Renderiza a lista vertical de canais (O Menu Colmeia)
    renderDropdown() {
        this.dropdown.innerHTML = '';
        
        this.channels.forEach(channel => {
            const btn = document.createElement('button');
            const hasNotify = this.notifications[channel] && this.activeTab !== channel;
            const isActive = this.activeTab === channel;

            btn.className = `channel-item ${isActive ? 'active' : ''}`;
            
            // Formatação do Nome
            let label = channel;
            let icon = '🌐'; // Global
            
            if (channel === 'SYSTEM') icon = '⚙️';
            else if (channel === 'PARTY') {
                icon = this.currentPartyIcon || '👥';
                label = this.currentPartyName || 'Grupo';
            }
            else if (channel !== 'GLOBAL') icon = '👤';

            btn.innerHTML = `
                <span>${icon} ${label}</span>
                ${hasNotify ? '<div class="channel-notify"></div>' : ''}
            `;

            btn.onclick = () => {
                this.switchTab(channel);
                this.toggleDropdown(false); // Fecha menu ao selecionar
            };
            
            this.dropdown.appendChild(btn);
        });
    }

    toggleDropdown(forceState = null) {
        if (forceState !== null) this.isDropdownOpen = forceState;
        else this.isDropdownOpen = !this.isDropdownOpen;

        if (this.isDropdownOpen) {
            this.renderDropdown();
            this.dropdown.classList.add('show');
            this.headerTitle.innerHTML = this.headerTitle.innerHTML.replace('▾', '▴');
        } else {
            this.dropdown.classList.remove('show');
            this.headerTitle.innerHTML = this.headerTitle.innerHTML.replace('▴', '▾');
        }
    }

    toggleChat() {
        this.isVisible = !this.isVisible;
        
        // [NOVO] Dispara evento global para o InputHandler pausar os joysticks
        window.dispatchEvent(new CustomEvent('chatToggled', { detail: { isOpen: this.isVisible } }));
        
        if (this.isVisible) {
            this.container.classList.add('open');
            this.toggleBtn.style.opacity = '0'; // Esconde a bolha enquanto o chat estiver aberto
            this.toggleBtn.style.pointerEvents = 'none';
            this.unreadCount = 0;
            this.updateNotification();
            
            // Foca no input apenas se não for mobile (para não abrir o teclado virtual na cara)
            if (!this.isMobile()) {
                setTimeout(() => this.input.focus(), 100);
            }
            
            this.scrollToBottom();
        } else {
            this.container.classList.remove('open');
            this.toggleBtn.style.opacity = '1';
            this.toggleBtn.style.pointerEvents = 'auto';
            this.toggleDropdown(false); // Garante que o dropdown feche
            this.input.blur(); // Garante que o teclado feche
        }
    }

    switchTab(tab) {
        this.activeTab = tab;
        this.notifications[tab] = false; 
        
        if (tab === 'SYSTEM') {
            this.input.disabled = true;
            this.input.placeholder = "Log (Apenas Leitura)";
            this.input.style.opacity = '0.5';
        } else {
            this.input.disabled = false;
            this.input.style.opacity = '1';
            if (tab === 'GLOBAL') this.input.placeholder = "Zumbir para todos...";
            else if (tab === 'PARTY') this.input.placeholder = `Falar com ${this.currentPartyName}...`;
            else this.input.placeholder = `Sussurrar para ${tab}...`;
        }

        this.renderHeader(); // Atualiza o título
        this.filterMessages();
    }

    // --- LÓGICA DE DADOS ---

    openPartyTab(pName = "", pIcon = "") {
        this.currentPartyName = pName;
        this.currentPartyIcon = pIcon;

        if (!this.channels.includes('PARTY')) {
            this.channels.push('PARTY');
            this.addMessage('SYSTEM', null, `Conectado à frequência do grupo ${pIcon} ${pName || 'GP'}.`);
        }
        // Se já estiver aberto, apenas atualiza o visual se necessário
        if (this.isDropdownOpen) this.renderDropdown();
    }

    closePartyTab() {
        this.channels = this.channels.filter(c => c !== 'PARTY');
        this.currentPartyName = "";
        this.currentPartyIcon = "";
        if (this.activeTab === 'PARTY') this.switchTab('GLOBAL');
        
        const msgs = this.messagesBox.querySelectorAll('[data-channel="PARTY"]');
        msgs.forEach(m => m.remove());
        
        if (this.isDropdownOpen) this.renderDropdown();
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
        msgDiv.style.padding = "10px 12px";
        msgDiv.style.borderRadius = "12px";
        msgDiv.style.marginBottom = "8px";
        msgDiv.style.fontSize = "14px";
        msgDiv.style.lineHeight = "1.4";
        msgDiv.style.background = "rgba(255,255,255,0.7)"; 
        msgDiv.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (type === 'SYSTEM') {
            msgDiv.style.borderLeft = "4px solid var(--honey)";
            msgDiv.style.background = "rgba(255, 215, 0, 0.15)";
            msgDiv.innerHTML = `<small style="color:#888; display:block; margin-bottom:2px;">${time}</small> <span style="color:#F39C12; font-weight:900;">🐝 SISTEMA:</span> ${text}`;
        } else {
            const isSelf = type === 'SELF' || type === 'WHISPER_SELF' || (type === 'PARTY' && sender === 'Você');
            const senderDisplayName = isSelf ? 'Você' : sender;
            
            // Cores Temáticas
            let nickColor = "#F39C12"; // Padrão
            if (type === 'PARTY') nickColor = "#27ae60"; // Verde Folha
            if (type === 'WHISPER' || type === 'WHISPER_SELF') nickColor = "#8e44ad"; // Roxo Flor
            if (isSelf) nickColor = "#5D4037"; // Terra

            const iconPrefix = (type === 'PARTY' && this.currentPartyIcon) ? `${this.currentPartyIcon} ` : '';

            msgDiv.innerHTML = `
                <div style="display:flex; flex-wrap: wrap; gap:5px; align-items:baseline;">
                    <b style="color:${nickColor}; cursor:pointer; font-weight:900;" class="chat-nick">${iconPrefix}${senderDisplayName}:</b> 
                    <span style="color:#333; word-break: break-word;">${this.escapeHTML(text)}</span>
                </div>
                <div style="font-size:10px; color:#aaa; text-align:right; margin-top:4px;">${time}</div>
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
        this.limitMessages(this.isMobile() ? 50 : 100); // Economiza memória no mobile

        // Notificações
        if (this.activeTab !== targetChannel) {
            this.notifications[targetChannel] = true;
            this.renderHeader(); // Atualiza a bolinha no topo
            if (this.isDropdownOpen) this.renderDropdown();
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
        // Pequeno delay garante que a DOM calculou a nova div antes de rolar
        setTimeout(() => {
            if (this.messagesBox) this.messagesBox.scrollTop = this.messagesBox.scrollHeight;
        }, 10);
    }

    updateNotification() {
        if (!this.toggleBtn) return;
        if (this.unreadCount > 0) {
            this.toggleBtn.style.background = "var(--danger)";
            this.toggleBtn.style.borderColor = "white";
            this.toggleBtn.innerHTML = `<span style="font-size:18px; margin-right:2px;">💬</span> <b style="font-size:14px">${this.unreadCount > 9 ? '9+' : this.unreadCount}</b>`;
            
            // Animação forte
            this.toggleBtn.style.transform = "scale(1.2)";
            setTimeout(() => this.toggleBtn.style.transform = "scale(1)", 300);
        } else {
            this.toggleBtn.style.background = "var(--honey)";
            this.toggleBtn.style.borderColor = "white";
            this.toggleBtn.innerHTML = '💬';
        }
    }

    triggerSend() {
        const text = this.input.value.trim();
        if (!text) return;
        this.input.value = '';

        if (text === '/sair' && this.channels.includes('PARTY')) {
            window.dispatchEvent(new CustomEvent('chatSend', { detail: { type: 'LEAVE_PARTY_CMD' } }));
            return;
        }

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
