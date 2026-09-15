import type { DesignParameters } from "./types";

export interface Finding {
  title: string;
  detail: string;
  tone: "note" | "attention";
}

// Educational prompts only. A validated engineering model can replace this
// adapter without coupling the future service to the interface or geometry.
export function getSampleFindings(design: DesignParameters): Finding[] {
  return [
    {
      title: "Roof form review",
      detail:
        design.roof === "Flat"
          ? "Flat roof selected. Ask the project engineer to review drainage, uplift paths, and edge conditions."
          : `${design.roof} roof selected. Confirm geometry, connections, and load paths with the project engineer.`,
      tone: "attention"
    },
    {
      title: "Finished floor elevation",
      detail: `The concept floor is shown ${design.elevation} ft above the site datum. Compare against a verified site-specific flood study.`,
      tone: "note"
    },
    {
      title: "Building orientation",
      detail: `The concept is rotated ${design.orientation}°. Review exposure, openings, and site constraints with qualified consultants.`,
      tone: "note"
    }
  ];
}
