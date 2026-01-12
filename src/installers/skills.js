import fs from "fs/promises";
import path from "path";

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findSkillsDir(repoDir, candidates) {
  for (const candidate of candidates) {
    const fullPath = path.join(repoDir, candidate);
    if (await pathExists(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

async function copySkills(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true, force: true });
}

export {
  findSkillsDir,
  copySkills
};