import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function getSkillDirName(skillPackageName) {
  return skillPackageName.replace(/-skill$/, "");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "pipe",
      shell: true,
      ...options,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data;
    });
    child.stderr?.on("data", (data) => {
      stderr += data;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with code ${code}: ${stderr}`,
        ),
      );
    });
  });
}

async function cleanupTemp(tempDir) {
  if (await pathExists(tempDir)) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function removeDirIfEmpty(targetDir) {
  if (!(await pathExists(targetDir))) {
    return;
  }

  const entries = await fs.readdir(targetDir);
  if (entries.length === 0) {
    await fs.rmdir(targetDir);
  }
}

/**
 * Install skills from npm packages into IDE skills directories.
 *
 * 1. Creates temp directory with package.json listing skills as dependencies
 * 2. Runs npm install in temp directory
 * 3. Copies installed skill packages (SKILL.md files) to target directories
 * 4. Returns temp directory path for cleanup
 *
 * @param {string[]} skills - Array of npm package names
 * @param {Array<{path: string, shouldNest: boolean}>} targetConfigs - Array of target configs with path and nesting preference
 * @param {string} tempDir - Temporary directory for npm install
 * @param {string} skillsFolder - Optional subfolder name to bundle skills (e.g., "a11y")
 * @param {string} readmeTemplate - README template filename from templates folder
 * @returns {Promise<{installed: number, tempDir: string}>}
 */
async function installSkillsFromNpm(
  skills,
  targetConfigs,
  tempDir,
  skillsFolder = null,
  readmeTemplate = "deploy-README.md",
) {
  // Create temp directory
  await fs.mkdir(tempDir, { recursive: true });

  // Create package.json with skills as dependencies
  const packageJson = {
    name: "a11y-skills-temp",
    version: "1.0.0",
    private: true,
    dependencies: {},
  };

  for (const skill of skills) {
    packageJson.dependencies[skill] = "latest";
  }

  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );

  // Run npm install
  await run("npm", ["install", "--production"], { cwd: tempDir });

  // Copy SKILL.md files from installed packages to target directories
  const nodeModulesDir = path.join(tempDir, "node_modules");
  let installedCount = 0;

  for (const targetConfig of targetConfigs) {
    const targetDir = targetConfig.path;
    const shouldNest = targetConfig.shouldNest;

    // Determine the actual skills directory (with or without bundle folder)
    const skillsDir = shouldNest && skillsFolder
      ? path.join(targetDir, skillsFolder)
      : targetDir;

    await fs.mkdir(skillsDir, { recursive: true });

    for (const skill of skills) {
      const skillPackageDir = path.join(nodeModulesDir, skill);
      const skillMdPath = path.join(skillPackageDir, "SKILL.md");

      if (await pathExists(skillMdPath)) {
        // Create skill directory in target (use package name without -skill suffix)
        const skillDirName = getSkillDirName(skill);
        const targetSkillDir = path.join(skillsDir, skillDirName);
        await fs.mkdir(targetSkillDir, { recursive: true });

        // Copy SKILL.md
        await fs.copyFile(skillMdPath, path.join(targetSkillDir, "SKILL.md"));
        installedCount++;
      }
    }

    // Copy the comprehensive README template to the skills directory
    const readmeTemplatePath = path.join(
      __dirname,
      "..",
      "..",
      "templates",
      readmeTemplate,
    );
    const targetReadmePath = path.join(skillsDir, "a11y-devkit-README.md");
    if (await pathExists(readmeTemplatePath)) {
      await fs.copyFile(readmeTemplatePath, targetReadmePath);
    }
  }

  return {
    installed: installedCount / targetConfigs.length,
    tempDir,
  };
}

/**
 * Remove skills installed by this tool from target directories.
 *
 * @param {string[]} skills - Array of npm package names
 * @param {Array<{path: string, shouldNest: boolean}>} targetConfigs - Array of target configs with path and nesting preference
 * @param {string} skillsFolder - Optional subfolder name used for bundled skills
 * @param {string} readmeTemplate - README template filename from templates folder
 * @returns {Promise<{removed: number}>}
 */
async function uninstallSkillsFromTargets(
  skills,
  targetConfigs,
  skillsFolder = null,
  readmeTemplate = "deploy-README.md",
) {
  let removedCount = 0;

  for (const targetConfig of targetConfigs) {
    const targetDir = targetConfig.path;
    const shouldNest = targetConfig.shouldNest;

    const skillsDir = shouldNest && skillsFolder
      ? path.join(targetDir, skillsFolder)
      : targetDir;

    for (const skill of skills) {
      const skillDirName = getSkillDirName(skill);
      const targetSkillDir = path.join(skillsDir, skillDirName);

      if (await pathExists(targetSkillDir)) {
        await fs.rm(targetSkillDir, { recursive: true, force: true });
        removedCount++;
      }
    }

    const readmePath = path.join(skillsDir, "a11y-devkit-README.md");
    if (await pathExists(readmePath)) {
      await fs.rm(readmePath, { force: true });
    }

    if (shouldNest && skillsFolder) {
      await removeDirIfEmpty(skillsDir);
    }
  }

  return { removed: removedCount };
}

export { installSkillsFromNpm, uninstallSkillsFromTargets, cleanupTemp };
