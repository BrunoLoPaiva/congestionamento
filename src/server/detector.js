const ort = require('onnxruntime-node');
const sharp = require('sharp');
const path = require('path');

let session = null;
let nmsSession = null;

const modelInputShape = [1, 3, 640, 640];
const topk = 100;
const iouThreshold = 0.45;
const scoreThreshold = 0.25;

const VEHICLE_CLASSES = [2, 3, 5, 7]; // car, motorcycle, bus, truck

async function initModels() {
    console.log("Loading YOLOv8 models...");
    
    const yoloPath = path.join(__dirname, '../../model/yolov8n.onnx');
    const nmsPath = path.join(__dirname, '../../model/nms-yolov8.onnx');

    try {
        // Tenta usar CUDA (Nvidia) primeiro, depois DirectML (Qualquer GPU no Windows), e por último CPU
        const options = { executionProviders: ['cuda', 'dml', 'cpu'] };
        session = await ort.InferenceSession.create(yoloPath, options);
        nmsSession = await ort.InferenceSession.create(nmsPath, options);
    } catch (err) {
        console.warn("⚠️ Não foi possível usar a GPU. Erro de biblioteca nativa (CUDA/cuDNN ausente). Fazendo fallback automático para a CPU...");
        console.warn("Detalhe do erro:", err.message);
        
        const fallbackOptions = { executionProviders: ['cpu'] };
        session = await ort.InferenceSession.create(yoloPath, fallbackOptions);
        nmsSession = await ort.InferenceSession.create(nmsPath, fallbackOptions);
    }
    
    console.log("Models loaded successfully.");
}

async function preprocess(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    // Fast resize and pad with Sharp (C++ backend) directly to 640x640
    const { data } = await sharp(imageBuffer)
        .resize(640, 640, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 1 }
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Extremely fast conversion to Float32Array
    const imageBufferFloat = new Float32Array(3 * 640 * 640);
    const numPixels = 640 * 640;
    
    for (let i = 0; i < numPixels; i++) {
        imageBufferFloat[i] = data[i * 3 + 0] / 255.0; // R
        imageBufferFloat[i + numPixels] = data[i * 3 + 1] / 255.0; // G
        imageBufferFloat[i + 2 * numPixels] = data[i * 3 + 2] / 255.0; // B
    }

    const scale = 640 / Math.max(width, height);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const padX = (640 - scaledWidth) / 2;
    const padY = (640 - scaledHeight) / 2;

    return {
        tensor: new ort.Tensor('float32', imageBufferFloat, modelInputShape),
        scale,
        padX,
        padY
    };
}

async function detect(imageBuffer) {
    if (!session || !nmsSession) {
        throw new Error("Models not initialized");
    }

    const { tensor, scale, padX, padY } = await preprocess(imageBuffer);

    const config = new ort.Tensor(
        'float32',
        new Float32Array([topk, iouThreshold, scoreThreshold])
    );

    const { output0 } = await session.run({ images: tensor });
    const { selected } = await nmsSession.run({ detection: output0, config: config });

    const boxes = [];
    let vehicleCount = 0;

    for (let idx = 0; idx < selected.dims[1]; idx++) {
        const data = selected.data.slice(idx * selected.dims[2], (idx + 1) * selected.dims[2]);
        const box = data.slice(0, 4);
        const scores = data.slice(4);
        const score = Math.max(...scores);
        const label = scores.indexOf(score);

        if (VEHICLE_CLASSES.includes(label)) {
            vehicleCount++;
        }

        // Box from YOLO is [centerX, centerY, width, height] in 640x640 space
        const centerX = box[0];
        const centerY = box[1];
        const w_640 = box[2];
        const h_640 = box[3];

        // Map back to original image coordinates
        const x = ((centerX - w_640 / 2) - padX) / scale;
        const y = ((centerY - h_640 / 2) - padY) / scale;
        const w = w_640 / scale;
        const h = h_640 / scale;

        boxes.push({
            label,
            probability: score,
            bounding: [x, y, w, h],
        });
    }

    return { boxes, vehicleCount };
}

module.exports = {
    initModels,
    detect
};
