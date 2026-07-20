const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const dotenv = require('dotenv');
const { initModels, detect } = require('./detector');
const CongestionStateMachine = require('./stateMachine');
const SimpleTracker = require('./tracker');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const RTSP_URL = process.env.RTSP_URL || '';
const PORT = process.env.PORT || 8085;

const stateMachine = new CongestionStateMachine(5, 3, 3); // threshold = 5, stopped = 3, consecutiveFrames = 3
const tracker = new SimpleTracker(0.85); // IoU threshold de 0.85 para ser considerado parado

let isProcessing = false;
let currentMode = 'automatic';
let currentManualStatus = false;
let lastAutoStatus = 'Sem congestionamento'; // último estado visto pela IA

app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const API_HEADERS = {
    "Authorization": process.env.API_AUTH || "",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0"
};

async function callManualApi(active) {
    const url = active ? process.env.API_CONGESTIONAMENTO : process.env.API_LIVRE;
    const label = active ? "CONGESTIONAMENTO" : "LIVRE";
    if (!url) {
        console.warn(`[Manual] URL da API ${label} não configurada no .env`);
        return;
    }
    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (response.ok) {
            console.log(`[Manual] API ${label} chamada com sucesso. Status:`, response.status);
        } else {
            console.error(`[Manual] A API ${label} retornou erro:`, response.status, response.statusText);
        }
    } catch (err) {
        console.error(`[Manual] Falha ao chamar API ${label}:`, err.message);
    }
}

app.post('/api/config', async (req, res) => {
    const { mode, manualStatus } = req.body;

    const prevMode = currentMode;
    const prevManualStatus = currentManualStatus;

    if (mode !== undefined) currentMode = mode;
    if (manualStatus !== undefined) currentManualStatus = manualStatus;

    console.log(`[API] Config updated: mode=${currentMode}, manualStatus=${currentManualStatus}`);

    if (mode === 'automatic' && prevMode === 'manual') {
        // Voltou para automático: dispara API imediatamente com o último estado da IA
        const isCurrentlyCongested = lastAutoStatus === 'Com congestionamento';
        currentManualStatus = isCurrentlyCongested;
        console.log(`[API] Voltando para automático. Estado atual da IA: ${lastAutoStatus}`);
        await callManualApi(isCurrentlyCongested);
    } else if (currentMode === 'manual' && manualStatus !== undefined && manualStatus !== prevManualStatus) {
        // Toggle manual acionado: chama API com o novo valor
        await callManualApi(currentManualStatus);
    }
    // Nota: Automático → Manual NÃO chama a API externa

    res.json({ success: true, mode: currentMode, manualStatus: currentManualStatus, lastAutoStatus });
});


async function processFrame(frameBuffer) {
    if (isProcessing) return; // Pula o quadro se a IA ainda estiver processando o anterior (Drop frame)
    isProcessing = true;

    try {
        const { boxes, vehicleCount } = await detect(frameBuffer);
        const stoppedVehicleCount = tracker.processFrame(boxes);
        const currentState = stateMachine.processFrame(vehicleCount, stoppedVehicleCount);

        // Sempre atualiza o último estado visto pela IA
        lastAutoStatus = currentState;

        let finalStatus = currentState;
        if (currentMode === 'manual') {
            finalStatus = currentManualStatus ? "Com congestionamento" : "Sem congestionamento";
        }

        // Envia o exato frame processado junto com suas exatas caixas! (Sincronia perfeita)
        const payload = JSON.stringify({
            image: frameBuffer.toString('base64'),
            boxes,
            vehicleCount,
            stoppedVehicleCount,
            status: finalStatus,
            cooldownRemaining: currentMode === 'manual' ? 0 : stateMachine.getCooldownRemaining(),
            timestamp: new Date().toISOString()
        });

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    } catch (err) {
        console.error("Erro na IA:", err.message);
    } finally {
        isProcessing = false;
    }
}

function startRTSPStream() {
    if (!RTSP_URL) {
        console.warn("No RTSP_URL provided in .env. Waiting for URL...");
        return;
    }

    console.log(`Connecting to RTSP stream: ${RTSP_URL}`);
    
    const command = ffmpeg(RTSP_URL)
        .inputOptions([
            '-rtsp_transport tcp',
        ])
        .outputOptions([
            '-f image2pipe',
            '-vcodec mjpeg',
            '-r 15', // 15 FPS para vídeo super fluido
            '-q:v 2'
        ])
        .on('error', (err) => {
            console.error('FFmpeg Error:', err.message);
            // Restart stream after delay
            setTimeout(startRTSPStream, 5000);
        });

    const ffStream = command.pipe();
    let buffer = Buffer.alloc(0);

    ffStream.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        
        let startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        let endIndex = buffer.indexOf(Buffer.from([0xff, 0xd9]));
        
        while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const frame = buffer.slice(startIndex, endIndex + 2);
            processFrame(frame);
            
            buffer = buffer.slice(endIndex + 2);
            startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
            endIndex = buffer.indexOf(Buffer.from([0xff, 0xd9]));
        }
    });
}

async function startServer() {
    try {
        await initModels();
        
        server.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
            startRTSPStream();
        });
    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
}

startServer();
