// Classe interna para gerenciar um único joystick
class VirtualJoystick {
    constructor(zoneId, knobId) {
        this.zone = document.getElementById(zoneId);
        this.knob = document.getElementById(knobId);
        this.vector = { x: 0, y: 0 };
        this.touchId = null;
        this.origin = { x: 0, y: 0 };
        this.radius = 50; // Raio máximo de movimento do knob

        // Binda os eventos com {passive: false} para evitar scroll
        this.zone.addEventListener('touchstart', e => this.onTouchStart(e), {passive: false});
        this.zone.addEventListener('touchmove', e => this.onTouchMove(e), {passive: false});
        this.zone.addEventListener('touchend', e => this.onTouchEnd(e), {passive: false});
        this.zone.addEventListener('touchcancel', e => this.onTouchEnd(e), {passive: false});
    }

    onTouchStart(e) {
        e.preventDefault();
        // Pega o toque que iniciou nesta zona específica
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (this.touchId === null) { // Se não tem dedo ativo
                this.touchId = touch.identifier;
                
                // Define o centro dinamicamente
                const rect = this.zone.getBoundingClientRect();
                this.origin.x = rect.left + rect.width / 2;
                this.origin.y = rect.top + rect.height / 2;

                this.updateKnob(touch.clientX, touch.clientY);
                break;
            }
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.touchId) {
                const touch = e.changedTouches[i];
                this.updateKnob(touch.clientX, touch.clientY);
                break;
            }
        }
    }

    onTouchEnd(e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.touchId) {
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
        
        // Limita o movimento visual ao raio
        const limit = Math.min(distance, this.radius);
        
        // Calcula vetor normalizado (0 a 1) para o jogo
        // Se passar do raio, continua sendo 1 (velocidade máxima)
        const rawForce = distance / this.radius;
        const force = Math.min(rawForce, 1.0);

        this.vector.x = Math.cos(angle) * force;
        this.vector.y = Math.sin(angle) * force;

        // Move visualmente o knob
        const knobX = Math.cos(angle) * limit;
        const knobY = Math.sin(angle) * limit;
        
        this.knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
        this.knob.style.transition = 'none';
    }

    reset() {
        this.touchId = null;
        this.vector = { x: 0, y: 0 };
        this.knob.style.transform = `translate(-50%, -50%)`;
        this.knob.style.transition = 'transform 0.1s';
    }
}

export class InputHandler {
    constructor() {
        this.keys = {};
        this.isMobile = this.detectMobile();
        
        // Input Desktop
        window.addEventListener('keydown', e => { if(e.key) this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', e => { if(e.key) this.keys[e.key.toLowerCase()] = false; });

        // Input Mobile
        this.leftStick = null;
        this.rightStick = null;

        if (this.isMobile) {
            document.getElementById('mobile-controls').style.display = 'block';
            this.leftStick = new VirtualJoystick('stick-left-zone', 'stick-left-knob');
            this.rightStick = new VirtualJoystick('stick-right-zone', 'stick-right-knob');
        }
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    getMovement() {
        // 1. Mobile Joystick
        if (this.isMobile && this.leftStick) {
            if (this.leftStick.vector.x !== 0 || this.leftStick.vector.y !== 0) {
                return { x: this.leftStick.vector.x, y: this.leftStick.vector.y };
            }
        }

        // 2. Teclado
        let x = 0, y = 0;
        if (this.keys['w'] || this.keys['arrowup']) y -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) y += 1;
        if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
        if (this.keys['d'] || this.keys['arrowright']) x += 1;
        
        if (x !== 0 && y !== 0) { x *= 0.707; y *= 0.707; }
        return { x, y };
    }
}
