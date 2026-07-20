const EventEmitter = require('events');

class CongestionStateMachine extends EventEmitter {
    constructor(threshold = 5, consecutiveFrames = 3) {
        super();
        this.threshold = threshold; // Number of vehicles to trigger congestion
        this.consecutiveFrames = consecutiveFrames; // Number of consecutive frames exceeding threshold
        
        this.currentState = "Sem congestionamento";
        this.history = [];
        this.lastTransitionTime = 0; // Guardará o timestamp da última mudança
        this.cooldownMs = 30000; // 30 segundos de "delay"
    }

    processFrame(vehicleCount) {
        // Keep track of the last N frames
        this.history.push(vehicleCount);
        if (this.history.length > this.consecutiveFrames) {
            this.history.shift();
        }

        // We need enough history to make a decision
        if (this.history.length < this.consecutiveFrames) {
            return this.currentState;
        }

        // Check if all recent frames exceed threshold
        const isCongestedNow = this.history.every(count => count >= this.threshold);
        // Check if all recent frames are below threshold
        const isClearNow = this.history.every(count => count < this.threshold);

        const now = Date.now();
        const canTransition = (now - this.lastTransitionTime) >= this.cooldownMs;

        if (canTransition) {
            if (this.currentState === "Sem congestionamento" && isCongestedNow) {
                this.currentState = "Com congestionamento";
                this.lastTransitionTime = now;
                this.emit('congestionStarted', { timestamp: new Date() });
                this.callStartApi();
            } else if (this.currentState === "Com congestionamento" && isClearNow) {
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
                        "Authorization": "Basic YWRtaW46dm9sdHZvbHQ=",
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
