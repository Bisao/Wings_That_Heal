// Classe interna para gerenciar um único joystick
class VirtualJoystick {
    constructor(zoneId, knobId) {
        this.zone = document.getElementById(zoneId);
        this.knob = document.getElementById(knobId);
        
        if (!this.zone || !this.knob) return; // Segurança contra IDs inexistentes

        this.vector = { x: 0, y: 0 };
        this.touchId = null;
        this.origin = { x: 0, y: 0 };
        this.radius = 50; 

        // Binda os eventos
        this.zone.addEventListener('touchstart', e => this.onTouchStart(e), {passive: false});
        this.zone.addEventListener('touchmove', e => this.onTouchMove(e), {passive: false});
        this.zone.addEventListener('touchend', e => this.onTouchEnd(e), {passive: false});
        this.zone.addEventListener('touchcancel', e => this.onTouchEnd(e), {passive: false});
    }

    onTouchStart(e) {
        if (this.touchId !== null) return;

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

        // Estado do Zoom
        this.currentZoom = 2.0; 
        this.minZoom = 0.5;
        this.maxZoom = 3.0;

        // Suporte a Pinch Zoom (Mobile)
        this.lastTouchDist = 0;

        // Listener Teclado
        window.addEventListener('keydown', e => { if(e.key) this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', e => { if(e.key) this.keys[e.key.toLowerCase()] = false; });

        if (this.isMobile) {
            this.injectMobileStyles();
            this.injectMobileHTML();
            this.leftStick = new VirtualJoystick('stick-left-zone', 'stick-left-knob');
            this.initMobileZoomEvents();
        }
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    injectMobileStyles() {
        if (document.getElementById('joystick-styles')) return;
        const style = document.createElement('style');
        style.id = 'joystick-styles';
        style.innerHTML = `
            #mobile-ui-container {
                display: none;
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                z-index: 1000; pointer-events: none;
            }
            #mobile-controls {
                position: absolute; bottom: 40px; left: 40px; 
                width: 120px; height: 120px;
                pointer-events: none;
            }
            .joystick-zone {
                width: 100%; height: 100%; border-radius: 50%;
                background: rgba(255,255,255,0.1); border: 2px solid rgba(241,196,15,0.3);
                position: relative; pointer-events: auto;
            }
            .joystick-knob {
                position: absolute; top: 50%; left: 50%;
                width: 50px; height: 50px; background: var(--primary);
                border-radius: 50%; transform: translate(-50%, -50%);
                box-shadow: 0 0 15px var(--honey-glow); pointer-events: none;
            }
            /* SLIDER DE ZOOM VERTICAL */
            #zoom-slider-container {
                position: absolute; right: 25px; top: 50%; transform: translateY(-50%);
                width: 40px; height: 200px; background: rgba(0,0,0,0.5);
                border-radius: 20px; border: 1px solid rgba(241,196,15,0.4);
                display: flex; flex-direction: column; align-items: center; justify-content: space-between;
                padding: 15px 0; pointer-events: auto;
            }
            #zoom-range {
                writing-mode: bt-lr; /* Vertical para browsers que suportam */
                -webkit-appearance: slider-vertical;
                width: 8px; height: 150px;
                background: #333;
                outline: none;
            }
            .zoom-label { color: var(--primary); font-size: 16px; font-weight: bold; font-family: sans-serif; }
        `;
        document.head.appendChild(style);
    }

    injectMobileHTML() {
        if (document.getElementById('mobile-ui-container')) return;
        const container = document.createElement('div');
        container.id = 'mobile-ui-container';
        container.innerHTML = `
            <div id="mobile-controls">
                <div id="stick-left-zone" class="joystick-zone">
                    <div id="stick-left-knob" class="joystick-knob"></div>
                </div>
            </div>
            <div id="zoom-slider-container">
                <span class="zoom-label">+</span>
                <input type="range" id="zoom-range" min="50" max="300" value="200">
                <span class="zoom-label">-</span>
            </div>
        `;
        document.body.appendChild(container);

        // Listener do Slider
        const slider = document.getElementById('zoom-range');
        slider.addEventListener('input', (e) => {
            this.currentZoom = e.target.value / 100;
        });
    }

    initMobileZoomEvents() {
        // Pinch to Zoom (Pinça)
        window.addEventListener('touchstart', e => {
            if (e.touches.length === 2) {
                this.lastTouchDist = this.getTouchDist(e.touches);
            }
        }, {passive: false});

        window.addEventListener('touchmove', e => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = this.getTouchDist(e.touches);
                const delta = (dist - this.lastTouchDist) * 0.01;
                
                this.currentZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.currentZoom + delta));
                this.lastTouchDist = dist;

                // Atualiza o slider visualmente se ele existir
                const slider = document.getElementById('zoom-range');
                if (slider) slider.value = this.currentZoom * 100;
            }
        }, {passive: false});
    }

    getTouchDist(touches) {
        return Math.sqrt(
            Math.pow(touches[0].clientX - touches[1].clientX, 2) +
            Math.pow(touches[0].clientY - touches[1].clientY, 2)
        );
    }

    showJoystick() {
        const el = document.getElementById('mobile-ui-container');
        if (el) el.style.display = 'block';
    }

    // Método para o main.js pegar o zoom atualizado
    getZoom() {
        return this.currentZoom;
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
