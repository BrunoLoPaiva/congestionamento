class SimpleTracker {
    constructor(iouThreshold = 0.7) {
        this.previousBoxes = [];
        this.iouThreshold = iouThreshold;
    }

    calculateIoU(box1, box2) {
        // box format: [x, y, w, h] (top-left x,y, width, height)
        const [x1, y1, w1, h1] = box1;
        const [x2, y2, w2, h2] = box2;

        const xLeft = Math.max(x1, x2);
        const yTop = Math.max(y1, y2);
        const xRight = Math.min(x1 + w1, x2 + w2);
        const yBottom = Math.min(y1 + h1, y2 + h2);

        if (xRight < xLeft || yBottom < yTop) {
            return 0.0;
        }

        const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
        const box1Area = w1 * h1;
        const box2Area = w2 * h2;
        
        const iou = intersectionArea / (box1Area + box2Area - intersectionArea);
        return iou;
    }

    processFrame(currentBoxes) {
        let stoppedCount = 0;
        const VEHICLE_CLASSES = [2, 3, 5, 7];

        const currentVehicles = currentBoxes.filter(b => VEHICLE_CLASSES.includes(b.label));

        // Inicializa todos como "moving"
        for (const box of currentBoxes) {
            box.speed = 'moving';
        }

        for (const currentBox of currentVehicles) {
            let maxIou = 0;
            
            for (const prevBox of this.previousBoxes) {
                if (currentBox.label === prevBox.label) {
                    const iou = this.calculateIoU(currentBox.bounding, prevBox.bounding);
                    if (iou > maxIou) {
                        maxIou = iou;
                    }
                }
            }

            // If a vehicle has a high IoU with a vehicle from the previous frame, it means it hasn't moved much.
            if (maxIou >= this.iouThreshold) {
                currentBox.speed = 'stopped';
                stoppedCount++;
            } else if (maxIou >= 0.4) { // 0.4 a 0.85 é lento
                currentBox.speed = 'slow';
            }
        }

        // Keep current vehicles for the next frame's comparison
        this.previousBoxes = currentVehicles;

        return stoppedCount;
    }
}

module.exports = SimpleTracker;
