import { useState, useRef, useEffect } from "react";

interface SecWheelProps {
  catchChance: number; // 0-1
  fineAmount: number;
  profit: number;
  symbol: string;
  onResult: (caught: boolean) => void;
}

export function SecWheel({ catchChance, fineAmount, profit, symbol, onResult }: SecWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<"caught" | "safe" | null>(null);
  const [rotation, setRotation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerAngle = useRef(0);

  const catchDegrees = catchChance * 360;
  const safeDegrees = 360 - catchDegrees;

  useEffect(() => {
    drawWheel(rotation);
  }, [rotation]);

  function drawWheel(rot: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 10;

    ctx.clearRect(0, 0, size, size);

    // Draw wheel
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);

    // Safe zone (green)
    const safeStart = 0;
    const safeEnd = (safeDegrees * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, safeStart, safeEnd);
    ctx.closePath();
    ctx.fillStyle = "#1a8a3e";
    ctx.fill();
    ctx.strokeStyle = "#0d5c28";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Caught zone (red)
    const caughtStart = safeEnd;
    const caughtEnd = 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, caughtStart, caughtEnd);
    ctx.closePath();
    ctx.fillStyle = "#c0392b";
    ctx.fill();
    ctx.strokeStyle = "#7b241c";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Safe label
    const safeMid = safeEnd / 2;
    ctx.save();
    ctx.rotate(safeMid);
    ctx.fillText("SAFE", radius * 0.6, 0);
    ctx.restore();

    // Caught label
    const caughtMid = (caughtStart + caughtEnd) / 2;
    ctx.save();
    ctx.rotate(caughtMid);
    ctx.fillText("CAUGHT", radius * 0.6, 0);
    ctx.fillText(`${Math.round(catchChance * 100)}%`, radius * 0.6, 18);
    ctx.restore();

    ctx.restore();

    // Draw pointer (top, pointing down)
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(cx - 12, 0);
    ctx.lineTo(cx + 12, 0);
    ctx.closePath();
    ctx.fillStyle = "#f1c40f";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
    ctx.fillStyle = "#333";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function handleSpin() {
    if (spinning || result) return;
    setSpinning(true);

    // Determine result first
    const caught = Math.random() < catchChance;

    // Calculate target angle so pointer lands in the correct zone
    // Pointer is at top (0 degrees). Wheel rotates clockwise.
    // Safe zone is from 0 to safeDegrees, caught is safeDegrees to 360
    let targetZoneStart: number;
    let targetZoneEnd: number;
    if (caught) {
      targetZoneStart = safeDegrees + 10;
      targetZoneEnd = 360 - 10;
    } else {
      targetZoneStart = 10;
      targetZoneEnd = safeDegrees - 10;
    }

    // Random position within the zone
    const landAngle = targetZoneStart + Math.random() * (targetZoneEnd - targetZoneStart);
    // Spin multiple rotations + land at the angle
    // The wheel rotates, so we need the final rotation to place landAngle at top (0)
    // At rotation R, the angle at the pointer is (360 - R % 360)
    // We want: (360 - finalRot % 360) = landAngle => finalRot % 360 = 360 - landAngle
    const targetRot = (360 - landAngle) + 360 * (5 + Math.floor(Math.random() * 3));

    const startRot = rotation;
    const totalRot = targetRot - startRot;
    const duration = 3000 + Math.random() * 1000;
    const startTime = performance.now();

    pointerAngle.current = landAngle;

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const currentRot = startRot + totalRot * eased;
      setRotation(currentRot);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        setRotation(targetRot);
        setSpinning(false);
        setResult(caught ? "caught" : "safe");
      }
    }

    requestAnimationFrame(animate);
  }

  return (
    <div className="sec-wheel-overlay">
      <div className="sec-wheel-container">
        <h2>🔍 SEC Investigation</h2>
        <p className="sec-wheel-info">
          You profited <span className="up">${profit.toFixed(2)}</span> from insider info on <strong>{symbol}</strong>.
          <br />The SEC is investigating suspicious trading activity...
        </p>

        <div className="sec-wheel-canvas-wrap">
          <canvas ref={canvasRef} width={300} height={300} />
        </div>

        {!spinning && !result && (
          <button className="sec-wheel-spin-btn" onClick={handleSpin}>
            🎰 Spin the Wheel
          </button>
        )}

        {spinning && (
          <p className="sec-wheel-spinning">The SEC is reviewing your trades...</p>
        )}

        {result === "caught" && (
          <div className="sec-wheel-result caught">
            <div className="sec-wheel-result-icon">🚨</div>
            <div>CAUGHT! Fine: <span className="danger">-${fineAmount.toFixed(2)}</span></div>
            <button className="sec-wheel-ok-btn" onClick={() => onResult(true)}>Accept Fine</button>
          </div>
        )}

        {result === "safe" && (
          <div className="sec-wheel-result safe">
            <div className="sec-wheel-result-icon">✅</div>
            <div>You got away with it this time!</div>
            <button className="sec-wheel-ok-btn" onClick={() => onResult(false)}>Continue</button>
          </div>
        )}
      </div>
    </div>
  );
}
