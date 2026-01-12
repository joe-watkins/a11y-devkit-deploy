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

async function loadJson(filePath) {
  if (!(await pathExists(filePath))) {
    return {};
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    const backupPath = `${filePath}.bak`;
    await fs.copyFile(filePath, backupPath);
    return {};
  }
}

function resolveServers(servers, repoDir, mcpRepoDir) {
  return servers.map((server) => {
    const args = Array.isArray(server.args) ? server.args : [];
    return {
      ...server,
      args: args.map((value) => 
        value.replace("{repoDir}", repoDir).replace("{mcpRepoDir}", mcpRepoDir)
      )
    };
  });
}

function mergeServers(existing, incoming) {
  const existingServers = existing.mcpServers && typeof existing.mcpServers === "object"
    ? existing.mcpServers
    : {};

  const merged = { ...existing, mcpServers: { ...existingServers } };

  for (const server of incoming) {
    merged.mcpServers[server.name] = {
      command: server.command,
      args: server.args || [],
      env: server.env || {},
      cwd: server.cwd
    };
  }

  return merged;
}

async function installMcpConfig(configPath, servers) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const existing = await loadJson(configPath);
  const updated = mergeServers(existing, servers);
  await fs.writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
}

export {
  resolveServers,
  installMcpConfig
};