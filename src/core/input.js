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

        // Binda os eventos com passive: false para evitar scroll
        this.zone.addEventListener('touchstart', e => this.onTouchStart(e), {passive: false});
        this.zone.addEventListener('touchmove', e => this.onTouchMove(e), {passive: false});
        this.zone.addEventListener('touchend', e => this.onTouchEnd(e), {passive: false});
        this.zone.addEventListener('touchcancel', e => this.onTouchEnd(e), {passive: false});
    }

    onTouchStart(e) {
        if (this.touchId !== null) return;
        
        // [INTERAÇÃO] Avisa o jogo que o jogador está se movendo (útil para fechar chat)
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
        
        // Joysticks Virtuais
        this.leftStick = null;  
        this.rightStick = null; 
        
        // Novos Botões de Ação (Mobile)
        this.btnCollect = null;
        this.btnPollinate = null;
        
        // Estados de Input
        this.isCollectingHeld = false;
        this.isPollinatingHeld = false;

        // Controle de Mouse (PC)
        this.mousePos = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.aimVectorPC = { x: 0, y: 0 };

        this.init();
    }

    init() {
        // Eventos de Teclado (PC)
        window.addEventListener('keydown', e => { if(e.key) this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', e => { if(e.key) this.keys[e.key.toLowerCase()] = false; });

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

    // [NOVO] Verifica se o jogador quer coletar pólen (Teclado: E ou Clique no Botão)
    isCollecting() {
        return this.keys['e'] || this.isCollectingHeld;
    }

    // [NOVO] Verifica se o jogador quer polinizar (Teclado: F ou Clique no Botão)
    isPollinating() {
        return this.keys['f'] || this.isPollinatingHeld;
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
                margin-left: env(safe-area-inset-left);
                margin-bottom: env(safe-area-inset-bottom);
            }

            #stick-right-zone {
                position: absolute; bottom: 30px; right: 30px; 
                width: 140px; height: 140px; pointer-events: auto;
                margin-right: env(safe-area-inset-right);
                margin-bottom: env(safe-area-inset-bottom);
            }

            .joystick-zone {
                border-radius: 50%;
                background: rgba(255,255,255,0.08); 
                border: 2px solid rgba(255,255,255,0.15);
                position: relative;
                touch-action: none;
            }
            
            #stick-right-zone.joystick-zone { border-color: rgba(255, 50, 50, 0.3); }

            .joystick-knob {
                position: absolute; top: 50%; left: 50%;
                width: 60px; height: 60px; background: rgba(255, 215, 0, 0.9);
                border-radius: 50%; transform: translate(-50%, -50%);
                box-shadow: 0 0 15px rgba(0,0,0,0.4); pointer-events: none;
            }

            #stick-right-knob { background: rgba(231, 76, 60, 0.9) !important; }

            /* [NOVO] Container para botões de ação acima do stick direito */
            .mobile-action-group {
                position: absolute;
                bottom: 180px; right: 30px;
                display: flex; flex-direction: column; gap: 15px;
                pointer-events: none;
                margin-right: env(safe-area-inset-right);
                margin-bottom: env(safe-area-inset-bottom);
            }

            .btn-bee-action {
                width: 70px; height: 70px;
                border-radius: 50%; border: 3px solid white;
                color: white; font-weight: 900; font-size: 12px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                pointer-events: auto; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                transition: transform 0.1s, opacity 0.3s;
                text-shadow: 1px 1px 2px black;
                font-family: 'Nunito', sans-serif;
            }
            
            .btn-bee-action span { font-size: 20px; }
            .btn-bee-action:active { transform: scale(0.9); }

            #btn-collect { background: #3498db; display: none; } /* Azul Coleta */
            #btn-pollinate { background: #2ecc71; opacity: 0.4; } /* Verde Polinizar */

            @media (max-width: 768px) and (orientation: landscape) {
                #stick-left-zone, #stick-right-zone { width: 110px; height: 110px; bottom: 15px; }
                .joystick-knob { width: 50px; height: 50px; }
                .mobile-action-group { bottom: 135px; right: 20px; gap: 10px; }
                .btn-bee-action { width: 55px; height: 55px; font-size: 10px; }
                .btn-bee-action span { font-size: 16px; }
            }
        `;
        document.head.appendChild(style);
    }

    injectMobileHTML() {
        if (document.getElementById('mobile-controls-container')) return;
        const div = document.createElement('div');
        div.id = 'mobile-controls-container';
        div.innerHTML = `
            <div id="stick-left-zone" class="joystick-zone">
                <div id="stick-left-knob" class="joystick-knob"></div>
            </div>

            <div class="mobile-action-group">
                <button id="btn-pollinate" class="btn-bee-action">
                    <span>✨</span>SOLTAR
                </button>
                <button id="btn-collect" class="btn-bee-action">
                    <span>🍯</span>COLHER
                </button>
            </div>

            <div id="stick-right-zone" class="joystick-zone">
                <div id="stick-right-knob" class="joystick-knob"></div>
            </div>
        `;
        document.body.appendChild(div);
        this.btnCollect = document.getElementById('btn-collect');
        this.btnPollinate = document.getElementById('btn-pollinate');
    }

    bindMobileActionEvents() {
        const setupBtn = (btn, heldVar) => {
            if (!btn) return;
            btn.addEventListener('pointerdown', (e) => { 
                e.preventDefault(); 
                this[heldVar] = true; 
                window.dispatchEvent(new CustomEvent('joystickInteract'));
            });
            btn.addEventListener('pointerup', (e) => { e.preventDefault(); this[heldVar] = false; });
            btn.addEventListener('pointerleave', (e) => { e.preventDefault(); this[heldVar] = false; });
        };

        setupBtn(this.btnCollect, 'isCollectingHeld');
        setupBtn(this.btnPollinate, 'isPollinatingHeld');
    }

    /**
     * [NOVO] Gerencia a visibilidade e estado dos botões de ação
     * @param {Object} state - { canCollect: bool, hasPollen: bool, overBurntGround: bool }
     */
    updateBeeActions(state) {
        if (!this.isMobile) return;

        // Botão de Coleta só aparece perto de flores
        if (this.btnCollect) {
            this.btnCollect.style.display = state.canCollect ? 'flex' : 'none';
        }

        // Botão de Polinização: Visível se tem pólen, Brilhante se sobre terra queimada
        if (this.btnPollinate) {
            this.btnPollinate.style.opacity = state.hasPollen ? "1.0" : "0.4";
            if (state.hasPollen && state.overBurntGround) {
                this.btnPollinate.style.boxShadow = "0 0 20px #2ecc71";
                this.btnPollinate.style.border = "3px solid #fff";
            } else {
                this.btnPollinate.style.boxShadow = "0 5px 15px rgba(0,0,0,0.3)";
                this.btnPollinate.style.border = "3px solid rgba(255,255,255,0.5)";
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
        if (this.leftStick) this.leftStick.reset();
        if (this.rightStick) this.rightStick.reset();
        this.isCollectingHeld = false;
        this.isPollinatingHeld = false;
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
            return { x: vec.x, y: vec.y, isFiring: mag > 0.2 };
        }
        return { x: this.aimVectorPC.x, y: this.aimVectorPC.y, isFiring: this.isMouseDown };
    }
}
