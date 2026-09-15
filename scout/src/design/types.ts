export type RoofType = "Flat" | "Gable" | "Hip";

export interface DesignParameters {
  width: number;
  depth: number;
  height: number;
  orientation: number;
  elevation: number;
  roof: RoofType;
}

export interface Alternative {
  id: string;
  name: string;
  savedAt: string;
  parameters: DesignParameters;
}

export const DEFAULT_DESIGN: DesignParameters = {
  width: 52,
  depth: 34,
  height: 22,
  orientation: 18,
  elevation: 6,
  roof: "Hip"
};
