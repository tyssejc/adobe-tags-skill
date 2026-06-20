import { SKILL_ASSETS } from "../skill/assets.ts";
import { writeSkillAssets } from "../skill/install.ts";
import { skillInstallDir } from "../paths.ts";
import type { Cmd } from "../command.ts";

// `cadmium skill install [--force]`
export const cmdSkillInstall: Cmd = async (_rest, flags) => {
  const dir = skillInstallDir();
  const written = await writeSkillAssets(dir, SKILL_ASSETS, { force: !!flags.force });
  console.log(`Installed adobe-tags skill (${written.length} files) to ${dir}`);
  return 0;
};

// `cadmium skill path`
export const cmdSkillPath: Cmd = async () => {
  console.log(skillInstallDir());
  return 0;
};
