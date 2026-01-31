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

            // Aumentei um pouco a tolerância do toque inicial para facilitar
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
        this.leftStick = null;  // Movimento
        this.rightStick = null; // Mira/Tiro
        
        this.isMobileActionHeld = false;
        this.actionBtn = null;

        // Controle de Mouse (PC)
        this.mousePos = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.aimVectorPC = { x: 0, y: 0 };

        this.init();
    }

    init() {
        // Eventos de Teclado
        window.addEventListener('keydown', e => { if(e.key) this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', e => { if(e.key) this.keys[e.key.toLowerCase()] = false; });

        if (this.isMobile) {
            this.injectMobileStyles();
            this.injectMobileHTML();
            
            // Inicializa os dois analógicos
            this.leftStick = new VirtualJoystick('stick-left-zone', 'stick-left-knob');
            this.rightStick = new VirtualJoystick('stick-right-zone', 'stick-right-knob');
            
            this.bindMobileActionEvents();
        } else {
            this.setupMouseControls();
        }
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    setupMouseControls() {
        window.addEventListener('mousemove', e => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            
            // Calcula vetor de mira baseado no centro da tela (onde o player sempre está)
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

        window.addEventListener('mousedown', e => {
            if (e.button === 0) this.isMouseDown = true; // Botão esquerdo
        });

        window.addEventListener('mouseup', e => {
            if (e.button === 0) this.isMouseDown = false;
        });
    }

    isActionActive() {
        return this.keys['e'] || this.keys[' '] || this.isMobileActionHeld;
    }

    injectMobileStyles() {
        if (document.getElementById('joystick-styles')) return;
        const style = document.createElement('style');
        style.id = 'joystick-styles';
        style.innerHTML = `
            /* Container geral para evitar que toques passem para o canvas */
            #mobile-controls-container {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                pointer-events: none; z-index: 1000;
            }

            /* Analógico Esquerdo (Movimento) */
            #stick-left-zone {
                position: absolute; bottom: 40px; left: 40px; 
                width: 120px; height: 120px; pointer-events: auto;
            }

            /* Analógico Direito (Mira) */
            #stick-right-zone {
                position: absolute; bottom: 40px; right: 40px; 
                width: 120px; height: 120px; pointer-events: auto;
            }

            .joystick-zone {
                border-radius: 50%;
                background: rgba(255,255,255,0.05); 
                border: 2px solid rgba(255,255,255,0.1);
                position: relative;
            }
            
            /* Estilo diferente para o analógico de mira (vermelho) */
            #stick-right-zone.joystick-zone {
                border-color: rgba(255, 50, 50, 0.2);
            }

            .joystick-knob {
                position: absolute; top: 50%; left: 50%;
                width: 50px; height: 50px; background: rgba(255, 215, 0, 0.8);
                border-radius: 50%; transform: translate(-50%, -50%);
                box-shadow: 0 0 10px rgba(0,0,0,0.3); pointer-events: none;
            }

            /* Knob de mira vermelho */
            #stick-right-knob {
                background: rgba(231, 76, 60, 0.8) !important;
            }

            .mobile-action-btn {
                position: fixed; bottom: 180px; /* Acima do analógico direito */
                right: 60px;
                background: #2ecc71; color: white; padding: 15px 25px; border-radius: 50px;
                font-weight: 900; border: 3px solid white; z-index: 1001;
                display: none; transition: transform 0.1s; pointer-events: auto;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                font-family: sans-serif;
                font-size: 14px;
            }
            .mobile-action-btn:active { transform: scale(0.9); }
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

            <div id="stick-right-zone" class="joystick-zone">
                <div id="stick-right-knob" class="joystick-knob"></div>
            </div>

            <button id="mobile-action-btn" class="mobile-action-btn">AÇÃO</button>
        `;
        document.body.appendChild(div);
        this.actionBtn = document.getElementById('mobile-action-btn');
    }

    bindMobileActionEvents() {
        if (!this.actionBtn) return;
        
        const setHeld = (s) => { 
            this.isMobileActionHeld = s;
            if(s) {
                this.actionBtn.style.transform = "scale(0.9)";
                window.dispatchEvent(new CustomEvent('joystickInteract'));
            } else {
                this.actionBtn.style.transform = "scale(1.0)";
            }
        };

        this.actionBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setHeld(true); });
        this.actionBtn.addEventListener('pointerup', (e) => { e.preventDefault(); setHeld(false); });
        this.actionBtn.addEventListener('pointerleave', (e) => { e.preventDefault(); setHeld(false); });
        this.actionBtn.addEventListener('contextmenu', e => e.preventDefault());
    }

    updateActionButton(visible, text = "AÇÃO", color = "#2ecc71") {
        if (!this.actionBtn) return;
        
        if (visible) {
            this.actionBtn.style.display = 'block';
            this.actionBtn.innerText = text;
            this.actionBtn.style.background = color;
        } else {
            this.actionBtn.style.display = 'none';
        }
    }

    showJoystick() {
        if (this.isMobile) {
            const el = document.getElementById('mobile-controls-container');
            if (el) el.style.display = 'block';
        }
    }

    getMovement() {
        // Prioridade para Touch Esquerdo
        if (this.isMobile && this.leftStick && this.leftStick.touchId !== null) {
            return { x: this.leftStick.vector.x, y: this.leftStick.vector.y };
        }

        // Fallback para Teclado (PC)
        let x = 0, y = 0;
        if (this.keys['w'] || this.keys['arrowup']) y -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) y += 1;
        if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
        if (this.keys['d'] || this.keys['arrowright']) x += 1;
        
        // Normaliza para evitar velocidade dobrada na diagonal
        if (x !== 0 && y !== 0) { 
            const len = Math.sqrt(x*x + y*y);
            x /= len; 
            y /= len; 
        }
        
        return { x, y };
    }

    // [NOVO] Retorna vetor de mira e se está atirando
    getAim() {
        // Modo Mobile: Analógico Direito
        if (this.isMobile && this.rightStick) {
            const vec = this.rightStick.vector;
            const mag = Math.sqrt(vec.x*vec.x + vec.y*vec.y);
            // Considera "atirando" se empurrar o analógico um pouco (deadzone 0.2)
            const isFiring = mag > 0.2;
            
            return { 
                x: vec.x, 
                y: vec.y, 
                isFiring: isFiring 
            };
        }

        // Modo PC: Mouse
        return {
            x: this.aimVectorPC.x,
            y: this.aimVectorPC.y,
            isFiring: this.isMouseDown
        };
    }
}
