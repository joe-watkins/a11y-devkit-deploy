import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Override kleur's gray color to add italics for better readability
import kleur from "kleur";

// Use gray with italics (ANSI 90 for gray, 3 for italic, 23 to reset italic)
// This matches the subtitle color but with italic styling
const grayItalic = (text) => {
  if (typeof text === "string") {
    return `\x1b[3m\x1b[90m${text}\x1b[39m\x1b[23m`;
  }
  // Return a function that applies both italic and gray
  return (str) => `\x1b[3m\x1b[90m${str}\x1b[39m\x1b[23m`;
};

// Replace gray with italic gray for helper text
Object.defineProperty(kleur, "gray", {
  get() {
    return grayItalic;
  },
  configurable: true,
});

import prompts from "prompts";

import { header, info, warn, success, startSpinner, formatPath } from "./ui.js";
import {
  getPlatform,
  getHostApplicationPaths,
  getTempDir,
  getMcpRepoDir,
} from "./paths.js";
import {
  installSkillsFromNpm,
  uninstallSkillsFromTargets,
  cleanupTemp,
} from "./installers/skills.js";
import { installMcpConfig, removeMcpConfig } from "./installers/mcp.js";
import { getGitMcpPrompts, parseArgsString } from "./prompts/git-mcp.js";
import { installGitMcp } from "./installers/git-mcp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig() {
  const configPath = path.join(__dirname, "..", "config", "settings.json");
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
    uninstall: args.has("--uninstall"),
  };
}

function formatOs(platformInfo) {
  if (platformInfo.isWindows) return "Windows";
  if (platformInfo.isMac) return "macOS";
  if (platformInfo.isLinux) return "Linux";
  return platformInfo.platform;
}

async function run() {
  // Clear console for a cleaner start
  console.clear();

  const projectRoot = process.cwd();
  const platformInfo = getPlatform();
  const config = await loadConfig();
  const pkg = await loadPackageJson();
  const hostPaths = getHostApplicationPaths(
    projectRoot,
    platformInfo,
    config.hostApplications,
  );
  const args = parseArgs(process.argv);

  header(
    `A11y Devkit Deploy v${pkg.version}`,
    args.gitMcp
      ? "Install MCP server from Git repository"
      : args.uninstall
        ? "Uninstall skills + MCP servers installed by this tool"
        : "Install skills + MCP servers across host applications",
  );
  info(`Detected OS: ${formatOs(platformInfo)}`);

  if (args.uninstall && args.gitMcp) {
    warn("--uninstall cannot be used with --git-mcp.");
    process.exit(1);
  }

  if (args.uninstall) {
    await runUninstall(projectRoot, platformInfo, config, hostPaths, args);
    return;
  }

  // Branch to Git MCP installation flow
  if (args.gitMcp) {
    await runGitMcpInstallation(
      projectRoot,
      platformInfo,
      config,
      hostPaths,
      args,
    );
    return;
  }

  // Prompt for profile selection
  let selectedProfile = null;
  let skillsToInstall = [];
  let mcpServersToInstall = [];
  let profileConfirmed = false;

  while (!profileConfirmed) {
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

      selectedProfile = config.profiles.find(
        (p) => p.id === profileResponse.profile,
      );

      if (selectedProfile) {
        // Filter skills based on profile
        skillsToInstall = config.skills.filter((skill) => {
          const skillNpmName =
            typeof skill === "string" ? skill : skill.npmName;
          return selectedProfile.skills.includes(skillNpmName);
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
      profileConfirmed = true; // Skip confirmation for auto-yes
    }

    // Show what will be installed
    if (!args.autoYes) {
      console.log("\nSkills to install:");
      skillsToInstall.forEach((skill) => {
        const name = typeof skill === "string" ? skill : skill.name;
        const description =
          typeof skill === "string"
            ? "No description"
            : skill.description || "No description";
        console.log(`  • ${name}`);
        console.log(`    ${description}`);
      });

      console.log("\nMCP Servers to install: [will install globally]");
      mcpServersToInstall.forEach((server) => {
        const description = server.description || "No description";
        console.log(`  • ${server.name}`);
        console.log(`    ${description}`);
      });
      console.log("");

      // Confirmation prompt
      const confirmResponse = await prompts(
        {
          type: "confirm",
          name: "continue",
          message: "Continue with this configuration?",
          initial: true,
        },
        {
          onCancel: () => {
            warn("Setup cancelled.");
            process.exit(0);
          },
        },
      );

      if (confirmResponse.continue) {
        profileConfirmed = true;
      } else {
        // User wants to go back - loop will restart profile selection
        console.log("");
      }
    }
  }

  const hostChoices = config.hostApplications.map((host) => ({
    title: host.displayName,
    value: host.id,
  }));

  let scope = args.scope;
  let mcpScope = null;
  let hostSelection = config.hostApplications.map((host) => host.id);

  if (!args.autoYes) {
    const response = await prompts(
      [
        {
          type: scope ? null : "select",
          name: "scope",
          message: "Install skills locally or globally?",
          choices: [
            {
              title: `Local to this project (${formatPath(projectRoot)}) [recommended]`,
              value: "local",
            },
            { title: "Global for this user", value: "global" },
          ],
          initial: 0,
        },
        {
          type: config.supportLocalMcpInstallation ? "select" : null,
          name: "mcpScope",
          message: "Install MCP configs locally or globally?",
          choices: [
            {
              title: `Local to this project (${formatPath(projectRoot)})`,
              value: "local",
              description:
                "Write to project-level host application config folders (version-controllable)",
            },
            {
              title: "Global for this user",
              value: "global",
              description:
                "Write to user-level host application config folders",
            },
          ],
          initial: 0,
        },
        {
          type: "multiselect",
          name: "hosts",
          message: "Configure for which host applications?",
          choices: hostChoices,
          initial: hostChoices.map((_, index) => index),
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
    mcpScope =
      response.mcpScope ||
      (config.supportLocalMcpInstallation ? "local" : "global");
    hostSelection = response.hosts || hostSelection;
  }

  if (!scope) {
    scope = "local";
  }
  if (!mcpScope) {
    mcpScope = config.supportLocalMcpInstallation ? "local" : "global";
  }

  if (!hostSelection.length) {
    warn(
      "No host applications selected. MCP installation requires at least one host application.",
    );
    process.exit(1);
  }

  info(`Skills scope: ${scope === "local" ? "Local" : "Global"}`);
  info(`MCP scope: ${mcpScope === "local" ? "Local" : "Global"}`);

  // Create temp directory for npm install
  const tempDir = path.join(getTempDir(), `.a11y-devkit-${Date.now()}`);

  const skillsSpinner = startSpinner("Installing skills from npm...");

  try {
    const skillTargets =
      scope === "local"
        ? hostSelection.map((host) => hostPaths[host].localSkillsDir)
        : hostSelection.map((host) => hostPaths[host].skillsDir);

    const skillNames = skillsToInstall.map((skill) =>
      typeof skill === "string" ? skill : skill.npmName,
    );
    const result = await installSkillsFromNpm(
      skillNames,
      skillTargets,
      tempDir,
      config.skillsFolder,
      config.readmeTemplate,
    );
    skillsSpinner.succeed(
      `${result.installed} skills installed to ${skillTargets.length} host application location(s).`,
    );
  } catch (error) {
    skillsSpinner.fail(`Failed to install skills: ${error.message}`);
  }

  // Configure MCP servers using npx (no local installation needed!)
  const mcpSpinner = startSpinner("Updating MCP configurations...");
  const mcpConfigPaths =
    mcpScope === "local"
      ? hostSelection.map((host) => hostPaths[host].localMcpConfig)
      : hostSelection.map((host) => hostPaths[host].mcpConfig);

  for (let i = 0; i < hostSelection.length; i++) {
    const host = hostSelection[i];
    const serverKey = mcpScope === "global"
      ? hostPaths[host].globalMcpServerKey
      : hostPaths[host].mcpServerKey;
    await installMcpConfig(
      mcpConfigPaths[i],
      mcpServersToInstall,
      serverKey,
      platformInfo,
    );
  }
  mcpSpinner.succeed(
    `MCP configs updated for ${hostSelection.length} host application(s) (${mcpScope} scope).`,
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
      ? `.claude/skills/${skillsFolderPath}README.md (or your host application's equivalent)`
      : `~/.claude/skills/${skillsFolderPath}README.md (or your host application's global skills directory)`;
  info(`📖 Check ${skillsPath} for comprehensive usage guide`);
  info("✨ Includes 70+ example prompts for all skills and MCP servers");
  info(
    "🚀 Start with the 'Getting Started' section for your first accessibility check",
  );
  console.log("");
  info("You can re-run this CLI any time to update skills and configs.");
  info("Documentation: https://github.com/joe-watkins/a11y-devkit#readme");
}

async function runUninstall(
  projectRoot,
  platformInfo,
  config,
  hostPaths,
  args,
) {
  console.log("\n");
  info("Removing skills and MCP servers installed by this tool");
  console.log("");

  let removeSkills = true;
  let removeMcp = true;
  let scope = args.scope;
  let mcpScope = null;
  let hostSelection = config.hostApplications.map((host) => host.id);

  if (!args.autoYes) {
    const removeResponse = await prompts(
      {
        type: "multiselect",
        name: "targets",
        message: "Remove which items?",
        choices: [
          { title: "Skills", value: "skills" },
          { title: "MCP servers", value: "mcp" },
        ],
        initial: [0, 1],
      },
      {
        onCancel: () => {
          warn("Uninstall cancelled.");
          process.exit(0);
        },
      },
    );

    const selectedTargets = removeResponse.targets || [];
    removeSkills = selectedTargets.includes("skills");
    removeMcp = selectedTargets.includes("mcp");

    if (!removeSkills && !removeMcp) {
      warn("No items selected to uninstall.");
      process.exit(0);
    }
  }

  if (!args.autoYes) {
    const hostChoices = config.hostApplications.map((host) => ({
      title: host.displayName,
      value: host.id,
    }));

    const questions = [];

    if (removeSkills && !scope) {
      questions.push({
        type: "select",
        name: "scope",
        message: "Remove skills locally or globally?",
        choices: [
          {
            title: `Local to this project (${formatPath(projectRoot)}) [recommended]`,
            value: "local",
          },
          { title: "Global for this user", value: "global" },
        ],
        initial: 0,
      });
    }

    if (removeMcp && config.supportLocalMcpInstallation) {
      questions.push({
        type: "select",
        name: "mcpScope",
        message: "Remove MCP configs locally or globally?",
        choices: [
          {
            title: `Local to this project (${formatPath(projectRoot)})`,
            value: "local",
            description:
              "Remove from project-level host application config folders (version-controllable)",
          },
          {
            title: "Global for this user",
            value: "global",
            description:
              "Remove from user-level host application config folders",
          },
        ],
        initial: 0,
      });
    }

    questions.push({
      type: "multiselect",
      name: "hosts",
      message: "Remove from which host applications?",
      choices: hostChoices,
      initial: hostChoices.map((_, index) => index),
    });

    const response = await prompts(questions, {
      onCancel: () => {
        warn("Uninstall cancelled.");
        process.exit(0);
      },
    });

    scope = scope || response.scope;
    mcpScope = response.mcpScope || mcpScope;
    hostSelection = response.hosts || hostSelection;
  }

  if (removeSkills && !scope) {
    scope = "local";
  }

  if (removeMcp && !mcpScope) {
    mcpScope = config.supportLocalMcpInstallation ? "local" : "global";
  }

  if (!hostSelection.length) {
    warn(
      "No host applications selected. Uninstall requires at least one host application.",
    );
    process.exit(1);
  }

  if (removeSkills) {
    info(`Skills scope: ${scope === "local" ? "Local" : "Global"}`);
  }
  if (removeMcp) {
    info(`MCP scope: ${mcpScope === "local" ? "Local" : "Global"}`);
  }

  if (removeSkills) {
    const skillsSpinner = startSpinner("Removing skills...");
    try {
      const skillTargets =
        scope === "local"
          ? hostSelection.map((host) => hostPaths[host].localSkillsDir)
          : hostSelection.map((host) => hostPaths[host].skillsDir);

      const skillNames = config.skills.map((skill) =>
        typeof skill === "string" ? skill : skill.npmName,
      );

      const result = await uninstallSkillsFromTargets(
        skillNames,
        skillTargets,
        config.skillsFolder,
        config.readmeTemplate,
      );
      skillsSpinner.succeed(
        `Removed ${result.removed} skill folder(s) from ${skillTargets.length} host application location(s).`,
      );
    } catch (error) {
      skillsSpinner.fail(`Failed to remove skills: ${error.message}`);
    }
  }

  if (removeMcp) {
    const mcpSpinner = startSpinner("Removing MCP configurations...");
    const mcpConfigPaths =
      mcpScope === "local"
        ? hostSelection.map((host) => hostPaths[host].localMcpConfig)
        : hostSelection.map((host) => hostPaths[host].mcpConfig);

    let removedCount = 0;
    const serverNames = config.mcpServers.map((server) => server.name);

    for (let i = 0; i < hostSelection.length; i++) {
      const host = hostSelection[i];
      const serverKey = mcpScope === "global"
        ? hostPaths[host].globalMcpServerKey
        : hostPaths[host].mcpServerKey;
      const result = await removeMcpConfig(
        mcpConfigPaths[i],
        serverNames,
        serverKey,
      );
      removedCount += result.removed;
    }

    if (removedCount > 0) {
      mcpSpinner.succeed(
        `Removed ${removedCount} MCP entries from ${hostSelection.length} host application(s) (${mcpScope} scope).`,
      );
    } else {
      mcpSpinner.succeed("No matching MCP entries found to remove.");
    }
  }

  success("Uninstall complete.");
}

async function runGitMcpInstallation(
  projectRoot,
  platformInfo,
  config,
  hostPaths,
  args,
) {
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
  // Skip if local MCP installation is not supported
  let mcpScopeResponse = {
    mcpScope: config.supportLocalMcpInstallation ? null : "global",
  };

  if (config.supportLocalMcpInstallation) {
    mcpScopeResponse = await prompts(
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
  }

  // Prompt for host application selection
  const hostChoices = config.hostApplications.map((host) => ({
    title: host.displayName,
    value: host.id,
  }));

  const hostResponse = await prompts(
    {
      type: "multiselect",
      name: "hosts",
      message: "Configure MCP for which host applications?",
      choices: hostChoices,
      initial: hostChoices.map((_, index) => index),
    },
    {
      onCancel: () => {
        warn("Git MCP installation cancelled.");
        process.exit(0);
      },
    },
  );

  const hostSelection = hostResponse.hosts || [];

  if (!hostSelection.length) {
    warn(
      "No host applications selected. MCP installation requires at least one host application.",
    );
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

  // Install MCP configurations to selected host applications
  const mcpConfigSpinner = startSpinner("Updating MCP configurations...");

  const mcpConfigPaths =
    mcpScope === "local"
      ? hostSelection.map((host) => hostPaths[host].localMcpConfig)
      : hostSelection.map((host) => hostPaths[host].mcpConfig);

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

  for (let i = 0; i < hostSelection.length; i++) {
    const host = hostSelection[i];
    const serverKey = mcpScope === "global"
      ? hostPaths[host].globalMcpServerKey
      : hostPaths[host].mcpServerKey;
    await installMcpConfig(
      mcpConfigPaths[i],
      [mcpServerConfig],
      serverKey,
      platformInfo,
    );
  }

  mcpConfigSpinner.succeed(
    `MCP configs updated for ${hostSelection.length} host application(s) (${mcpScope} scope).`,
  );

  // Display success message
  success("Git MCP installation complete!");
  info(`Repository location: ${mcpServer.repoPath}`);
  info(
    `MCP server '${mcpServer.name}' configured in ${hostSelection.length} host application(s)`,
  );
  console.log("");
  success("Next Steps:");
  info("Restart your host application to load the new MCP server");
  info(`Repository cloned to: ${mcpServer.repoPath}`);
  info("You can manually edit the MCP configuration files if needed");
}

export { run };
