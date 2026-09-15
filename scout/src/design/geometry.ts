import type { DesignParameters } from "./types";

export type Point3 = [number, number, number];
export interface Face {
  points: Point3[];
  fill: string;
  stroke?: string;
}

export function createBuildingFaces(p: DesignParameters): Face[] {
  const w = p.width / 2,
    d = p.depth / 2,
    z0 = p.elevation,
    z1 = z0 + p.height;
  const base: Point3[] = [
    [-w, -d, z0],
    [w, -d, z0],
    [w, d, z0],
    [-w, d, z0]
  ];
  const faces: Face[] = [
    { points: [base[0], base[1], [w, -d, z1], [-w, -d, z1]], fill: "#dce4e8" },
    { points: [base[1], base[2], [w, d, z1], [w, -d, z1]], fill: "#c5d0d6" },
    { points: [base[2], base[3], [-w, d, z1], [w, d, z1]], fill: "#b9c6cc" },
    { points: [base[3], base[0], [-w, -d, z1], [-w, d, z1]], fill: "#e7edf0" }
  ];
  if (p.roof === "Flat")
    faces.push({
      points: [
        [-w, -d, z1],
        [w, -d, z1],
        [w, d, z1],
        [-w, d, z1]
      ],
      fill: "#f2f5f6"
    });
  if (p.roof === "Gable") {
    const ridge = z1 + Math.min(d * 0.45, 9);
    faces.push({
      points: [
        [-w, -d, z1],
        [w, -d, z1],
        [w, 0, ridge],
        [-w, 0, ridge]
      ],
      fill: "#f4f6f7"
    });
    faces.push({
      points: [
        [-w, 0, ridge],
        [w, 0, ridge],
        [w, d, z1],
        [-w, d, z1]
      ],
      fill: "#dfe6e9"
    });
  }
  if (p.roof === "Hip") {
    const top = z1 + Math.min(d * 0.4, 8),
      rw = Math.max(w * 0.5, w - d);
    faces.push({
      points: [
        [-w, -d, z1],
        [w, -d, z1],
        [rw, 0, top],
        [-rw, 0, top]
      ],
      fill: "#f5f7f8"
    });
    faces.push({
      points: [
        [w, -d, z1],
        [w, d, z1],
        [rw, 0, top]
      ],
      fill: "#d3dde1"
    });
    faces.push({
      points: [
        [w, d, z1],
        [-w, d, z1],
        [-rw, 0, top],
        [rw, 0, top]
      ],
      fill: "#e2e8ea"
    });
    faces.push({
      points: [
        [-w, d, z1],
        [-w, -d, z1],
        [-rw, 0, top]
      ],
      fill: "#edf1f2"
    });
  }
  return faces;
}
