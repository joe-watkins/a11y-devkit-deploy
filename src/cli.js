import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prompts from "prompts";

import { header, info, warn, success, startSpinner, formatPath } from "./ui.js";
import { getPlatform, getIdePaths, getTempDir } from "./paths.js";
import { installSkillsFromNpm, cleanupTemp } from "./installers/skills.js";
import { installMcpConfig } from "./installers/mcp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig() {
  const configPath = path.join(__dirname, "..", "config", "a11y.json");
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

async function loadPackageJson() {
  const pkgPath = path.join(__dirname, "..", "package.json");
  const raw = await fs.readFile(pkgPath, "utf8");
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    autoYes: args.has("--yes") || args.has("-y"),
    scope: args.has("--global")
      ? "global"
      : args.has("--local")
        ? "local"
        : null,
  };
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
  const pkg = await loadPackageJson();
  const idePaths = getIdePaths(projectRoot, platformInfo, config.ides);
  const args = parseArgs(process.argv);

  header(
    `A11y Devkit Deploy v${pkg.version}`,
    "Install skills + MCP servers across IDEs",
  );
  info(`Detected OS: ${formatOs(platformInfo)}`);

  console.log("\nSkills to install:");
  config.skills.forEach((skill) => {
    const name = typeof skill === "string" ? skill : skill.name;
    const description =
      typeof skill === "string"
        ? "No description"
        : skill.description || "No description";
    console.log(`- ${name}: ${description}`);
  });

  console.log("\nMCP Servers to install:");
  config.mcpServers.forEach((server) => {
    const description = server.description || "No description";
    console.log(`${server.name} - ${description}`);
  });
  console.log("");

  const ideChoices = config.ides.map((ide) => ({
    title: ide.displayName,
    value: ide.id,
  }));

  let scope = args.scope;
  let mcpScope = null;
  let ideSelection = config.ides.map((ide) => ide.id);
  let installSkills = true;

  if (!args.autoYes) {
    const response = await prompts(
      [
        {
          type: scope ? null : "select",
          name: "scope",
          message: "Install skills + repo locally or globally?",
          choices: [
            {
              title: `Local to this project (${formatPath(projectRoot)})`,
              value: "local",
            },
            { title: "Global for this user", value: "global" },
          ],
          initial: 0,
        },
        {
          type: "select",
          name: "mcpScope",
          message: "Install MCP configs locally or globally?",
          choices: [
            {
              title: `Local to this project (${formatPath(projectRoot)})`,
              value: "local",
              description:
                "Write to project-level IDE config folders (version-controllable)",
            },
            {
              title: "Global for this user",
              value: "global",
              description: "Write to user-level IDE config folders",
            },
          ],
          initial: 0,
        },
        {
          type: "multiselect",
          name: "ides",
          message: "Configure MCP for which IDEs?",
          choices: ideChoices,
          initial: ideChoices.map((_, index) => index),
        },
        {
          type: "toggle",
          name: "installSkills",
          message: "Install skills into IDE skills folders?",
          active: "yes",
          inactive: "no",
          initial: true,
        },
      ],
      {
        onCancel: () => {
          warn("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    scope = scope || response.scope;
    mcpScope = response.mcpScope || "local";
    ideSelection = response.ides || ideSelection;
    installSkills = response.installSkills;
  }

  if (!scope) {
    scope = "local";
  }
  if (!mcpScope) {
    mcpScope = "local";
  }

  if (!ideSelection.length) {
    warn("No IDEs selected. MCP installation requires at least one IDE.");
    process.exit(1);
  }

  info(`Skills scope: ${scope === "local" ? "Local" : "Global"}`);
  info(`MCP scope: ${mcpScope === "local" ? "Local" : "Global"}`);

  // Create temp directory for npm install
  const tempDir = path.join(getTempDir(), `.a11y-devkit-${Date.now()}`);

  if (installSkills) {
    const skillsSpinner = startSpinner("Installing skills from npm...");

    try {
      const skillTargets =
        scope === "local"
          ? ideSelection.map((ide) => idePaths[ide].localSkillsDir)
          : ideSelection.map((ide) => idePaths[ide].skillsDir);

      const skillNames = config.skills.map((skill) =>
        typeof skill === "string" ? skill : skill.name,
      );
      const result = await installSkillsFromNpm(
        skillNames,
        skillTargets,
        tempDir,
        config.skillsFolder,
        config.readmeTemplate,
      );
      skillsSpinner.succeed(
        `${result.installed} skills installed to ${skillTargets.length} IDE location(s).`,
      );
    } catch (error) {
      skillsSpinner.fail(`Failed to install skills: ${error.message}`);
    }
  } else {
    warn("Skipping skills install to IDE folders.");
  }

  // Configure MCP servers using npx (no local installation needed!)
  const mcpSpinner = startSpinner("Updating MCP configurations...");
  const mcpConfigPaths =
    mcpScope === "local"
      ? ideSelection.map((ide) => idePaths[ide].localMcpConfig)
      : ideSelection.map((ide) => idePaths[ide].mcpConfig);

  for (let i = 0; i < ideSelection.length; i++) {
    const ide = ideSelection[i];
    await installMcpConfig(
      mcpConfigPaths[i],
      config.mcpServers,
      idePaths[ide].mcpServerKey,
    );
  }
  mcpSpinner.succeed(
    `MCP configs updated for ${ideSelection.length} IDE(s) (${mcpScope} scope).`,
  );

  // Clean up temporary directory
  const cleanupSpinner = startSpinner("Cleaning up temporary files...");
  await cleanupTemp(tempDir);
  cleanupSpinner.succeed("Temporary files removed");

  success("All done. Your skills and MCP servers are ready.");
  info("Skills installed from npm packages.");
  info("MCP servers use npx - no local installation needed!");
  console.log("");
  success("Next Steps:");
  const skillsFolderPath = config.skillsFolder ? `${config.skillsFolder}/` : "";
  const skillsPath =
    scope === "local"
      ? `.claude/skills/${skillsFolderPath}README.md (or your IDE's equivalent)`
      : `~/.claude/skills/${skillsFolderPath}README.md (or your IDE's global skills directory)`;
  info(`📖 Check ${skillsPath} for comprehensive usage guide`);
  info("✨ Includes 70+ example prompts for all skills and MCP servers");
  info(
    "🚀 Start with the 'Getting Started' section for your first accessibility check",
  );
  console.log("");
  info("You can re-run this CLI any time to update skills and configs.");
  info("Documentation: https://github.com/joe-watkins/a11y-devkit#readme");
}

export { run };
