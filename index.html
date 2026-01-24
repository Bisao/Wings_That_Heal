<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>BeeHive P2P</title>
    <style>
        body { margin: 0; overflow: hidden; background: #0d0d0d; font-family: 'Segoe UI', sans-serif; touch-action: none; user-select: none; -webkit-user-select: none; }
        
        #lobby-container { 
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
            color: white; text-align: center; background: rgba(20, 20, 20, 0.95); 
            padding: 30px; border-radius: 12px; z-index: 20; border: 1px solid #f1c40f;
            box-shadow: 0 0 30px rgba(241, 196, 15, 0.2); width: 90%; max-width: 400px;
        }

        h1 { color: #f1c40f; margin-bottom: 20px; }
        input[type=text], input[type=password] { padding: 12px; margin: 8px 0; border-radius: 6px; border: 1px solid #444; width: 100%; box-sizing: border-box; background: #222; color: white; }
        button { padding: 12px 20px; cursor: pointer; background: #f1c40f; color: #1a1a1a; border: none; font-weight: bold; border-radius: 6px; width: 100%; margin-top: 10px; }

        .game-ui {
            position: absolute; top: 20px; left: 20px; color: white; 
            font-weight: bold; font-size: 24px; text-shadow: 2px 2px 4px #000;
            pointer-events: none; display: none; background: rgba(0,0,0,0.5);
            padding: 10px 20px; border-radius: 20px; border: 1px solid #444; z-index: 15;
        }

        /* --- CONTROLES MOBILE --- */
        #mobile-controls {
            display: none; /* Ativado via JS */
            position: absolute; bottom: 20px; left: 0; width: 100%; height: 180px;
            pointer-events: none; z-index: 100;
        }

        .joystick-zone {
            position: absolute; bottom: 10px; width: 150px; height: 150px;
            pointer-events: auto; 
        }
        #stick-left-zone { left: 20px; }
        #stick-right-zone { right: 20px; }

        .joystick-base {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 100px; height: 100px;
            background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 50%;
        }

        .joystick-knob {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 50px; height: 50px;
            background: rgba(241, 196, 15, 0.5);
            border-radius: 50%; box-shadow: 0 0 10px rgba(241, 196, 15, 0.3);
            transition: transform 0.1s; 
        }
        
        .stick-label {
            position: absolute; top: -30px; width: 100%; text-align: center; 
            color: rgba(255,255,255,0.5); font-size: 12px; font-weight: bold;
        }

        /* --- CONTROLE DE ZOOM (Novo) --- */
        #zoom-controls {
            display: none; /* Ativado via JS */
            position: absolute; 
            top: 50%; right: 10px; /* Centro Direito */
            transform: translateY(-50%);
            height: 200px; width: 50px;
            z-index: 101; pointer-events: auto;
            align-items: center; justify-content: center;
        }

        /* Input Range Vertical hack */
        input[type=range].vertical-slider {
            -webkit-appearance: none;
            width: 150px; /* Largura vira altura devido a rotação */
            height: 8px;
            background: rgba(255,255,255,0.2);
            border-radius: 5px;
            outline: none;
            transform: rotate(-90deg); /* Faz ficar vertical */
            margin: 0;
        }

        input[type=range].vertical-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 20px; height: 20px;
            background: #f1c40f;
            border-radius: 50%;
            cursor: pointer;
        }
    </style>
    <script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
</head>
<body>
    <div id="lobby-container">
        <h1>🐝 BeeHive P2P</h1>
        <input type="text" id="nickname" placeholder="Seu Nickname" maxlength="12">
        
        <h3 style="margin: 10px 0; color: #ddd;">Criar Sala</h3>
        <input type="text" id="create-id" placeholder="ID da Sala">
        <input type="password" id="create-pass" placeholder="Senha (Opcional)">
        <input type="text" id="world-seed" placeholder="Seed (ex: 123)">
        <button id="btn-create">Hospedar</button>
        
        <h3 style="margin: 10px 0; color: #ddd;">Entrar</h3>
        <input type="text" id="join-id" placeholder="ID do Host">
        <input type="password" id="join-pass" placeholder="Senha">
        <button id="btn-join">Conectar</button>
        <div id="status-msg" style="color:#888; margin-top:10px;"></div>
    </div>

    <div id="game-ui" class="game-ui">
        Pólen: <span id="pollen-count" style="color: #f1c40f;">0 / 100</span> 🌻
    </div>

    <div id="zoom-controls">
        <input type="range" id="zoom-slider" class="vertical-slider" min="0.5" max="1.5" step="0.05" value="1.0">
    </div>

    <div id="mobile-controls">
        <div id="stick-left-zone" class="joystick-zone">
            <div class="stick-label">MOVER</div>
            <div class="joystick-base">
                <div id="stick-left-knob" class="joystick-knob"></div>
            </div>
        </div>
        <div id="stick-right-zone" class="joystick-zone">
            <div class="stick-label">MIRAR</div>
            <div class="joystick-base">
                <div id="stick-right-knob" class="joystick-knob"></div>
            </div>
        </div>
    </div>

    <canvas id="gameCanvas" style="display:none;"></canvas>
    <script type="module" src="src/main.js"></script>
</body>
</html>
