import { useEffect, useRef, useState } from "react";
import type { DesignParameters } from "@/design/types";
import { createBuildingFaces, type Point3 } from "@/design/geometry";

export function DesignViewport({ design }: { design: DesignParameters }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({
    yaw: -0.72,
    pitch: 0.57,
    zoom: 7.2,
    x: 0,
    y: 24
  });
  const drag = useRef<{ x: number; y: number; button: number } | null>(null);
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const draw = () => {
      const ratio = devicePixelRatio || 1,
        r = el.getBoundingClientRect();
      el.width = r.width * ratio;
      el.height = r.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.fillStyle = "#dfe5e7";
      ctx.fillRect(0, 0, r.width, r.height);
      const project = ([x, y, z]: Point3) => {
        const a = (design.orientation * Math.PI) / 180 + view.yaw;
        const rx = x * Math.cos(a) - y * Math.sin(a),
          ry = x * Math.sin(a) + y * Math.cos(a);
        return [
          r.width / 2 + view.x + rx * view.zoom,
          r.height * 0.56 +
            view.y +
            (ry * Math.sin(view.pitch) - z * Math.cos(view.pitch)) * view.zoom
        ] as [number, number];
      };
      ctx.strokeStyle = "#c4ced2";
      ctx.lineWidth = 1;
      for (let i = -140; i <= 140; i += 10) {
        let a = project([i, -140, 0]),
          b = project([i, 140, 0]);
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
        a = project([-140, i, 0]);
        b = project([140, i, 0]);
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      }
      const faces = createBuildingFaces(design)
        .map((f) => ({
          ...f,
          depth: f.points.reduce((s, p) => s + p[1], 0) / f.points.length
        }))
        .sort((a, b) => b.depth - a.depth);
      for (const face of faces) {
        ctx.beginPath();
        face.points
          .map(project)
          .forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.closePath();
        ctx.fillStyle = face.fill;
        ctx.fill();
        ctx.strokeStyle = "#50616a";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      const datum = project([
          -(design.width / 2 + 8),
          -(design.depth / 2 + 5),
          0
        ]),
        floor = project([
          -(design.width / 2 + 8),
          -(design.depth / 2 + 5),
          design.elevation
        ]);
      ctx.strokeStyle = "#1675d1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(...datum);
      ctx.lineTo(...floor);
      ctx.stroke();
      ctx.fillStyle = "#0e5fad";
      ctx.font = "600 11px Geist";
      ctx.fillText(`+${design.elevation}′ FFE`, floor[0] - 8, floor[1] - 8);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [design, view]);
  return (
    <canvas
      ref={canvas}
      className="design-canvas"
      aria-label="Interactive 3D building viewport"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, button: e.button };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x,
          dy = e.clientY - drag.current.y;
        drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
        setView((v) =>
          drag.current?.button === 2
            ? { ...v, x: v.x + dx, y: v.y + dy }
            : {
                ...v,
                yaw: v.yaw + dx * 0.008,
                pitch: Math.max(0.18, Math.min(1.1, v.pitch + dy * 0.006))
              }
        );
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) =>
        setView((v) => ({
          ...v,
          zoom: Math.max(3, Math.min(14, v.zoom - e.deltaY * 0.01))
        }))
      }
    />
  );
}
