const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const dotenv = require('dotenv');
const { initModels, detect } = require('./detector');
const CongestionStateMachine = require('./stateMachine');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const RTSP_URL = process.env.RTSP_URL || '';
const PORT = process.env.PORT || 8080;

const stateMachine = new CongestionStateMachine(5, 3); // threshold = 5, consecutiveFrames = 3

let isProcessing = false;

async function processFrame(frameBuffer) {
    if (isProcessing) return; // Pula o quadro se a IA ainda estiver processando o anterior (Drop frame)
    isProcessing = true;

    try {
        const { boxes, vehicleCount } = await detect(frameBuffer);
        const currentState = stateMachine.processFrame(vehicleCount);

        // Envia o exato frame processado junto com suas exatas caixas! (Sincronia perfeita)
        const payload = JSON.stringify({
            image: frameBuffer.toString('base64'),
            boxes,
            vehicleCount,
            status: currentState,
            cooldownRemaining: stateMachine.getCooldownRemaining(),
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
