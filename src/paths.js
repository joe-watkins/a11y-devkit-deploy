import os from "os";
import path from "path";

function getPlatform() {
  const platform = os.platform();
  return {
    platform,
    isWindows: platform === "win32",
    isMac: platform === "darwin",
    isLinux: platform === "linux"
  };
}

function getTempDir() {
  return os.tmpdir();
}

function getAppSupportDir(platformInfo = getPlatform()) {
  if (platformInfo.isWindows) {
    return (
      process.env.APPDATA ||
      path.join(os.homedir(), "AppData", "Roaming")
    );
  }

  if (platformInfo.isMac) {
    return path.join(os.homedir(), "Library", "Application Support");
  }

  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function getIdePaths(projectRoot, platformInfo = getPlatform(), ideConfigs = []) {
  const home = os.homedir();
  const appSupport = getAppSupportDir(platformInfo);
  const paths = {};

  for (const ide of ideConfigs) {
    // Default paths (used for local scope, and global scope if no overrides)
    let skillsFolder = ide.skillsFolder || `.${ide.id}/skills`;
    let mcpConfigFile = ide.mcpConfigFile || `.${ide.id}/mcp.json`;

    // Check for platform-specific global path overrides
    let globalSkillsFolder = skillsFolder;
    let globalMcpConfigFile = mcpConfigFile;

    if (ide.globalPaths) {
      const platformKey = platformInfo.isWindows ? 'Win' : platformInfo.isMac ? 'macOS' : null;

      if (platformKey && ide.globalPaths[platformKey]) {
        const globalOverrides = ide.globalPaths[platformKey];

        // Use app support directory + override path for global
        if (globalOverrides.skillsFolder) {
          globalSkillsFolder = globalOverrides.skillsFolder;
        }
        if (globalOverrides.mcpConfigFile) {
          globalMcpConfigFile = globalOverrides.mcpConfigFile;
        }
      }
    }

    // Determine base directory for global paths
    const useAppSupport = ide.globalPaths &&
      (platformInfo.isWindows || platformInfo.isMac);
    const globalBase = useAppSupport ? appSupport : home;

    paths[ide.id] = {
      name: ide.displayName,
      mcpConfig: path.join(globalBase, globalMcpConfigFile),
      localMcpConfig: path.join(projectRoot, mcpConfigFile),
      mcpServerKey: ide.mcpServerKey,
      skillsDir: path.join(globalBase, globalSkillsFolder),
      localSkillsDir: path.join(projectRoot, skillsFolder)
    };
  }

  return paths;
}

function getMcpRepoDir(scope, projectRoot, platformInfo, mcpName) {
  if (scope === 'local') {
    return path.join(projectRoot, '.a11y-devkit', 'mcp-repos', mcpName);
  }

  const appSupport = getAppSupportDir(platformInfo);
  return path.join(appSupport, 'a11y-devkit', 'mcp-repos', mcpName);
}

export {
  getPlatform,
  getAppSupportDir,
  getIdePaths,
  getTempDir,
  getMcpRepoDir
};