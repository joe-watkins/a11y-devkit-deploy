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

function getHostApplicationPaths(projectRoot, platformInfo = getPlatform(), hostConfigs = []) {
  const home = os.homedir();
  const appSupport = getAppSupportDir(platformInfo);
  const paths = {};

  for (const host of hostConfigs) {
    // Default paths for global scope (relative to home)
    const skillsFolder = host.skillsFolder || `.${host.id}/skills`;
    const mcpConfigFile = host.mcpConfigFile || `.${host.id}/mcp.json`;

    // MCP config: use AppData/Application Support for config files
    // appSupport resolves to:
    //   - Windows: %APPDATA% (e.g., C:\Users\name\AppData\Roaming)
    //   - macOS: ~/Library/Application Support
    //   - Linux: $XDG_CONFIG_HOME or ~/.config
    const mcpConfig = path.join(appSupport, mcpConfigFile);

    // Skills always use home directory
    const skillsDir = path.join(home, skillsFolder);

    paths[host.id] = {
      name: host.displayName,
      mcpConfig: mcpConfig,
      mcpServerKey: host.mcpServerKey,
      skillsDir: skillsDir,
      localSkillsDir: path.join(projectRoot, skillsFolder) // Still needed for skills scope
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
  getHostApplicationPaths,
  getTempDir,
  getMcpRepoDir
};
