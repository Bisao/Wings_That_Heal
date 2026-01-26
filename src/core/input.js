export class InputHandler {
    constructor() {
        this.keys = {};
        this.isMobile = this.detectMobile();
        
        // Input Desktop (Teclado)
        window.addEventListener('keydown', e => { if(e.key) this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', e => { if(e.key) this.keys[e.key.toLowerCase()] = false; });

        // Input Mobile (Touch)
        this.leftStick = null;

        if (this.isMobile) {
            this.ensureMobileControlsExist(); // Garante que o HTML exista
            this.leftStick = new VirtualJoystick('stick-left-zone', 'stick-left-knob');
        }
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Função de Auto-Correção:
     * Se o HTML não tiver os joysticks, este script cria eles dinamicamente.
     */
    ensureMobileControlsExist() {
        if (document.getElementById('mobile-controls')) {
            document.getElementById('mobile-controls').style.display = 'block';
            return;
        }

        console.log("[Input] Injetando controles mobile no DOM...");

        // 1. Criar Estilos
        const style = document.createElement('style');
        style.innerHTML = `
            #mobile-controls {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                z-index: 100; pointer-events: none;
            }
            .joystick-zone {
                position: absolute; bottom: 50px; width: 120px; height: 120px;
                background: rgba(255, 255, 255, 0.05);
                border: 2px dashed rgba(255, 255, 255, 0.1);
                border-radius: 50%; pointer-events: auto; touch-action: none;
            }
            #stick-left-zone { left: 30px; }
            .joystick-knob {
                position: absolute; top: 50%; left: 50%; width: 50px; height: 50px;
                background: rgba(241, 196, 15, 0.5); border: 2px solid #f1c40f;
                border-radius: 50%; transform: translate(-50%, -50%);
                box-shadow: 0 0 15px #f1c40f; pointer-events: none;
            }
        `;
        document.head.appendChild(style);

        // 2. Criar Elementos HTML
        const container = document.createElement('div');
        container.id = 'mobile-controls';
        container.innerHTML = `
            <div id="stick-left-zone" class="joystick-zone">
                <div id="stick-left-knob" class="joystick-knob"></div>
            </div>
        `;
        document.body.appendChild(container);
    }

    getMovement() {
        // 1. Mobile Joystick
        if (this.isMobile && this.leftStick) {
            if (this.leftStick.vector.x !== 0 || this.leftStick.vector.y !== 0) {
                return { x: this.leftStick.vector.x, y: this.leftStick.vector.y };
            }
        }

        // 2. Teclado (Fallback ou Desktop)
        let x = 0, y = 0;
        if (this.keys['w'] || this.keys['arrowup']) y -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) y += 1;
        if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
        if (this.keys['d'] || this.keys['arrowright']) x += 1;

        // Normalização
        if (x !== 0 || y !== 0) {
            const length = Math.sqrt(x*x + y*y);
            x /= length;
            y /= length;
        }

        return { x, y };
    }
    
    setChatMode(isActive) {
        if(isActive) this.keys = {};
    }
}

// Classe interna para gerenciar o toque
class VirtualJoystick {
    constructor(zoneId, knobId) {
        this.zone = document.getElementById(zoneId);
        this.knob = document.getElementById(knobId);
        this.vector = { x: 0, y: 0 };
        this.touchId = null;
        this.origin = { x: 0, y: 0 };
        this.radius = 40; // Raio de movimento

        if (!this.zone || !this.knob) return;

        // Use {passive: false} para permitir e.preventDefault()
        this.zone.addEventListener('touchstart', e => this.onTouchStart(e), {passive: false});
        this.zone.addEventListener('touchmove', e => this.onTouchMove(e), {passive: false});
        this.zone.addEventListener('touchend', e => this.onTouchEnd(e), {passive: false});
        this.zone.addEventListener('touchcancel', e => this.onTouchEnd(e), {passive: false});
    }

    onTouchStart(e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (this.touchId === null) {
                this.touchId = touch.identifier;
                const rect = this.zone.getBoundingClientRect();
                this.origin.x = rect.left + rect.width / 2;
                this.origin.y = rect.top + rect.height / 2;
                this.updateKnob(touch.clientX, touch.clientY);
            }
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (this.touchId === e.changedTouches[i].identifier) {
                this.updateKnob(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                break;
            }
        }
    }

    onTouchEnd(e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (this.touchId === e.changedTouches[i].identifier) {
                this.touchId = null;
                this.vector = { x: 0, y: 0 };
                this.knob.style.transform = `translate(-50%, -50%)`;
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
        
        const newX = Math.cos(angle) * limit;
        const newY = Math.sin(angle) * limit;

        this.knob.style.transform = `translate(calc(-50% + ${newX}px), calc(-50% + ${newY}px))`;
        
        // Vetor normalizado (-1 a 1)
        this.vector = {
            x: newX / this.radius,
            y: newY / this.radius
        };
    }
}
