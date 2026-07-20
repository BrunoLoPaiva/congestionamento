const EventEmitter = require('events');

class CongestionStateMachine extends EventEmitter {
    constructor(threshold = 5, consecutiveFrames = 3) {
        super();
        this.threshold = threshold; // Number of vehicles to trigger congestion
        this.consecutiveFrames = consecutiveFrames; // Number of consecutive frames exceeding threshold
        
        this.currentState = "Sem congestionamento";
        this.history = [];
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

        if (this.currentState === "Sem congestionamento" && isCongestedNow) {
            this.currentState = "Com congestionamento";
            this.emit('congestionStarted', { timestamp: new Date() });
            this.callStartApi();
        } else if (this.currentState === "Com congestionamento" && isClearNow) {
            this.currentState = "Sem congestionamento";
            this.emit('congestionEnded', { timestamp: new Date() });
            this.callEndApi();
        }

        return this.currentState;
    }

    getState() {
        return this.currentState;
    }

    callStartApi() {
        // TODO: Implement API call for congestion start
        console.log("[API Hook] Congestion STARTED API called.");
    }

    callEndApi() {
        // TODO: Implement API call for congestion end
        console.log("[API Hook] Congestion ENDED API called.");
    }
}

module.exports = CongestionStateMachine;
