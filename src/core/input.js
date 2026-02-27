// Classe interna para gerenciar um único joystick
class VirtualJoystick {
    constructor(zoneId, knobId) {
        this.zone = document.getElementById(zoneId);
        this.knob = document.getElementById(knobId);
        
        if (!this.zone || !this.knob) return; 

        this.vector = { x: 0, y: 0 };
        this.touchId = null;
        this.origin = { x: 0, y: 0 };
        this.radius = 50; 

        this.zone.addEventListener('touchstart', e => this.onTouchStart(e), {passive: false});
        this.zone.addEventListener('touchmove', e => this.onTouchMove(e), {passive: false});
        this.zone.addEventListener('touchend', e => this.onTouchEnd(e), {passive: false});
        this.zone.addEventListener('touchcancel', e => this.onTouchEnd(e), {passive: false});
    }

    onTouchStart(e) {
        if (this.touchId !== null) return;
        window.dispatchEvent(new CustomEvent('joystickInteract'));

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const rect = this.zone.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.sqrt(Math.pow(touch.clientX - centerX, 2) + Math.pow(touch.clientY - centerY, 2));

            if (dist <= rect.width / 1.5) {
                e.preventDefault();
                this.touchId = touch.identifier;
                this.origin.x = centerX;
                this.origin.y = centerY;
                this.updateKnob(touch.clientX, touch.clientY);
                break;
            }
        }
    }

    onTouchMove(e) {
        if (this.touchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.touchId) {
                e.preventDefault();
                this.updateKnob(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                break;
            }
        }
    }

    onTouchEnd(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.touchId) {
                e.preventDefault();
                this.reset();
                break;
            }
        }
    }

    updateKnob(clientX, clientY) {
        const dx = clientX - this.origin.x;
        const dy = clientY - this.origin.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(dy, dx);
        const limit = Math.min(distance, this.radius);
        const force = Math.min(distance / this.radius, 1.0);
        this.vector.x = Math.cos(angle) * force;
        this.vector.y = Math.sin(angle) * force;
        const knobX = Math.cos(angle) * limit;
        const knobY = Math.sin(angle) * limit;
        this.knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
    }

    reset() {
        this.touchId = null;
        this.vector = { x: 0, y: 0 };
        this.knob.style.transform = `translate(-50%, -50%)`;
    }
}

export class InputHandler {
    constructor() {
        this.keys = {};
        this.isMobile = this.detectMobile();
        
        this.leftStick = null;  
        this.rightStick = null; 
        
        this.btnCollect = null;
        this.btnPollinate = null;
        this.btnCollectLabel = null; // Para mudar o texto do botão de ação
        
        // ESTADOS ATUALIZADOS
        this.isCollectingHeld = false; // Coleta continua sendo HOLD (segurar)
        this.pollinationToggle = false; // Polinização agora é TOGGLE (clicar para ativar)

        this.mousePos = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.aimVectorPC = { x: 0, y: 0 };

        this.init();
    }

    init() {
        window.addEventListener('keydown', e => { 
            if (!e || !e.key) return; 

            const key = e.key.toLowerCase();
            // Lógica de Toggle para PC (Tecla F)
            if (key === 'f') {
                this.pollinationToggle = !this.pollinationToggle;
            }
            this.keys[key] = true; 
        });
        
        window.addEventListener('keyup', e => { 
            if(e && e.key) this.keys[e.key.toLowerCase()] = false; 
        });

        window.addEventListener('skillTreeToggled', (e) => {
            if (e.detail.isOpen) this.hideJoystick();
            else this.showJoystick();
        });

        if (this.isMobile) {
            this.handleOrientationLock();
            this.injectMobileStyles();
            this.injectMobileHTML();
            this.leftStick = new VirtualJoystick('stick-left-zone', 'stick-left-knob');
            this.rightStick = new VirtualJoystick('stick-right-zone', 'stick-right-knob');
            this.bindMobileActionEvents();
        } else {
            this.setupMouseControls();
        }
    }

    detectMobile() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        return (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || 
                (navigator.maxTouchPoints && navigator.maxTouchPoints > 1));
    }

    async handleOrientationLock() {
        if (screen.orientation && screen.orientation.lock) {
            try { await screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
        }
    }

    setupMouseControls() {
        window.addEventListener('mousemove', e => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const dx = this.mousePos.x - centerX;
            const dy = this.mousePos.y - centerY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 0) {
                this.aimVectorPC.x = dx / dist;
                this.aimVectorPC.y = dy / dist;
            }
        });
        window.addEventListener('mousedown', e => { if (e.button === 0) this.isMouseDown = true; });
        window.addEventListener('mouseup', e => { if (e.button === 0) this.isMouseDown = false; });
    }

    isCollecting() {
        return this.keys['e'] || this.isCollectingHeld;
    }

    // Retorna o estado do toggle
    isPollinating() {
        return this.pollinationToggle;
    }

    // Método para desativar via script (ex: quando atacar)
    resetPollinationToggle() {
        this.pollinationToggle = false;
        if (this.btnPollinate) this.btnPollinate.classList.remove('is-active');
    }

    injectMobileStyles() {
        if (document.getElementById('joystick-styles')) return;
        const style = document.createElement('style');
        style.id = 'joystick-styles';
        style.innerHTML = `
            #mobile-controls-container {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                pointer-events: none; z-index: 8500; display: none;
            }
            #stick-left-zone {
                position: absolute; bottom: 30px; left: 30px; 
                width: 140px; height: 140px; pointer-events: auto;
            }
            #stick-right-zone {
                position: absolute; bottom: 30px; right: 30px; 
                width: 140px; height: 140px; pointer-events: auto;
            }
            .joystick-zone {
                border-radius: 50%;
                background: rgba(255,255,255,0.08); 
                border: 2px solid rgba(255,255,255,0.15);
                position: relative;
                touch-action: none;
            }
            .joystick-knob {
                position: absolute; top: 50%; left: 50%;
                width: 60px; height: 60px; background: rgba(255, 215, 0, 0.9);
                border-radius: 50%; transform: translate(-50%, -50%);
                pointer-events: none;
            }
            #stick-right-knob { background: rgba(231, 76, 60, 0.9) !important; }
            .mobile-action-group {
                position: absolute; bottom: 180px; right: 30px;
                display: flex; flex-direction: column; gap: 15px;
                pointer-events: none;
            }
            .btn-bee-action {
                width: 70px; height: 70px;
                border-radius: 50%; border: 3px solid white;
                color: white; font-weight: 900; font-size: 11px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                pointer-events: auto; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                transition: all 0.2s;
                user-select: none; 
                -webkit-touch-callout: none;
                -webkit-user-select: none;
            }
            #btn-collect { background: #3498db; display: none; }
            #btn-pollinate { background: #2ecc71; opacity: 0.4; }
            
            .btn-bee-action.is-active {
                background-color: #f39c12 !important;
                box-shadow: 0 0 20px #f39c12;
                transform: scale(1.1);
            }

            @media (max-width: 768px) and (orientation: landscape) {
                #stick-left-zone, #stick-right-zone { width: 110px; height: 110px; }
                .mobile-action-group { bottom: 135px; }
                .btn-bee-action { width: 55px; height: 55px; font-size: 9px; }
            }
        `;
        document.head.appendChild(style);
    }

    injectMobileHTML() {
        if (document.getElementById('mobile-controls-container')) return;
        const div = document.createElement('div');
        div.id = 'mobile-controls-container';
        div.innerHTML = `
            <div id="stick-left-zone" class="joystick-zone"><div id="stick-left-knob" class="joystick-knob"></div></div>
            <div class="mobile-action-group">
                <button id="btn-pollinate" class="btn-bee-action"><span>✨</span>SOLTAR</button>
                <button id="btn-collect" class="btn-bee-action"><span id="collect-icon">🍯</span><span id="collect-label">COLHER</span></button>
            </div>
            <div id="stick-right-zone" class="joystick-zone"><div id="stick-right-knob" class="joystick-knob"></div></div>
        `;
        document.body.appendChild(div);
        this.btnCollect = document.getElementById('btn-collect');
        this.btnPollinate = document.getElementById('btn-pollinate');
        this.btnCollectLabel = document.getElementById('collect-label');
        this.btnCollectIcon = document.getElementById('collect-icon');
    }

    bindMobileActionEvents() {
        if (!this.btnCollect || !this.btnPollinate) return;
        
        // Botão de Ação (Coleta / Resgate) - Baseado em HOLD
        this.btnCollect.addEventListener('touchstart', (e) => {
            e.preventDefault(); 
            this.isCollectingHeld = true;
            this.btnCollect.style.transform = 'scale(0.9)';
        }, { passive: false });

        this.btnCollect.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isCollectingHeld = false;
            this.btnCollect.style.transform = 'scale(1.0)';
        }, { passive: false });

        this.btnCollect.addEventListener('touchcancel', (e) => {
            this.isCollectingHeld = false;
            this.btnCollect.style.transform = 'scale(1.0)';
        });
        
        this.btnCollect.oncontextmenu = function(e) {
             e.preventDefault();
             e.stopPropagation();
             return false;
        };

        // Botão SOLTAR (Polinizar Toggle)
        this.btnPollinate.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.pollinationToggle = !this.pollinationToggle;
            
            if (this.pollinationToggle) {
                this.btnPollinate.classList.add('is-active');
            } else {
                this.btnPollinate.classList.remove('is-active');
            }
            window.dispatchEvent(new CustomEvent('joystickInteract'));
        }, { passive: false });
        
        this.btnPollinate.oncontextmenu = function(e) { e.preventDefault(); e.stopPropagation(); return false; };
    }

    /**
     * ATUALIZADO: Gerencia a visibilidade e o texto dos botões mobile.
     * @param {object} state - Estado enviado pelo Game.js (canCollect, isRescue, etc)
     */
    updateBeeActions(state) {
        if (!this.isMobile) return;
        
        // Controle do botão de Ação (Colher / Resgatar)
        if (this.btnCollect) {
            // O botão aparece se puder coletar OU se houver um resgate disponível
            const shouldShow = state.canCollect || state.isRescue;
            this.btnCollect.style.display = shouldShow ? 'flex' : 'none';

            // Muda o rótulo do botão dependendo da ação
            if (state.isRescue) {
                this.btnCollect.style.backgroundColor = '#f1c40f'; // Amarelo para resgate
                if (this.btnCollectLabel) this.btnCollectLabel.innerText = "AJUDAR";
                if (this.btnCollectIcon) this.btnCollectIcon.innerText = "❤️";
            } else {
                this.btnCollect.style.backgroundColor = '#3498db'; // Azul para coleta
                if (this.btnCollectLabel) this.btnCollectLabel.innerText = "COLHER";
                if (this.btnCollectIcon) this.btnCollectIcon.innerText = "🍯";
            }

            // Garante que a flag de hold não trave se o botão sumir
            if (!shouldShow && this.isCollectingHeld) {
                this.isCollectingHeld = false;
                this.btnCollect.style.transform = 'scale(1.0)';
            }
        }
        
        // Controle do botão de Polinização
        if (this.btnPollinate) {
            this.btnPollinate.style.opacity = state.hasPollen ? "1.0" : "0.4";
            if (!state.hasPollen && this.pollinationToggle) {
                this.resetPollinationToggle();
            }
        }
    }

    showJoystick() {
        if (this.isMobile) {
            const el = document.getElementById('mobile-controls-container');
            if (el) el.style.display = 'block';
        }
    }
    
    hideJoystick() {
        const el = document.getElementById('mobile-controls-container');
        if (el) el.style.display = 'none';
        this.pollinationToggle = false;
        this.isCollectingHeld = false;
    }

    getMovement() {
        if (this.isMobile && this.leftStick && this.leftStick.touchId !== null) {
            return { x: this.leftStick.vector.x, y: this.leftStick.vector.y };
        }
        let x = 0, y = 0;
        if (this.keys['w'] || this.keys['arrowup']) y -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) y += 1;
        if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
        if (this.keys['d'] || this.keys['arrowright']) x += 1;
        if (x !== 0 && y !== 0) { 
            const len = Math.sqrt(x*x + y*y);
            x /= len; y /= len; 
        }
        return { x, y };
    }

    getAim() {
        if (this.isMobile && this.rightStick) {
            const vec = this.rightStick.vector;
            const mag = Math.sqrt(vec.x*vec.x + vec.y*vec.y);
            
            // Se o player começar a mirar/atirar, desliga a polinização automática
            if (mag > 0.2 && this.pollinationToggle) {
                this.resetPollinationToggle();
            }
            
            return { x: vec.x, y: vec.y, isFiring: mag > 0.2 };
        }
        
        if (this.isMouseDown && this.pollinationToggle) {
            this.resetPollinationToggle();
        }
        
        return { x: this.aimVectorPC.x, y: this.aimVectorPC.y, isFiring: this.isMouseDown };
    }
}
