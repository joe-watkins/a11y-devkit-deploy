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

function mergeServers(existing, incoming, serverKey = "servers") {
  const existingServers = existing[serverKey] && typeof existing[serverKey] === "object"
    ? existing[serverKey]
    : {};

  const merged = { ...existing, [serverKey]: { ...existingServers } };

  for (const server of incoming) {
    const serverConfig = {
      command: server.command,
      args: server.args || []
    };

    // Include type if provided
    if (server.type) {
      serverConfig.type = server.type;
    }

    merged[serverKey][server.name] = serverConfig;
  }

  return merged;
}

async function installMcpConfig(configPath, servers, serverKey = "servers") {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const existing = await loadJson(configPath);
  const updated = mergeServers(existing, servers, serverKey);
  await fs.writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
}

export {
  installMcpConfig
};
