import React, { useEffect, useRef, useState } from 'react';
import { Navigation, RotateCcw } from 'lucide-react';

const normalizeAngle = (a: number) => {
  let res = a % 360;
  if (res > 180) res -= 360;
  if (res < -180) res += 360;
  return res;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const keys = useRef<Record<string, boolean>>({});
  
  const gameState = useRef({
    boat: { x: 0, y: 0, heading: -90, speed: 0, sailTrim: 45 },
    wind: { dir: 90, speed: 0.8 },
    target: { x: 0, y: -600 },
    score: 0,
    particles: Array.from({ length: 60 }).map(() => ({
      x: Math.random() * 3000 - 1500,
      y: Math.random() * 3000 - 1500,
      speed: Math.random() * 0.5 + 0.5
    })),
    wake: [] as Array<{x: number, y: number, age: number}>
  });

  const [uiState, setUiState] = useState({
    score: 0,
    speed: 0,
    sailTrim: 45,
    windDir: 90,
    inIrons: false,
    efficiency: 0
  });

  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.key] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    if (showInstructions) return;

    let lastTime = performance.now();

    const update = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.66, 3);
      lastTime = time;

      const state = gameState.current;
      const { boat, wind, target, particles, wake } = state;

      // Controls
      if (keys.current['ArrowLeft'] || keys.current['a']) boat.heading -= 2.5 * dt;
      if (keys.current['ArrowRight'] || keys.current['d']) boat.heading += 2.5 * dt;
      if (keys.current['ArrowUp'] || keys.current['w']) boat.sailTrim = Math.max(0, boat.sailTrim - 1.5 * dt);
      if (keys.current['ArrowDown'] || keys.current['s']) boat.sailTrim = Math.min(90, boat.sailTrim + 1.5 * dt);

      boat.heading = normalizeAngle(boat.heading);

      // Physics
      const rawRelWind = normalizeAngle(wind.dir - boat.heading);
      const relWind = Math.abs(rawRelWind);
      
      const optimalTrim = (180 - relWind) / 2;
      let efficiency = 1 - Math.abs(boat.sailTrim - optimalTrim) / 40;
      efficiency = Math.max(0, Math.min(1, efficiency));

      const inIrons = relWind > 145;
      const power = inIrons ? 0 : efficiency * wind.speed;

      // Acceleration and drag
      boat.speed += (power * 0.1 * dt) - ((boat.speed * boat.speed * 0.002 + boat.speed * 0.015) * dt);
      if (boat.speed < 0) boat.speed = 0;

      boat.x += Math.cos(boat.heading * Math.PI / 180) * boat.speed * dt;
      boat.y += Math.sin(boat.heading * Math.PI / 180) * boat.speed * dt;

      // Target collision
      const dist = Math.hypot(target.x - boat.x, target.y - boat.y);
      if (dist < 60) {
        state.score += 1;
        const angle = Math.random() * Math.PI * 2;
        const distance = 800 + Math.random() * 700;
        target.x = boat.x + Math.cos(angle) * distance;
        target.y = boat.y + Math.sin(angle) * distance;
        wind.dir = normalizeAngle(wind.dir + (Math.random() * 40 - 20));
      }

      // Update particles
      particles.forEach(p => {
        p.x += Math.cos(wind.dir * Math.PI / 180) * wind.speed * p.speed * 5 * dt;
        p.y += Math.sin(wind.dir * Math.PI / 180) * wind.speed * p.speed * 5 * dt;
        
        if (p.x < boat.x - 1500) p.x += 3000;
        if (p.x > boat.x + 1500) p.x -= 3000;
        if (p.y < boat.y - 1500) p.y += 3000;
        if (p.y > boat.y + 1500) p.y -= 3000;
      });

      // Update wake
      if (Math.random() < 0.3 * dt && boat.speed > 0.5) {
        wake.push({ x: boat.x, y: boat.y, age: 0 });
      }
      wake.forEach(w => w.age += dt);
      state.wake = wake.filter(w => w.age < 150);

      // Sync UI state every few frames to save performance
      if (Math.random() < 0.1) {
        setUiState({
          score: state.score,
          speed: boat.speed,
          sailTrim: boat.sailTrim,
          windDir: wind.dir,
          inIrons,
          efficiency
        });
      }

      draw();
      animationRef.current = requestAnimationFrame(update);
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const state = gameState.current;
      const { boat, target, particles, wake } = state;

      // Clear & Background
      ctx.fillStyle = '#0ea5e9'; // sky-500
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2 - boat.x, canvas.height / 2 - boat.y);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      const gridSize = 200;
      const startX = Math.floor((boat.x - canvas.width/2) / gridSize) * gridSize;
      const startY = Math.floor((boat.y - canvas.height/2) / gridSize) * gridSize;
      for (let x = startX; x < boat.x + canvas.width/2; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, boat.y - canvas.height/2); ctx.lineTo(x, boat.y + canvas.height/2); ctx.stroke();
      }
      for (let y = startY; y < boat.y + canvas.height/2; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(boat.x - canvas.width/2, y); ctx.lineTo(boat.x + canvas.width/2, y); ctx.stroke();
      }

      // Wake
      if (wake.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < wake.length; i++) {
          if (i === 0) ctx.moveTo(wake[i].x, wake[i].y);
          else ctx.lineTo(wake[i].x, wake[i].y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // Target
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(target.x, target.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 4;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(target.x, target.y, 30 + Math.sin(Date.now() / 200) * 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.stroke();

      // Boat
      ctx.save();
      ctx.translate(boat.x, boat.y);
      ctx.rotate(boat.heading * Math.PI / 180);

      // Hull
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(-20, 12);
      ctx.lineTo(-20, -12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Sail
      const rawRelWind = normalizeAngle(state.wind.dir - boat.heading);
      const actualSailAngle = Math.sign(rawRelWind || 1) * boat.sailTrim;
      
      ctx.save();
      ctx.translate(5, 0); // Mast
      ctx.rotate(actualSailAngle * Math.PI / 180);
      
      // Boom
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-35, 0);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Sail cloth
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const belly = 15 * Math.sign(actualSailAngle || 1);
      ctx.quadraticCurveTo(-15, belly, -35, 0);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.restore(); // end sail
      ctx.restore(); // end boat

      // Wind Particles
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      particles.forEach(p => {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(state.wind.dir * Math.PI / 180) * 20, p.y + Math.sin(state.wind.dir * Math.PI / 180) * 20);
      });
      ctx.stroke();

      // Off-screen Target Pointer
      const distToTarget = Math.hypot(target.x - boat.x, target.y - boat.y);
      if (distToTarget > Math.min(canvas.width, canvas.height) / 2 - 50) {
        const angleToTarget = Math.atan2(target.y - boat.y, target.x - boat.x);
        ctx.save();
        ctx.translate(boat.x, boat.y);
        ctx.rotate(angleToTarget);
        ctx.beginPath();
        ctx.moveTo(120, 0);
        ctx.lineTo(100, -10);
        ctx.lineTo(100, 10);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.fill();
        ctx.restore();
      }

      ctx.restore(); // end camera
    };

    animationRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationRef.current);
  }, [showInstructions]);

  return (
    <div className="fixed inset-0 overflow-hidden touch-none bg-sky-500 font-sans">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* UI Overlay */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 bg-white/90 backdrop-blur-md p-2 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg border border-white/50 pointer-events-none">
        <div className="text-xl sm:text-3xl font-black text-sky-900">คะแนน: {uiState.score}</div>
        <div className="hidden sm:block text-sm font-medium text-sky-700 mt-1">เป้าหมาย: แล่นเรือไปเก็บทุ่นสีแดง</div>
      </div>

      {/* Wind Indicator */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-white/90 backdrop-blur-md p-2 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg border border-white/50 flex flex-col items-center w-24 sm:w-32 pointer-events-none">
        <span className="text-[10px] sm:text-sm font-bold text-slate-700 mb-1 sm:mb-2">ทิศทางลม</span>
        <div className="relative w-10 h-10 sm:w-16 sm:h-16 rounded-full border-2 sm:border-4 border-sky-200 flex items-center justify-center bg-sky-50 shadow-inner">
          <Navigation 
            className="w-5 h-5 sm:w-8 sm:h-8 text-sky-500 transition-transform duration-200" 
            style={{ transform: `rotate(${uiState.windDir + 90}deg)` }} 
            fill="currentColor"
          />
        </div>
        <span className="text-[10px] sm:text-xs font-bold text-slate-500 mt-1 sm:mt-2">
          {(uiState.speed * 2).toFixed(1)} knots
        </span>
      </div>

      {/* In Irons Warning */}
      {uiState.inIrons && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-red-500/90 backdrop-blur-md text-white px-8 py-4 rounded-full font-black text-2xl shadow-2xl animate-bounce border-4 border-red-400 pointer-events-none">
          ⚠️ ทวนลม! (In Irons)
          <div className="text-sm font-medium text-center mt-1 text-red-100">หันหัวเรือออกจากลม!</div>
        </div>
      )}

      {/* Controls - Bottom */}
      <div className="absolute bottom-4 left-2 right-2 sm:bottom-6 sm:left-6 sm:right-6 flex justify-between items-end pointer-events-none">
        {/* Steering */}
        <div className="flex gap-2 sm:gap-4 pointer-events-auto">
          <button 
            className="w-16 h-16 sm:w-20 sm:h-20 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform border border-slate-200 select-none touch-manipulation"
            onPointerDown={() => keys.current['ArrowLeft'] = true}
            onPointerUp={() => keys.current['ArrowLeft'] = false}
            onPointerLeave={() => keys.current['ArrowLeft'] = false}
          >
            <RotateCcw className="w-8 h-8 sm:w-10 sm:h-10 text-slate-700" />
          </button>
          <button 
            className="w-16 h-16 sm:w-20 sm:h-20 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform border border-slate-200 select-none touch-manipulation"
            onPointerDown={() => keys.current['ArrowRight'] = true}
            onPointerUp={() => keys.current['ArrowRight'] = false}
            onPointerLeave={() => keys.current['ArrowRight'] = false}
          >
            <RotateCcw className="w-8 h-8 sm:w-10 sm:h-10 text-slate-700 scale-x-[-1]" />
          </button>
        </div>

        {/* Sail Trim */}
        <div className="bg-white/90 backdrop-blur-md p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200 w-40 sm:w-64 pointer-events-auto">
          <div className="flex justify-between items-end mb-2 sm:mb-3">
            <span className="text-sm sm:text-base font-bold text-slate-800">ปรับใบเรือ</span>
            <span className="text-xs sm:text-sm font-bold text-sky-600">{uiState.sailTrim.toFixed(0)}°</span>
          </div>
          
          <input 
            type="range" 
            min="0" max="90" 
            value={uiState.sailTrim}
            onChange={(e) => {
              gameState.current.boat.sailTrim = Number(e.target.value);
              setUiState(prev => ({...prev, sailTrim: Number(e.target.value)}));
            }}
            className="w-full h-2 sm:h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500 touch-manipulation"
          />
          <div className="flex justify-between w-full text-[10px] sm:text-xs font-bold text-slate-500 mt-1 sm:mt-2">
            <span>ดึงเข้า</span>
            <span>ปล่อยออก</span>
          </div>

          {/* Efficiency Meter */}
          <div className="mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-slate-100">
            <div className="text-[10px] sm:text-xs font-bold text-slate-600 mb-1 flex justify-between">
              <span>ประสิทธิภาพ</span>
              <span className={uiState.efficiency > 0.8 ? 'text-green-600' : uiState.efficiency > 0.4 ? 'text-amber-600' : 'text-red-600'}>
                {Math.round(uiState.efficiency * 100)}%
              </span>
            </div>
            <div className="w-full h-1.5 sm:h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <div 
                className={`h-full transition-all duration-300 ${uiState.efficiency > 0.8 ? 'bg-green-500' : uiState.efficiency > 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${uiState.efficiency * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100">
            <h2 className="text-3xl font-black mb-6 text-slate-800 text-center">Sailing Simulator ⛵</h2>
            <ul className="space-y-4 text-slate-600 mb-8 font-medium">
              <li className="flex items-start gap-3">
                <span className="text-xl">🎯</span>
                <span><strong>เป้าหมาย:</strong> บังคับเรือไปเก็บทุ่นสีแดงให้ได้มากที่สุด</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-xl">💨</span>
                <span><strong>ทิศทางลม:</strong> สังเกตลูกศรลมที่มุมขวาบน ลมจะพัดไปตามทิศทางนั้น</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-xl">🧭</span>
                <span><strong>การบังคับ:</strong> ใช้ปุ่มซ้าย/ขวา (หรือ A/D) เพื่อหันหัวเรือ</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-xl">🪢</span>
                <span><strong>ใบเรือ:</strong> ปรับความตึงใบเรือให้เหมาะสมกับทิศทางลม (ใช้แถบเลื่อน หรือ W/S) เพื่อให้เรือวิ่งเร็วที่สุด</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <span><strong>ระวัง:</strong> อย่าหันหัวเรือสวนลมตรงๆ (ทวนลม) เพราะเรือจะหยุดวิ่ง!</span>
              </li>
            </ul>
            <button 
              onClick={() => setShowInstructions(false)}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-black text-lg py-4 rounded-2xl transition-colors shadow-lg shadow-sky-500/30 active:scale-95"
            >
              เริ่มเกม! (Start)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
