import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

async function ensureRepo({ url, dir }) {
  const hasDir = await pathExists(dir);
  const gitDir = path.join(dir, ".git");

  if (hasDir) {
    const isGitRepo = await pathExists(gitDir);
    if (!isGitRepo) {
      throw new Error(`Target exists but is not a git repo: ${dir}`);
    }

    await run("git", ["-C", dir, "pull", "--ff-only"]);
    return { action: "updated", dir };
  }

  await run("git", ["clone", "--depth", "1", url, dir]);
  return { action: "cloned", dir };
}

async function buildMcp({ dir, buildCommands }) {
  if (!buildCommands || buildCommands.length === 0) {
    return;
  }

  for (const command of buildCommands) {
    const parts = command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);
    await run(cmd, args, { cwd: dir, shell: true });
  }
}

async function createReadme(repoDir) {
  const readmePath = path.join(repoDir, "README.md");
  const content = `# A11y Skills & MCP Servers

This directory contains accessibility skills and MCP (Model Context Protocol) servers.

## Structure

- \`skills/\` - Accessibility skills for AI assistants
- \`mcp/\` - MCP server implementations for accessibility tools

## Management

This directory is managed by the \`a11y-skills-deploy\` CLI tool.
To update or reconfigure, run:

\`\`\`bash
npx a11y-skills-deploy
\`\`\`

## More Information

- [A11y Skills Repository](https://github.com/joe-watkins/a11y-skills)
- [WCAG MCP Server](https://github.com/joe-watkins/wcag-mcp)
- [ARIA MCP Server](https://github.com/joe-watkins/aria-mcp)
- [MagentaA11y MCP Server](https://github.com/joe-watkins/magentaa11y-mcp)
- [A11y Personas MCP Server](https://github.com/joe-watkins/a11y-personas-mcp)
- [A11y Issues Template MCP Server](https://github.com/joe-watkins/accessibility-issues-template-mcp)
`;

  await fs.writeFile(readmePath, content, "utf8");
}

export {
  ensureRepo,
  buildMcp,
  createReadme
};