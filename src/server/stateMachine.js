const EventEmitter = require('events');

class CongestionStateMachine extends EventEmitter {
    constructor(threshold = 5, stoppedThreshold = 3, consecutiveFrames = 3) {
        super();
        this.threshold = threshold; // Total number of vehicles
        this.stoppedThreshold = stoppedThreshold; // Number of stopped vehicles required
        this.consecutiveFrames = consecutiveFrames;
        
        this.currentState = "Sem congestionamento";
        this.history = [];
        this.lastTransitionTime = 0; // Guardará o timestamp da última mudança
        this.cooldownMs = 30000; // 30 segundos de "delay"
    }

    processFrame(vehicleCount, stoppedVehicleCount = 0) {
        // Keep track of the last N frames
        this.history.push({ vehicleCount, stoppedVehicleCount });
        if (this.history.length > this.consecutiveFrames) {
            this.history.shift();
        }

        // We need enough history to make a decision
        if (this.history.length < this.consecutiveFrames) {
            return this.currentState;
        }

        // Check if all recent frames exceed both thresholds
        const isCongestedNow = this.history.every(entry => 
            entry.vehicleCount >= this.threshold && entry.stoppedVehicleCount >= this.stoppedThreshold
        );
        // Check if any recent frame is below thresholds (meaning it's clear)
        // Here we can say it's clear if vehicleCount drops OR stopped vehicles drop
        const isClearNow = this.history.every(entry => 
            entry.vehicleCount < this.threshold || entry.stoppedVehicleCount < this.stoppedThreshold
        );

        const now = Date.now();
        // Sem → Com: IMEDIATO (detectar congestionamento sem atraso)
        if (this.currentState === "Sem congestionamento" && isCongestedNow) {
            this.currentState = "Com congestionamento";
            this.lastTransitionTime = now;
            this.emit('congestionStarted', { timestamp: new Date() });
            this.callStartApi();
        }
        // Com → Sem: COM COOLDOWN (evita ligar/desligar por passagem rápida de veículo)
        else if (this.currentState === "Com congestionamento" && isClearNow) {
            const elapsed = now - this.lastTransitionTime;
            if (elapsed >= this.cooldownMs) {
                this.currentState = "Sem congestionamento";
                this.lastTransitionTime = now;
                this.emit('congestionEnded', { timestamp: new Date() });
                this.callEndApi();
            }
        }

        return this.currentState;
    }

    getState() {
        return this.currentState;
    }

    getCooldownRemaining() {
        const elapsed = Date.now() - this.lastTransitionTime;
        return elapsed < this.cooldownMs ? this.cooldownMs - elapsed : 0;
    }

    async callStartApi() {
        console.log("[API Hook] Congestion STARTED API called.");
        const url = process.env.API_CONGESTIONAMENTO;
        if (url) {
            try {
                const response = await fetch(url, {
                    headers: {
                        "Authorization": process.env.API_AUTH || "",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0"
                    }
                });
                if (response.ok) {
                    console.log("Sucesso ao chamar API de Congestionamento. Status:", response.status);
                } else {
                    console.error("A API retornou erro:", response.status, response.statusText);
                }
            } catch (err) {
                console.error("Falha ao chamar API de Congestionamento:", err.message);
            }
        }
    }

    async callEndApi() {
        console.log("[API Hook] Congestion ENDED API called.");
        const url = process.env.API_LIVRE;
        if (url) {
            try {
                const response = await fetch(url, {
                    headers: {
                        "Authorization": process.env.API_AUTH || "",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0"
                    }
                });
                if (response.ok) {
                    console.log("Sucesso ao chamar API de Via Livre. Status:", response.status);
                } else {
                    console.error("A API retornou erro:", response.status, response.statusText);
                }
            } catch (err) {
                console.error("Falha ao chamar API de Via Livre:", err.message);
            }
        }
    }
}

module.exports = CongestionStateMachine;
