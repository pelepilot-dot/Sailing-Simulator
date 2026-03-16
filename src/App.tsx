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
    startTime: 0,
    elapsedTime: 0,
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
    efficiency: 0,
    timeStr: '00:00'
  });

  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.key] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    const handleResize = () => {
      if (canvasRef.current) {
        const dpr = window.devicePixelRatio || 1;
        canvasRef.current.width = window.innerWidth * dpr;
        canvasRef.current.height = window.innerHeight * dpr;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }
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

      if (state.startTime === 0) state.startTime = performance.now();
      state.elapsedTime = performance.now() - state.startTime;

      // Controls
      if (keys.current['ArrowLeft'] || keys.current['a']) boat.heading -= 2.5 * dt;
      if (keys.current['ArrowRight'] || keys.current['d']) boat.heading += 2.5 * dt;
      if (keys.current['ArrowUp'] || keys.current['w']) boat.sailTrim = Math.max(0, boat.sailTrim - 1.5 * dt);
      if (keys.current['ArrowDown'] || keys.current['s']) boat.sailTrim = Math.min(90, boat.sailTrim + 1.5 * dt);

      boat.heading = normalizeAngle(boat.heading);

      // Physics (Aerodynamic Airfoil Model)
      // 1. Calculate Apparent Wind
      const boatVx = Math.cos(boat.heading * Math.PI / 180) * boat.speed;
      const boatVy = Math.sin(boat.heading * Math.PI / 180) * boat.speed;
      const windVx = Math.cos(wind.dir * Math.PI / 180) * wind.speed * 8; 
      const windVy = Math.sin(wind.dir * Math.PI / 180) * wind.speed * 8;
      
      const awVx = windVx - boatVx;
      const awVy = windVy - boatVy;
      const awDir = Math.atan2(awVy, awVx) * 180 / Math.PI;
      const awSpeed = Math.hypot(awVx, awVy);

      // Apparent Wind Angle relative to boat
      const awa = normalizeAngle(awDir - boat.heading); 
      
      // 2. Determine Sail Angle
      let actualSailAngle = 0;
      let isLuffing = false;
      
      if (Math.abs(awa) <= boat.sailTrim) {
        actualSailAngle = awa; // Sail flaps in the wind (luffing)
        isLuffing = true;
      } else {
        actualSailAngle = Math.sign(awa) * boat.sailTrim; // Sail fills
      }

      // 3. Calculate Angle of Attack (AoA)
      const aoa = Math.abs(awa - actualSailAngle);

      // 4. Aerodynamic Coefficients (Lift & Drag)
      let CL = 0; 
      let CD = 0.05; // Base parasitic drag

      if (!isLuffing) {
        if (aoa <= 25) {
          // Attached flow (Lift generation)
          CL = Math.sin(aoa * Math.PI / 180 * (90/25)) * 1.6; 
          CD += 0.05 + Math.pow(aoa / 25, 2) * 0.15; // Induced drag
        } else {
          // Stalled (Separated flow)
          CL = 1.6 * Math.cos((aoa - 25) * Math.PI / 180);
          if (CL < 0) CL = 0;
          CD += 0.2 + Math.pow((aoa - 25) / 65, 2) * 1.2; // High drag
        }
      } else {
        CD = 0.02; // Flapping drag
      }

      // 5. Calculate Forces
      const dynamicPressure = 0.5 * 1.225 * awSpeed * awSpeed * 0.05; // Scaled air density factor
      const sailArea = 2.5;
      const liftForce = CL * dynamicPressure * sailArea;
      const dragForce = CD * dynamicPressure * sailArea;

      // Lift is perpendicular to apparent wind
      const liftDir = awDir - Math.sign(awa) * 90;
      const dragDir = awDir;

      // Project forces onto boat's forward axis
      const liftForward = Math.cos((liftDir - boat.heading) * Math.PI / 180) * liftForce;
      const dragForward = Math.cos((dragDir - boat.heading) * Math.PI / 180) * dragForce;
      
      const liftLateral = Math.sin((liftDir - boat.heading) * Math.PI / 180) * liftForce;
      const dragLateral = Math.sin((dragDir - boat.heading) * Math.PI / 180) * dragForce;

      const totalForwardForce = liftForward + dragForward;
      const totalLateralForce = liftLateral + dragLateral;

      // 6. Update State
      let efficiency = isLuffing ? 0 : Math.max(0, CL / 1.6);
      const inIrons = Math.abs(awa) < 25 && boat.speed < 0.5;

      // Heel Angle (Boat tilting)
      const targetHeel = totalLateralForce * 12; // Tuning factor
      (boat as any).heel = ((boat as any).heel || 0) + (targetHeel - ((boat as any).heel || 0)) * 0.1;
      
      // Leeway (Drift)
      // Keel provides lateral resistance proportional to speed squared
      const keelResistance = Math.max(0.5, boat.speed * boat.speed) * 0.15;
      const targetLeeway = Math.atan2(totalLateralForce, keelResistance) * 180 / Math.PI * 0.15; // Dampened
      (boat as any).leeway = ((boat as any).leeway || 0) + (targetLeeway - ((boat as any).leeway || 0)) * 0.1;

      // Acceleration and water drag
      // Hull speed limit (wave making drag increases exponentially)
      const hullSpeed = 8.0;
      const waveDrag = Math.pow(boat.speed / hullSpeed, 4) * 0.05;
      const waterDrag = boat.speed * boat.speed * 0.015 + boat.speed * 0.02 + waveDrag;
      
      boat.speed += (totalForwardForce - waterDrag) * dt;
      if (boat.speed < 0) boat.speed = 0;

      // Actual course over ground (heading + leeway)
      const cog = boat.heading + ((boat as any).leeway || 0);
      boat.x += Math.cos(cog * Math.PI / 180) * boat.speed * dt;
      boat.y += Math.sin(cog * Math.PI / 180) * boat.speed * dt;

      // Store for rendering
      (boat as any).actualSailAngle = actualSailAngle;
      (boat as any).isLuffing = isLuffing;
      (boat as any).aoa = aoa;
      (boat as any).CL = CL;
      (boat as any).CD = CD;
      (boat as any).liftForce = liftForce;
      (boat as any).dragForce = dragForce;
      (boat as any).liftDir = liftDir;
      (boat as any).dragDir = dragDir;
      (boat as any).awDir = awDir;
      (boat as any).awSpeed = awSpeed;

      // Target collision
      const dist = Math.hypot(target.x - boat.x, target.y - boat.y);
      if (dist < 120) {
        state.score += 1;
        const angle = Math.random() * Math.PI * 2;
        const distance = 800 + Math.random() * 700;
        target.x = boat.x + Math.cos(angle) * distance;
        target.y = boat.y + Math.sin(angle) * distance;
        // Removed random wind change so user has full control
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
        const totalSeconds = Math.floor(state.elapsedTime / 1000);
        const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');

        setUiState({
          score: state.score,
          speed: boat.speed,
          sailTrim: boat.sailTrim,
          windDir: wind.dir,
          inIrons,
          efficiency,
          timeStr: `${mins}:${secs}`
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

      const width = window.innerWidth;
      const height = window.innerHeight;

      const state = gameState.current;
      const { boat, target, particles, wake } = state;

      // Clear & Background
      ctx.fillStyle = '#0ea5e9'; // sky-500
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width / 2 - boat.x, height / 2 - boat.y);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      const gridSize = 400;
      const startX = Math.floor((boat.x - width/2) / gridSize) * gridSize;
      const startY = Math.floor((boat.y - height/2) / gridSize) * gridSize;
      for (let x = startX; x < boat.x + width/2; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, boat.y - height/2); ctx.lineTo(x, boat.y + height/2); ctx.stroke();
      }
      for (let y = startY; y < boat.y + height/2; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(boat.x - width/2, y); ctx.lineTo(boat.x + width/2, y); ctx.stroke();
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
      
      // Draw Global Vectors (True Wind, Apparent Wind, Boat Speed)
      const drawVector = (angle: number, length: number, color: string, label: string) => {
        if (length < 0.1) return;
        ctx.save();
        ctx.rotate(angle * Math.PI / 180);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(length, 0);
        ctx.lineTo(length - 8, -4);
        ctx.lineTo(length - 8, 4);
        ctx.fillStyle = color;
        ctx.fill();
        // Label
        ctx.translate(length + 10, 0);
        ctx.rotate(-angle * Math.PI / 180); // Keep text upright
        ctx.fillStyle = color;
        ctx.font = '10px sans-serif';
        ctx.fillText(label, -5, 4);
        ctx.restore();
      };

      // Draw Wind Vectors around the boat
      drawVector(state.wind.dir, state.wind.speed * 50, 'rgba(56, 189, 248, 0.6)', 'TW'); // True Wind (sky-400)
      drawVector((boat as any).awDir || 0, ((boat as any).awSpeed || 0) * 50, 'rgba(14, 165, 233, 0.8)', 'AW'); // Apparent Wind (sky-500)
      drawVector(boat.heading, boat.speed * 10, 'rgba(148, 163, 184, 0.8)', 'BS'); // Boat Speed (slate-400)

      ctx.rotate(boat.heading * Math.PI / 180);
      
      // Hull (Enlarged and curved)
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(60, 0); // Bow
      ctx.quadraticCurveTo(20, 22, -50, 22); // Starboard side
      ctx.lineTo(-50, -22); // Stern
      ctx.quadraticCurveTo(20, -22, 60, 0); // Port side
      ctx.closePath();
      ctx.fill();
      
      // Deck details
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 0);
      ctx.lineTo(-40, 0);
      ctx.stroke();
      
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Sail (Airfoil shape)
      const actualSailAngle = (boat as any).actualSailAngle || 0;
      const isLuffing = (boat as any).isLuffing || false;
      const aoa = (boat as any).aoa || 0;
      
      ctx.save();
      ctx.translate(10, 0); // Mast position
      ctx.rotate(actualSailAngle * Math.PI / 180);
      
      // Boom
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-85, 0);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Sail cloth (Airfoil)
      if (isLuffing) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-40, Math.sin(Date.now() / 100) * 15, -85, 0);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const belly = 35 * Math.sign(actualSailAngle || 1);
        // Leeward curve (more curved)
        ctx.quadraticCurveTo(-35, belly * 1.3, -85, 0);
        // Windward curve (less curved)
        ctx.quadraticCurveTo(-35, belly * 0.8, 0, 0);
        
        // Color indicates lift/stall
        if (aoa > 25) {
          ctx.fillStyle = 'rgba(255, 200, 200, 0.9)'; // Stalled (reddish)
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; // Good lift
        }
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw Lift Force Vectors (Green arrows) & Airflow
        const CL = (boat as any).CL || 0; 
        const liftMag = Math.max(8, CL * 30); // Scale arrow length, minimum 8
        const sign = Math.sign(actualSailAngle || 1);
        
        // Lift Arrows on Sail Surface
        ctx.strokeStyle = aoa > 25 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.9)'; // red-500 if stalled, else green-500
        ctx.fillStyle = aoa > 25 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.9)';
        ctx.lineWidth = 2.5;
        
        [-20, -45, -70].forEach(x => {
          const normalizedX = (x + 42.5) / 42.5; 
          const y = (1 - normalizedX * normalizedX) * belly * 1.2; 
          const startY = y + sign * 4;
          const endY = startY + sign * liftMag;
          
          ctx.beginPath();
          ctx.moveTo(x, startY);
          ctx.lineTo(x, endY);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(x, endY + sign * 2);
          ctx.lineTo(x - 4, endY - sign * 5);
          ctx.lineTo(x + 4, endY - sign * 5);
          ctx.fill();
        });

        // Airflow lines
        ctx.strokeStyle = aoa > 25 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(14, 165, 233, 0.5)'; // red if stalled, else sky-500
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.moveTo(10, sign * 15);
        if (aoa > 25) {
          // Turbulent airflow if stalled
          ctx.quadraticCurveTo(-35, belly * 3.0, -80, sign * 30);
        } else {
          // Smooth airflow
          ctx.quadraticCurveTo(-35, belly * 2.2, -100, sign * 5);
        }
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(10, sign * 25);
        if (aoa > 25) {
          // Turbulent airflow if stalled
          ctx.quadraticCurveTo(-35, belly * 4.0, -70, sign * 40);
        } else {
          // Smooth airflow
          ctx.quadraticCurveTo(-35, belly * 3.0, -100, sign * 15);
        }
        ctx.stroke();
      }
      
      // Draw Aerodynamic Force Vectors from Center of Effort (CE)
      if (!isLuffing && boat.speed > 0.1) {
        ctx.save();
        ctx.translate(-40, 0); // Center of Effort (approx middle of sail)
        
        // Un-rotate sail angle, then un-rotate boat heading to draw in global space
        ctx.rotate(-actualSailAngle * Math.PI / 180);
        ctx.rotate(-boat.heading * Math.PI / 180);
        
        const liftF = (boat as any).liftForce || 0;
        const dragF = (boat as any).dragForce || 0;
        const liftD = (boat as any).liftDir || 0;
        const dragD = (boat as any).dragDir || 0;
        
        const scaleF = 20; // Visual scale for force vectors
        
        // Helper to draw force vector
        const drawForce = (dir: number, mag: number, color: string, label: string) => {
          if (mag < 0.1) return;
          const len = mag * scaleF;
          ctx.save();
          ctx.rotate(dir * Math.PI / 180);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(len, 0);
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.stroke();
          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(len, 0);
          ctx.lineTo(len - 6, -4);
          ctx.lineTo(len - 6, 4);
          ctx.fillStyle = color;
          ctx.fill();
          // Label
          ctx.translate(len + 8, 0);
          ctx.rotate(-dir * Math.PI / 180);
          ctx.fillStyle = color;
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(label, -5, 4);
          ctx.restore();
        };

        // Draw Lift (Green)
        drawForce(liftD, liftF, 'rgba(34, 197, 94, 0.9)', 'LIFT');
        // Draw Drag (Red)
        drawForce(dragD, dragF, 'rgba(239, 68, 68, 0.9)', 'DRAG');
        
        // Draw Total Aerodynamic Force (Yellow)
        const totalX = Math.cos(liftD * Math.PI / 180) * liftF + Math.cos(dragD * Math.PI / 180) * dragF;
        const totalY = Math.sin(liftD * Math.PI / 180) * liftF + Math.sin(dragD * Math.PI / 180) * dragF;
        const totalDir = Math.atan2(totalY, totalX) * 180 / Math.PI;
        const totalMag = Math.hypot(totalX, totalY);
        drawForce(totalDir, totalMag, 'rgba(234, 179, 8, 0.9)', 'TOTAL');
        
        ctx.restore();
      }

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
      if (distToTarget > Math.min(width, height) / 2 - 50) {
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
    <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden touch-none bg-sky-500 font-sans select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* UI Overlay */}
      <div className="absolute sm:top-4 sm:left-4 bg-white/90 backdrop-blur-md p-2 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg border border-white/50 pointer-events-none" style={{ top: 'max(0.5rem, env(safe-area-inset-top))', left: 'max(0.5rem, env(safe-area-inset-left))' }}>
        <div className="text-xl sm:text-3xl font-black text-sky-900">คะแนน: {uiState.score}</div>
        <div className="hidden sm:block text-sm font-medium text-sky-700 mt-1">เป้าหมาย: แล่นเรือไปเก็บทุ่นสีแดง</div>
      </div>

      {/* Top Center: Credit & Timer */}
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10" style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <div className="text-[10px] sm:text-xs font-bold text-white drop-shadow-md mb-1 bg-black/20 px-3 py-0.5 rounded-full backdrop-blur-sm">
          by พ.ท.ศักรินทร์ จรศรี
        </div>
        <div className="bg-white/90 backdrop-blur-md px-4 py-1 sm:py-2 rounded-full shadow-lg border border-white/50">
          <span className="text-lg sm:text-2xl font-black text-slate-800 font-mono tracking-wider">{uiState.timeStr}</span>
        </div>
      </div>

      {/* Wind Indicator */}
      <div className="absolute sm:top-4 sm:right-4 bg-white/90 backdrop-blur-md p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-lg border border-white/50 flex flex-col items-center w-24 sm:w-32 pointer-events-auto" style={{ top: 'max(0.5rem, env(safe-area-inset-top))', right: 'max(0.5rem, env(safe-area-inset-right))' }}>
        <div className="flex justify-between w-full items-center mb-1">
          <span className="text-[9px] sm:text-xs font-bold text-slate-700">ทิศทางลม</span>
          <span className="text-[9px] sm:text-xs font-bold text-sky-600">{Math.round((uiState.windDir % 360 + 360) % 360)}°</span>
        </div>
        <div className="relative w-8 h-8 sm:w-12 sm:h-12 rounded-full border-2 sm:border-[3px] border-sky-200 flex items-center justify-center bg-sky-50 shadow-inner mb-1 sm:mb-2">
          <Navigation 
            className="w-4 h-4 sm:w-6 sm:h-6 text-sky-500 transition-transform duration-200" 
            style={{ transform: `rotate(${uiState.windDir + 90}deg)` }} 
            fill="currentColor"
          />
        </div>
        <input 
          type="range" 
          min="0" max="359" 
          value={Math.round((uiState.windDir % 360 + 360) % 360)}
          onChange={(e) => {
            gameState.current.wind.dir = Number(e.target.value);
            setUiState(prev => ({...prev, windDir: Number(e.target.value)}));
          }}
          className="w-full h-1.5 sm:h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500 touch-manipulation"
        />
        <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 mt-1">
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
      <div className="absolute sm:bottom-6 sm:left-6 sm:right-6 flex justify-between items-end pointer-events-none" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))', left: 'max(0.5rem, env(safe-area-inset-left))', right: 'max(0.5rem, env(safe-area-inset-right))' }}>
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 max-h-full overflow-y-auto">
            <h2 className="text-3xl font-black mb-6 text-slate-800 text-center">Sailing Simulator ⛵</h2>
            <ul className="space-y-4 text-slate-600 mb-8 font-medium">
              <li className="flex items-start gap-3">
                <span className="text-xl">🎯</span>
                <span><strong>เป้าหมาย:</strong> บังคับเรือไปเก็บทุ่นสีแดงให้ได้มากที่สุด</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-xl">💨</span>
                <span><strong>ทิศทางลม:</strong> สังเกตลูกศรลมที่มุมขวาบน คุณสามารถเลื่อนแถบเพื่อเปลี่ยนทิศทางลมได้เอง</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-xl">🧭</span>
                <span><strong>การบังคับ:</strong> ใช้ปุ่มซ้าย/ขวา (หรือ A/D) เพื่อหันหัวเรือ</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-xl">🪢</span>
                <span><strong>ใบเรือ (Airfoil):</strong> ปรับใบเรือให้ทำมุมรับลมพอดีเพื่อสร้าง "แรงยก (Lift)" สูงสุด หากดึงตึงเกินไปใบเรือจะ <strong>Stall (สีแดง)</strong> และสูญเสียความเร็ว</span>
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
