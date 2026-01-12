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

function getIdePaths(projectRoot, platformInfo = getPlatform(), ideSkillsPaths = null) {
  const appSupport = getAppSupportDir(platformInfo);
  const home = os.homedir();

  // Default paths if not provided via config
  const skillsPaths = ideSkillsPaths || {
    claude: ".claude/skills",
    cursor: ".cursor/skills",
    codex: ".codex/skills",
    vscode: ".vscode/skills",
    local: ".github/skills"
  };

  return {
    claude: {
      name: "Claude Code",
      mcpConfig: path.join(appSupport, "Claude", "mcp.json"),
      mcpServerKey: "servers",
      skillsDir: path.join(home, skillsPaths.claude),
      localSkillsDir: path.join(projectRoot, skillsPaths.claude)
    },
    cursor: {
      name: "Cursor",
      mcpConfig: path.join(appSupport, "Cursor", "mcp.json"),
      mcpServerKey: "mcpServers",
      skillsDir: path.join(home, skillsPaths.cursor),
      localSkillsDir: path.join(projectRoot, skillsPaths.cursor)
    },
    codex: {
      name: "Codex",
      mcpConfig: path.join(home, ".codex", "mcp.json"),
      mcpServerKey: "servers",
      skillsDir: path.join(home, skillsPaths.codex),
      localSkillsDir: path.join(projectRoot, skillsPaths.codex)
    },
    vscode: {
      name: "VSCode",
      mcpConfig: path.join(appSupport, "Code", "User", "mcp.json"),
      mcpServerKey: "servers",
      skillsDir: path.join(home, skillsPaths.vscode),
      localSkillsDir: path.join(projectRoot, skillsPaths.vscode)
    },
    local: {
      name: "Local Project",
      skillsDir: path.join(projectRoot, skillsPaths.local),
      repoDir: path.join(projectRoot, ".a11y-skills"),
      mcpRepoDir: path.join(projectRoot, ".a11y-skills", "mcp"),
      skillsRepoDir: path.join(projectRoot, ".a11y-skills", "skills")
    },
    global: {
      name: "Global User",
      repoDir: path.join(home, ".a11y-skills"),
      mcpRepoDir: path.join(home, ".a11y-skills", "mcp"),
      skillsRepoDir: path.join(home, ".a11y-skills", "skills")
    }
  };
}

export {
  getPlatform,
  getAppSupportDir,
  getIdePaths
};