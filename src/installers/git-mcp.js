/**
 * Git repository operations and MCP installation orchestration
 */

import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import prompts from "prompts";
import { warn, error as errorMsg } from "../ui.js";

/**
 * Helper function to check if a path exists
 * @param {string} target - Path to check
 * @returns {Promise<boolean>}
 */
async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs a command using spawn
 * @param {string} command - Command to run
 * @param {string[]} args - Command arguments
 * @param {object} options - Spawn options
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
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

/**
 * Clones a Git repository to the target directory
 * @param {string} repoUrl - Git repository URL
 * @param {string} targetDir - Directory to clone into
 * @returns {Promise<{success: boolean, stdout: string, stderr: string}>}
 */
export async function cloneGitRepo(repoUrl, targetDir) {
  try {
    const result = await run("git", ["clone", repoUrl, targetDir]);
    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    // Provide helpful error messages based on error type
    const errorMessage = err.message.toLowerCase();

    if (errorMessage.includes("authentication") || errorMessage.includes("fatal: could not read")) {
      throw new Error(
        `Authentication required for ${repoUrl}. Please ensure the repository is public or configure Git credentials.`,
      );
    }

    if (errorMessage.includes("repository not found") || errorMessage.includes("not found")) {
      throw new Error(
        `Repository not found: ${repoUrl}. Please verify the URL is correct.`,
      );
    }

    if (errorMessage.includes("git: command not found") || errorMessage.includes("'git' is not recognized")) {
      throw new Error(
        "Git is not installed. Please install Git and try again.",
      );
    }

    // Generic error
    throw new Error(`Failed to clone repository: ${err.message}`);
  }
}

/**
 * Executes build command in the repository directory
 * @param {string} repoDir - Repository directory path
 * @param {string} buildCommand - Build command to execute
 * @returns {Promise<{success: boolean, stdout: string, stderr: string}>}
 */
export async function buildGitRepo(repoDir, buildCommand) {
  try {
    // Parse build command (handle multi-command strings like "npm install && npm run build")
    // We'll execute the entire command string via shell
    const result = await run(buildCommand, [], { cwd: repoDir });
    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    return {
      success: false,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message,
    };
  }
}

/**
 * Removes a cloned repository directory
 * @param {string} repoPath - Path to repository to remove
 * @returns {Promise<void>}
 */
export async function cleanupGitRepo(repoPath) {
  if (await pathExists(repoPath)) {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
}

/**
 * Main orchestrator function for Git MCP installation
 * @param {object} mcpConfig - MCP configuration {name, repoUrl, type, command, args, buildCommand}
 * @param {string} repoScope - Where to clone repo ('local' | 'global')
 * @param {string} projectRoot - Project root directory
 * @param {object} platformInfo - Platform info object
 * @param {Function} getMcpRepoDir - Function to get MCP repo directory
 * @returns {Promise<{name: string, type: string, command: string, args: string[], repoPath: string}>}
 */
export async function installGitMcp(
  mcpConfig,
  repoScope,
  projectRoot,
  platformInfo,
  getMcpRepoDir,
) {
  const { name, repoUrl, type, command, args, buildCommand } = mcpConfig;

  // Determine repo storage location
  const repoPath = getMcpRepoDir(repoScope, projectRoot, platformInfo, name);

  // Check for existing MCP with same name
  if (await pathExists(repoPath)) {
    warn(`MCP server '${name}' already exists at ${repoPath}`);

    const overwriteResponse = await prompts(
      {
        type: "confirm",
        name: "overwrite",
        message: "Overwrite existing installation?",
        initial: false,
      },
      {
        onCancel: () => {
          throw new Error("Installation cancelled by user");
        },
      },
    );

    if (!overwriteResponse.overwrite) {
      throw new Error("Installation cancelled - existing MCP not overwritten");
    }

    // Remove old directory
    await cleanupGitRepo(repoPath);
  }

  // Clone repository
  await cloneGitRepo(repoUrl, repoPath);

  // Run build command (continue with warning if fails)
  const buildResult = await buildGitRepo(repoPath, buildCommand);
  if (!buildResult.success) {
    warn("Build command failed but continuing with installation");
    if (buildResult.stderr) {
      console.error("Build error output:");
      console.error(buildResult.stderr);
    }
  }

  // Return MCP server object for config installation
  return {
    name,
    type,
    command,
    args,
    repoPath,
  };
}
