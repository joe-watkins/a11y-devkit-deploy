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

export {
  ensureRepo
};