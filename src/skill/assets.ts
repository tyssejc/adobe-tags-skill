import skillMd from "../../skill/SKILL.md" with { type: "text" };
import reactorConcepts from "../../skill/references/reactor-concepts.md" with { type: "text" };

export interface SkillAsset {
  relativePath: string;
  contents: string;
}

// Embedded at build time; `bun build --compile` bakes these text imports into
// the binary so the skill version always matches the CLI that ships it.
export const SKILL_ASSETS: SkillAsset[] = [
  { relativePath: "SKILL.md", contents: skillMd },
  { relativePath: "references/reactor-concepts.md", contents: reactorConcepts },
];
