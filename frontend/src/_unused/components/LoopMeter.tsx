import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

interface LoopMeterProps {
  analyser: AnalyserNode | null;
  active: boolean;
}

type MeterLevels = [number, number];

export function LoopMeter({ analyser, active }: LoopMeterProps) {
  const [levels, setLevels] = useState<MeterLevels>([0, 0]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analyser || !active) {
      setLevels([0, 0]);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const update = () => {
      analyser.getByteFrequencyData(buffer);
      const half = buffer.length / 2;
      const low = average(buffer.subarray(0, half));
      const high = average(buffer.subarray(half));
      setLevels([low / 255, high / 255]);
      rafRef.current = requestAnimationFrame(update);
    };

    update();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [analyser, active]);

  const lowLevel = clamp(levels[0]);
  const highLevel = clamp(levels[1]);

  return (
    <div className={`loop-meter ${active ? 'loop-meter--active' : 'loop-meter--idle'}`}>
      <div className="loop-meter-bar" style={{ '--level': lowLevel } as CSSProperties}>
        <div className="loop-meter-bar-fill" style={{ height: `${lowLevel * 100}%` }} />
      </div>
      <div className="loop-meter-bar" style={{ '--level': highLevel } as CSSProperties}>
        <div className="loop-meter-bar-fill" style={{ height: `${highLevel * 100}%` }} />
      </div>
    </div>
  );
}

function average(values: Uint8Array): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function clamp(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
