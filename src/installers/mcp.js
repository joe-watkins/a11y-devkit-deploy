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

function isTomlFile(filePath) {
  return filePath.endsWith('.toml');
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

// Simple TOML parser for MCP server configs
function parseSimpleToml(content) {
  const result = {};
  const lines = content.split('\n');
  let currentSection = null;
  let currentTable = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse table headers like [mcp_servers.name]
    const tableMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (tableMatch) {
      const parts = tableMatch[1].split('.');
      if (parts.length === 2) {
        const [section, table] = parts;
        if (!result[section]) result[section] = {};
        if (!result[section][table]) result[section][table] = {};
        currentSection = section;
        currentTable = table;
      }
      continue;
    }

    // Parse key-value pairs
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch && currentSection && currentTable) {
      const [, key, value] = kvMatch;

      // Parse arrays like ["a", "b"]
      if (value.startsWith('[')) {
        const arrayMatch = value.match(/\[(.*)\]/);
        if (arrayMatch) {
          const items = arrayMatch[1].split(',').map(item => {
            const trimmedItem = item.trim();
            // Remove quotes
            if (trimmedItem.startsWith('"') && trimmedItem.endsWith('"')) {
              return trimmedItem.slice(1, -1);
            }
            return trimmedItem;
          });
          result[currentSection][currentTable][key] = items;
        }
      }
      // Parse strings
      else if (value.startsWith('"') && value.endsWith('"')) {
        result[currentSection][currentTable][key] = value.slice(1, -1);
      }
      // Parse other values
      else {
        result[currentSection][currentTable][key] = value;
      }
    }
  }

  return result;
}

// Simple TOML stringifier for MCP server configs
function stringifySimpleToml(obj) {
  const lines = [];

  for (const [section, tables] of Object.entries(obj)) {
    if (typeof tables !== 'object' || tables === null) continue;

    for (const [tableName, config] of Object.entries(tables)) {
      if (typeof config !== 'object' || config === null) continue;

      // Write table header [section.tableName]
      lines.push(`[${section}.${tableName}]`);

      // Write key-value pairs
      for (const [key, value] of Object.entries(config)) {
        if (Array.isArray(value)) {
          // Format arrays
          const arrayStr = value.map(v => `"${v}"`).join(', ');
          lines.push(`${key} = [${arrayStr}]`);
        } else if (typeof value === 'string') {
          lines.push(`${key} = "${value}"`);
        } else {
          lines.push(`${key} = ${value}`);
        }
      }

      // Add blank line between tables
      lines.push('');
    }
  }

  return lines.join('\n');
}

async function loadToml(filePath) {
  if (!(await pathExists(filePath))) {
    return {};
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw.trim() ? parseSimpleToml(raw) : {};
  } catch (error) {
    const backupPath = `${filePath}.bak`;
    await fs.copyFile(filePath, backupPath);
    return {};
  }
}

async function loadConfig(filePath) {
  return isTomlFile(filePath) ? loadToml(filePath) : loadJson(filePath);
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

function removeServers(existing, removeNames, serverKey = "servers") {
  const existingServers = existing[serverKey] && typeof existing[serverKey] === "object"
    ? existing[serverKey]
    : null;

  if (!existingServers) {
    return { updated: existing, removed: 0 };
  }

  const updatedServers = { ...existingServers };
  let removed = 0;

  for (const name of removeNames) {
    if (Object.prototype.hasOwnProperty.call(updatedServers, name)) {
      delete updatedServers[name];
      removed++;
    }
  }

  if (removed === 0) {
    return { updated: existing, removed: 0 };
  }

  const updated = { ...existing };
  if (Object.keys(updatedServers).length === 0) {
    delete updated[serverKey];
  } else {
    updated[serverKey] = updatedServers;
  }

  return { updated, removed };
}

async function installMcpConfig(configPath, servers, serverKey = "servers") {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const existing = await loadConfig(configPath);
  const updated = mergeServers(existing, servers, serverKey);

  if (isTomlFile(configPath)) {
    await fs.writeFile(configPath, stringifySimpleToml(updated), "utf8");
  } else {
    await fs.writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  }
}

async function removeMcpConfig(configPath, serverNames, serverKey = "servers") {
  if (!(await pathExists(configPath))) {
    return { removed: 0, changed: false };
  }

  const existing = await loadConfig(configPath);
  const { updated, removed } = removeServers(existing, serverNames, serverKey);

  if (removed === 0) {
    return { removed: 0, changed: false };
  }

  if (isTomlFile(configPath)) {
    await fs.writeFile(configPath, stringifySimpleToml(updated), "utf8");
  } else {
    await fs.writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  }
  return { removed, changed: true };
}

export {
  installMcpConfig,
  removeMcpConfig
};
