import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prompts from "prompts";

import { header, info, warn, success, startSpinner, formatPath } from "./ui.js";
import { getPlatform, getIdePaths } from "./paths.js";
import { ensureRepo, buildMcp, createReadme } from "./installers/repo.js";
import { findSkillsDir, copySkills } from "./installers/skills.js";
import { resolveServers, installMcpConfig } from "./installers/mcp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig() {
  const configPath = path.join(__dirname, "..", "config", "a11y.json");
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    autoYes: args.has("--yes") || args.has("-y"),
    scope: args.has("--global") ? "global" : args.has("--local") ? "local" : null
  };
}

function resolveScope(repoPaths, scope) {
  return scope === "local" ? repoPaths.local : repoPaths.global;
}

function formatOs(platformInfo) {
  if (platformInfo.isWindows) return "Windows";
  if (platformInfo.isMac) return "macOS";
  if (platformInfo.isLinux) return "Linux";
  return platformInfo.platform;
}

async function run() {
  const projectRoot = process.cwd();
  const platformInfo = getPlatform();
  const config = await loadConfig();
  const idePaths = getIdePaths(projectRoot, platformInfo, config.ideSkillsPaths);
  const args = parseArgs(process.argv);

  header("A11y Skills Deploy", "Install skills + MCP servers across IDEs");
  info(`Detected OS: ${formatOs(platformInfo)}`);

  const ideChoices = [
    { title: "Claude Code", value: "claude" },
    { title: "Cursor", value: "cursor" },
    { title: "Codex", value: "codex" },
    { title: "VSCode", value: "vscode" }
  ];

  let scope = args.scope;
  let ideSelection = ["claude", "cursor", "codex", "vscode"];
  let installSkills = true;

  if (!args.autoYes) {
    const response = await prompts(
      [
        {
          type: scope ? null : "select",
          name: "scope",
          message: "Install skills + repo locally or globally?",
          choices: [
            { title: "Local to this project", value: "local" },
            { title: "Global for this user", value: "global" }
          ],
          initial: 0
        },
        {
          type: "multiselect",
          name: "ides",
          message: "Configure MCP for which IDEs?",
          choices: ideChoices,
          initial: ideChoices.map((_, index) => index)
        },
        {
          type: "toggle",
          name: "installSkills",
          message: "Install skills into IDE skills folders?",
          active: "yes",
          inactive: "no",
          initial: true
        }
      ],
      {
        onCancel: () => {
          warn("Setup cancelled.");
          process.exit(0);
        }
      }
    );

    scope = scope || response.scope;
    ideSelection = response.ides || ideSelection;
    installSkills = response.installSkills;
  }

  if (!scope) {
    scope = "local";
  }

  if (!ideSelection.length) {
    warn("No IDEs selected. MCP installation requires at least one IDE.");
    process.exit(1);
  }

  const scopePaths = resolveScope(idePaths, scope);
  info(`Install scope: ${scope === "local" ? "Local" : "Global"}`);
  info(`Repo path: ${formatPath(scopePaths.repoDir)}`);

  // Clone skills repo into the skills subfolder
  const repoSpinner = startSpinner("Syncing a11y-skills repo...");
  const repoResult = await ensureRepo({
    url: config.repo.url,
    dir: scopePaths.skillsRepoDir
  });
  repoSpinner.succeed(`Repo ${repoResult.action}: ${formatPath(repoResult.dir)}`);

  // Clone MCP repos
  if (config.mcpRepos && config.mcpRepos.length > 0) {
    const mcpSpinner = startSpinner(`Syncing ${config.mcpRepos.length} MCP repos...`);
    for (const mcpRepo of config.mcpRepos) {
      const mcpDir = path.join(scopePaths.mcpRepoDir, mcpRepo.dirName);
      await ensureRepo({
        url: mcpRepo.url,
        dir: mcpDir
      });

      // Build MCP if build commands are specified
      if (mcpRepo.buildCommands) {
        mcpSpinner.text = `Building ${mcpRepo.dirName}...`;
        await buildMcp({
          dir: mcpDir,
          buildCommands: mcpRepo.buildCommands
        });
      }
    }
    mcpSpinner.succeed(`MCP repos synced to ${formatPath(scopePaths.mcpRepoDir)}`);
  }

  // Create README in the main .a11y-skills directory
  await createReadme(scopePaths.repoDir);

  if (installSkills) {
    const skillsSpinner = startSpinner("Installing skills to IDE folders...");
    const sourceDir = await findSkillsDir(scopePaths.skillsRepoDir, config.skillsSearchPaths);
    if (!sourceDir) {
      skillsSpinner.fail("No skills directory found in repo.");
    } else {
      const skillTargets = scope === "local"
        ? ideSelection.map((ide) => idePaths[ide].localSkillsDir)
        : ideSelection.map((ide) => idePaths[ide].skillsDir);

      for (const target of skillTargets) {
        await copySkills(sourceDir, target);
      }

      skillsSpinner.succeed(`Skills installed to ${skillTargets.length} IDE location(s).`);
    }
  } else {
    warn("Skipping skills install to IDE folders.");
  }

  const serverDefs = resolveServers(config.mcpServers, scopePaths.repoDir, scopePaths.mcpRepoDir);
  const mcpSpinner = startSpinner("Updating MCP configurations...");
  for (const ide of ideSelection) {
    await installMcpConfig(idePaths[ide].mcpConfig, serverDefs, idePaths[ide].mcpServerKey);
  }
  mcpSpinner.succeed(`MCP configs updated for ${ideSelection.length} IDE(s).`);

  success("All done. Your skills and MCP servers are ready.");
  info("You can re-run this CLI any time to update the repo and configs.");
}

export {
  run
};