import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prompts from "prompts";

import { header, info, warn, success, startSpinner, formatPath } from "./ui.js";
import { getPlatform, getIdePaths, getTempDir, getMcpRepoDir } from "./paths.js";
import { installSkillsFromNpm, cleanupTemp } from "./installers/skills.js";
import { installMcpConfig } from "./installers/mcp.js";
import { getGitMcpPrompts, parseArgsString } from "./prompts/git-mcp.js";
import { installGitMcp } from "./installers/git-mcp.js";

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
    gitMcp: args.has("--git-mcp"),
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
    args.gitMcp
      ? "Install MCP server from Git repository"
      : "Install skills + MCP servers across IDEs",
  );
  info(`Detected OS: ${formatOs(platformInfo)}`);

  // Branch to Git MCP installation flow
  if (args.gitMcp) {
    await runGitMcpInstallation(projectRoot, platformInfo, config, idePaths, args);
    return;
  }

  // Prompt for profile selection
  let selectedProfile = null;
  let skillsToInstall = [];
  let mcpServersToInstall = [];

  if (!args.autoYes && config.profiles) {
    const profileChoices = config.profiles.map((profile) => ({
      title: profile.displayName,
      description: profile.description,
      value: profile.id,
    }));

    const profileResponse = await prompts(
      {
        type: "select",
        name: "profile",
        message: "Select your profile:",
        choices: profileChoices,
      },
      {
        onCancel: () => {
          warn("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    selectedProfile = config.profiles.find((p) => p.id === profileResponse.profile);

    if (selectedProfile) {
      // Filter skills based on profile
      skillsToInstall = config.skills.filter((skill) => {
        const skillName = typeof skill === "string" ? skill : skill.name;
        return selectedProfile.skills.includes(skillName);
      });

      // Filter MCP servers based on profile
      mcpServersToInstall = config.mcpServers.filter((server) =>
        selectedProfile.mcpServers.includes(server.name),
      );

      console.log(`\n${selectedProfile.displayName} profile selected`);
    }
  } else {
    // If no profiles or auto-yes, use all skills and servers
    skillsToInstall = config.skills;
    mcpServersToInstall = config.mcpServers;
  }

  console.log("\nSkills to install:");
  skillsToInstall.forEach((skill) => {
    const name = typeof skill === "string" ? skill : skill.name;
    const description =
      typeof skill === "string"
        ? "No description"
        : skill.description || "No description";
    console.log(`- ${name}: ${description}`);
  });

  console.log("\nMCP Servers to install:");
  mcpServersToInstall.forEach((server) => {
    const description = server.description || "No description";
    console.log(`${server.name} - ${description}`);
  });
  console.log("");

  const ideChoices = config.ides.map((ide) => ({
    title: ide.displayName,
    value: ide.id,
  }));

  let scope = args.scope;
  let ideSelection = config.ides.map((ide) => ide.id);

  if (!args.autoYes) {
    const response = await prompts(
      [
        {
          type: scope ? null : "select",
          name: "scope",
          message: "Install skills + MCP configs locally or globally?",
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
          type: "multiselect",
          name: "ides",
          message: "Configure for which IDEs?",
          choices: ideChoices,
          initial: ideChoices.map((_, index) => index),
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
    ideSelection = response.ides || ideSelection;
  }

  if (!scope) {
    scope = "local";
  }

  if (!ideSelection.length) {
    warn("No IDEs selected. MCP installation requires at least one IDE.");
    process.exit(1);
  }

  info(`Installation scope: ${scope === "local" ? "Local" : "Global"}`);

  // Create temp directory for npm install
  const tempDir = path.join(getTempDir(), `.a11y-devkit-${Date.now()}`);

  const skillsSpinner = startSpinner("Installing skills from npm...");

  try {
    const skillTargets =
      scope === "local"
        ? ideSelection.map((ide) => idePaths[ide].localSkillsDir)
        : ideSelection.map((ide) => idePaths[ide].skillsDir);

    const skillNames = skillsToInstall.map((skill) =>
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

  // Configure MCP servers using npx (no local installation needed!)
  const mcpSpinner = startSpinner("Updating MCP configurations...");
  const mcpConfigPaths =
    scope === "local"
      ? ideSelection.map((ide) => idePaths[ide].localMcpConfig)
      : ideSelection.map((ide) => idePaths[ide].mcpConfig);

  for (let i = 0; i < ideSelection.length; i++) {
    const ide = ideSelection[i];
    await installMcpConfig(
      mcpConfigPaths[i],
      mcpServersToInstall,
      idePaths[ide].mcpServerKey,
    );
  }
  mcpSpinner.succeed(
    `MCP configs updated for ${ideSelection.length} IDE(s) (${scope} scope).`,
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

async function runGitMcpInstallation(projectRoot, platformInfo, config, idePaths, args) {
  // Check if --yes flag is used with --git-mcp
  if (args.autoYes) {
    warn("--yes flag not supported for Git MCP installation");
    info("Interactive prompts required for Git MCP configuration");
    process.exit(1);
  }

  console.log("\n");
  info("Installing MCP server from Git repository");
  console.log("");

  // Collect Git MCP information
  const gitMcpPrompts = getGitMcpPrompts();
  const mcpInfo = await prompts(gitMcpPrompts, {
    onCancel: () => {
      warn("Git MCP installation cancelled.");
      process.exit(0);
    },
  });

  // Parse args string into array
  const argsArray = parseArgsString(mcpInfo.args);

  // Prompt for Repo Clone Scope (where to clone the Git repository)
  const repoScopeResponse = await prompts(
    {
      type: "select",
      name: "repoScope",
      message: "Where to clone the Git repository?",
      choices: [
        {
          title: `Local to this project (${formatPath(projectRoot)})`,
          value: "local",
          description: "Clone to .a11y-devkit/mcp-repos/ in project",
        },
        {
          title: "Global for this user",
          value: "global",
          description: "Clone to user-level app support directory",
        },
      ],
      initial: 0,
    },
    {
      onCancel: () => {
        warn("Git MCP installation cancelled.");
        process.exit(0);
      },
    },
  );

  // Prompt for MCP Config Scope (where to write MCP configurations)
  const mcpScopeResponse = await prompts(
    {
      type: "select",
      name: "mcpScope",
      message: "Where to write MCP configurations?",
      choices: [
        {
          title: `Local to this project (${formatPath(projectRoot)})`,
          value: "local",
          description: "Write to project-level IDE config folders",
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
      onCancel: () => {
        warn("Git MCP installation cancelled.");
        process.exit(0);
      },
    },
  );

  // Prompt for IDE selection
  const ideChoices = config.ides.map((ide) => ({
    title: ide.displayName,
    value: ide.id,
  }));

  const ideResponse = await prompts(
    {
      type: "multiselect",
      name: "ides",
      message: "Configure MCP for which IDEs?",
      choices: ideChoices,
      initial: ideChoices.map((_, index) => index),
    },
    {
      onCancel: () => {
        warn("Git MCP installation cancelled.");
        process.exit(0);
      },
    },
  );

  const ideSelection = ideResponse.ides || [];

  if (!ideSelection.length) {
    warn("No IDEs selected. MCP installation requires at least one IDE.");
    process.exit(1);
  }

  const repoScope = repoScopeResponse.repoScope;
  const mcpScope = mcpScopeResponse.mcpScope;

  info(`Repository clone scope: ${repoScope === "local" ? "Local" : "Global"}`);
  info(`MCP config scope: ${mcpScope === "local" ? "Local" : "Global"}`);

  // Install Git MCP
  const gitSpinner = startSpinner("Cloning Git repository...");

  let mcpServer;
  try {
    mcpServer = await installGitMcp(
      {
        name: mcpInfo.name,
        repoUrl: mcpInfo.repoUrl,
        type: mcpInfo.type,
        command: mcpInfo.command,
        args: argsArray,
        buildCommand: mcpInfo.buildCommand,
      },
      repoScope,
      projectRoot,
      platformInfo,
      getMcpRepoDir,
    );
    gitSpinner.succeed(`Repository cloned to ${mcpServer.repoPath}`);
  } catch (error) {
    gitSpinner.fail(`Failed to install Git MCP: ${error.message}`);
    process.exit(1);
  }

  // Install MCP configurations to selected IDEs
  const mcpConfigSpinner = startSpinner("Updating MCP configurations...");

  const mcpConfigPaths =
    mcpScope === "local"
      ? ideSelection.map((ide) => idePaths[ide].localMcpConfig)
      : ideSelection.map((ide) => idePaths[ide].mcpConfig);

  // Construct the MCP server configuration with absolute path
  const mcpServerConfig = {
    name: mcpServer.name,
    type: mcpServer.type,
    command: mcpServer.command,
    args: mcpServer.args.length > 0 ? mcpServer.args : undefined,
  };

  // If args are provided, prepend the repo path to the first argument
  // Otherwise, use the repo path as the only argument
  if (mcpServerConfig.args && mcpServerConfig.args.length > 0) {
    // Assume first arg is a relative path within the repo
    mcpServerConfig.args = [
      path.join(mcpServer.repoPath, mcpServerConfig.args[0]),
      ...mcpServerConfig.args.slice(1),
    ];
  } else {
    // No args provided - this might need to be handled differently
    // For now, don't add any args
    delete mcpServerConfig.args;
  }

  for (let i = 0; i < ideSelection.length; i++) {
    const ide = ideSelection[i];
    await installMcpConfig(
      mcpConfigPaths[i],
      [mcpServerConfig],
      idePaths[ide].mcpServerKey,
    );
  }

  mcpConfigSpinner.succeed(
    `MCP configs updated for ${ideSelection.length} IDE(s) (${mcpScope} scope).`,
  );

  // Display success message
  success("Git MCP installation complete!");
  info(`Repository location: ${mcpServer.repoPath}`);
  info(`MCP server '${mcpServer.name}' configured in ${ideSelection.length} IDE(s)`);
  console.log("");
  success("Next Steps:");
  info("Restart your IDE to load the new MCP server");
  info(`Repository cloned to: ${mcpServer.repoPath}`);
  info("You can manually edit the MCP configuration files if needed");
}

export { run };
