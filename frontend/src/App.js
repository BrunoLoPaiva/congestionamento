import React, { useState, useEffect, useRef } from "react";
import { renderBoxes } from "./utils/renderBox";
import "./style/App.css";

const App = () => {
  const [status, setStatus] = useState("Conectando...");
  const [vehicleCount, setVehicleCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState("");
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080");

    ws.onopen = () => {
      setStatus("Conectado. Aguardando vídeo...");
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
        setLastUpdate(new Date(data.timestamp).toLocaleTimeString());
        
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

  const isCongested = status === "Com congestionamento";

  return (
    <div className="App" style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <div className="header" style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1>Monitoramento de Tráfego</h1>
        <p>Análise de Vídeo RTSP em Tempo Real (Interface de Depuração)</p>
      </div>
      
      <div 
        className="status-panel" 
        style={{ 
            backgroundColor: isCongested ? '#ff4d4f' : (status === "Sem congestionamento" ? '#52c41a' : '#faad14'), 
            padding: '20px', 
            color: 'white', 
            fontWeight: 'bold', 
            fontSize: '24px', 
            textAlign: 'center', 
            marginBottom: '20px', 
            borderRadius: '8px',
            transition: 'background-color 0.5s ease'
        }}
      >
        {status}
      </div>

      <div className="debug-info" style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 20px', backgroundColor: '#f0f2f5', borderRadius: '8px', marginBottom: '20px', fontSize: '18px' }}>
        <div><strong>Veículos Detectados (Atual):</strong> {vehicleCount}</div>
        <div><strong>Última Atualização:</strong> {lastUpdate}</div>
      </div>

      <div className="content" style={{ position: 'relative', display: 'flex', justifyContent: 'center', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
        <img
          ref={imageRef}
          alt="Video Stream"
          style={{ display: "block", maxWidth: '100%', height: 'auto', maxHeight: '70vh' }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </div>
    </div>
  );
};

export default App;
