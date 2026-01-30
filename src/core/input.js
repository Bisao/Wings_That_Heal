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
        
        // [INTERAÇÃO] Avisa o jogo que o analógico foi tocado (para fechar chat)
        window.dispatchEvent(new CustomEvent('joystickInteract'));

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const rect = this.zone.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.sqrt(Math.pow(touch.clientX - centerX, 2) + Math.pow(touch.clientY - centerY, 2));

            if (dist <= rect.width / 2) {
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
        this.isMobileActionHeld = false;
        this.actionBtn = null;

        window.addEventListener('keydown', e => { if(e.key) this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', e => { if(e.key) this.keys[e.key.toLowerCase()] = false; });

        if (this.isMobile) {
            this.injectMobileStyles();
            this.injectMobileHTML();
            this.leftStick = new VirtualJoystick('stick-left-zone', 'stick-left-knob');
            this.bindMobileActionEvents();
        }
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    isActionActive() {
        return this.keys['e'] || this.keys[' '] || this.isMobileActionHeld;
    }

    injectMobileStyles() {
        if (document.getElementById('joystick-styles')) return;
        const style = document.createElement('style');
        style.id = 'joystick-styles';
        style.innerHTML = `
            #mobile-controls {
                display: none; position: fixed; bottom: 40px; left: 40px; 
                width: 120px; height: 120px; z-index: 1000; pointer-events: none;
            }
            .joystick-zone {
                width: 100%; height: 100%; border-radius: 50%;
                background: rgba(255,255,255,0.1); border: 2px solid rgba(255,215,0,0.3);
                position: relative; pointer-events: auto;
            }
            .joystick-knob {
                position: absolute; top: 50%; left: 50%;
                width: 50px; height: 50px; background: #FFD700;
                border-radius: 50%; transform: translate(-50%, -50%);
                box-shadow: 0 0 15px rgba(255,215,0,0.5); pointer-events: none;
            }
            .mobile-action-btn {
                position: fixed; bottom: 40px; right: 100px;
                background: #2ecc71; color: white; padding: 20px; border-radius: 50px;
                font-weight: 900; border: 4px solid white; z-index: 1000;
                display: none; transition: transform 0.1s; pointer-events: auto;
            }
            .mobile-action-btn:active { transform: scale(0.9); }
        `;
        document.head.appendChild(style);
    }

    injectMobileHTML() {
        if (document.getElementById('mobile-controls')) return;
        const div = document.createElement('div');
        div.id = 'mobile-controls';
        div.innerHTML = `
            <div id="stick-left-zone" class="joystick-zone">
                <div id="stick-left-knob" class="joystick-knob"></div>
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
                // Fecha chat ao usar ação também
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
            const el = document.getElementById('mobile-controls');
            if (el) el.style.display = 'block';
        }
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
        if (x !== 0 && y !== 0) { x *= 0.707; y *= 0.707; }
        return { x, y };
    }
}
