/**
 * Gerencia um joystick virtual individual.
 * Lida com a matemática vetorial e a atualização visual do DOM.
 */
class VirtualJoystick {
    constructor(zoneId, knobId) {
        this.zone = document.getElementById(zoneId);
        this.knob = document.getElementById(knobId);
        
        // Estado
        this.vector = { x: 0, y: 0 };
        this.touchId = null;
        this.origin = { x: 0, y: 0 };
        this.radius = 50; // Raio máximo em pixels

        // Bindings para garantir o contexto 'this' e permitir remoção posterior
        this._touchStart = this.onTouchStart.bind(this);
        this._touchMove = this.onTouchMove.bind(this);
        this._touchEnd = this.onTouchEnd.bind(this);

        if (this.zone && this.knob) {
            this.attachEvents();
        } else {
            console.warn(`[Input] Joystick elements not found: ${zoneId}, ${knobId}`);
        }
    }

    attachEvents() {
        // { passive: false } é crucial para permitir e.preventDefault()
        this.zone.addEventListener('touchstart', this._touchStart, { passive: false });
        this.zone.addEventListener('touchmove', this._touchMove, { passive: false });
        this.zone.addEventListener('touchend', this._touchEnd, { passive: false });
        this.zone.addEventListener('touchcancel', this._touchEnd, { passive: false });
    }

    detachEvents() {
        if (!this.zone) return;
        this.zone.removeEventListener('touchstart', this._touchStart);
        this.zone.removeEventListener('touchmove', this._touchMove);
        this.zone.removeEventListener('touchend', this._touchEnd);
        this.zone.removeEventListener('touchcancel', this._touchEnd);
    }

    onTouchStart(e) {
        e.preventDefault(); // Impede scroll e zoom
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (this.touchId === null) {
                this.touchId = touch.identifier;
                
                // Recalcula o centro dinamicamente (útil se a tela girou ou redimensionou)
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
        if (this.touchId === null) return;

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
        
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        // Limita o visual ao raio máximo
        const limit = Math.min(distance, this.radius);
        
        // Normaliza o vetor de saída (0.0 a 1.0)
        const rawForce = distance / this.radius;
        const force = Math.min(rawForce, 1.0);

        this.vector.x = Math.cos(angle) * force;
        this.vector.y = Math.sin(angle) * force;

        // Atualiza o CSS
        const knobX = Math.cos(angle) * limit;
        const knobY = Math.sin(angle) * limit;
        
        this.knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
        this.knob.style.transition = 'none';
    }

    reset() {
        this.touchId = null;
        this.vector = { x: 0, y: 0 };
        if (this.knob) {
            this.knob.style.transform = `translate(-50%, -50%)`;
            this.knob.style.transition = 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        }
    }
}

/**
 * Gerenciador principal de entradas (Teclado + Touch).
 */
export class InputHandler {
    constructor() {
        this.keys = {};
        this.isMobile = this.detectMobile();
        this.isChatting = false; // Trava inputs quando o chat está aberto

        this.leftStick = null;
        this.rightStick = null;

        // Bindings
        this._onKeyDown = this.handleKeyDown.bind(this);
        this._onKeyUp = this.handleKeyUp.bind(this);

        this.init();
    }

    init() {
        // Listeners de Teclado
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);

        // Inicializa Mobile se necessário
        if (this.isMobile) {
            this.enableMobileControls();
        }
    }

    /**
     * Remove todos os listeners. Útil para reiniciar o jogo ou trocar de cena.
     */
    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);

        if (this.leftStick) this.leftStick.detachEvents();
        if (this.rightStick) this.rightStick.detachEvents();
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 800 && navigator.maxTouchPoints > 0);
    }

    enableMobileControls() {
        const controlsUI = document.getElementById('mobile-controls');
        if (controlsUI) {
            controlsUI.style.display = 'block';
            this.leftStick = new VirtualJoystick('stick-left-zone', 'stick-left-knob');
            this.rightStick = new VirtualJoystick('stick-right-zone', 'stick-right-knob');
        }
    }

    /**
     * Define se o jogador está digitando no chat.
     * @param {boolean} status 
     */
    setChatMode(status) {
        this.isChatting = status;
        if (status) {
            // Zera as teclas para evitar que o boneco continue andando "sozinho"
            this.keys = {}; 
        }
    }

    handleKeyDown(e) {
        if (this.isChatting) return; // Ignora se estiver no chat
        if (e.key) this.keys[e.key.toLowerCase()] = true;
    }

    handleKeyUp(e) {
        if (e.key) this.keys[e.key.toLowerCase()] = false;
    }

    /**
     * Retorna o vetor de movimento normalizado.
     * Prioridade: Touch > Teclado
     */
    getMovement() {
        // 1. Mobile Joystick (Prioridade)
        if (this.isMobile && this.leftStick) {
            const v = this.leftStick.vector;
            if (Math.abs(v.x) > 0.1 || Math.abs(v.y) > 0.1) {
                return { x: v.x, y: v.y };
            }
        }

        // 2. Teclado (Só processa se não estiver no chat)
        if (this.isChatting) return { x: 0, y: 0 };

        let x = 0, y = 0;
        if (this.keys['w'] || this.keys['arrowup']) y -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) y += 1;
        if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
        if (this.keys['d'] || this.keys['arrowright']) x += 1;
        
        // Normalização de vetor para evitar movimento rápido na diagonal
        if (x !== 0 || y !== 0) {
            const length = Math.sqrt(x * x + y * y);
            x /= length;
            y /= length;
        }

        return { x, y };
    }
}
