import React, { useState, useEffect, useRef } from "react";
import { renderBoxes } from "./utils/renderBox";
import "./style/App.css";

const App = () => {
  const [status, setStatus] = useState("Conectando...");
  const [vehicleCount, setVehicleCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState("--:--:--");
  const [cooldown, setCooldown] = useState(0);
  const [mode, setMode] = useState("automatic");
  const [manualStatus, setManualStatus] = useState(false);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  const updateConfig = async (newMode, newManualStatus) => {
    try {
      await fetch(`http://${window.location.hostname}:8085/api/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: newMode !== undefined ? newMode : mode,
          manualStatus: newManualStatus !== undefined ? newManualStatus : manualStatus,
        }),
      });
    } catch (e) {
      console.error("Erro ao chamar API:", e);
    }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    updateConfig(newMode, undefined);
  };

  const handleManualStatusChange = (newStatus) => {
    setManualStatus(newStatus);
    updateConfig(undefined, newStatus);
  };

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:8085`);

    ws.onopen = () => {
      setStatus("Aguardando vídeo...");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.image) {
          const img = new Image();
          img.onload = () => {
             if (imageRef.current) {
                 imageRef.current.src = img.src;
             }
             if (canvasRef.current) {
                 canvasRef.current.width = img.width;
                 canvasRef.current.height = img.height;
                 renderBoxes(canvasRef.current, data.boxes);
             }
          };
          img.src = "data:image/jpeg;base64," + data.image;
        }

        setStatus(data.status);
        setVehicleCount(data.vehicleCount);
        setCooldown(data.cooldownRemaining || 0);
        setLastUpdate(new Date(data.timestamp).toLocaleTimeString('pt-BR'));
        
      } catch (e) {
        console.error("Error parsing message", e);
      }
    };

    ws.onclose = () => {
      setStatus("Desconectado");
    };

    return () => {
      ws.close();
    };
  }, []);

  const displayStatus = mode === 'automatic' ? status : (manualStatus ? "Com congestionamento" : "Sem congestionamento");
  const isCongested = displayStatus === "Com congestionamento";
  const statusClass = isCongested ? "congested" : (displayStatus === "Sem congestionamento" ? "clear" : "connecting");
  
  // Calcula a porcentagem do cooldown (30.000ms = 30s)
  const progressPercent = Math.min(100, Math.max(0, (cooldown / 30000) * 100));

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>Detector de congestionamento</h1>
        <p>Monitoramento de Tráfego &amp; Detecção de Congestionamento</p>
        
        <div className="mode-controls">
          <div className="toggle-group">
            <button 
              className={`toggle-btn ${mode === 'automatic' ? 'active' : ''}`}
              onClick={() => handleModeChange('automatic')}
            >
              Automático
            </button>
            <button 
              className={`toggle-btn ${mode === 'manual' ? 'active' : ''}`}
              onClick={() => handleModeChange('manual')}
            >
              Manual
            </button>
          </div>
          
          {mode === 'manual' && (
            <div className="manual-status-control">
              <label className="switch-label">
                <span>Mensagem de Congestionamento:</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={manualStatus} 
                    onChange={(e) => handleManualStatusChange(e.target.checked)} 
                  />
                  <span className="slider round"></span>
                </label>
              </label>
            </div>
          )}
        </div>
      </header>
      
      <div className="stats-row">
        <div className="glass-panel status-card">
          <div className={`status-indicator ${statusClass}`}>
            <div className="pulse-dot"></div>
            {displayStatus}
          </div>
          
          {mode === 'automatic' && (
            <div className="cooldown-wrapper" style={{ opacity: cooldown > 0 ? 1 : 0.3 }}>
              <div className="cooldown-text">
                <span>Proteção contra Spam de status</span>
                <span>{(cooldown / 1000).toFixed(1)}s restantes</span>
              </div>
              <div className="progress-bg">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>
          )}
        </div>

        <div className="glass-panel stat-box" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <span className="stat-label">Veículos na Via (Ao vivo)</span>
          <span className="stat-value">{vehicleCount}</span>
          <span className="stat-label" style={{ marginTop: '10px' }}>Última Leitura</span>
          <span className="stat-value" style={{ fontSize: '1.2rem', color: '#a0a0b0' }}>{lastUpdate}</span>
        </div>
      </div>

      <div className="video-container">
        <img ref={imageRef} alt="Stream RTSP" />
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

export default App;
