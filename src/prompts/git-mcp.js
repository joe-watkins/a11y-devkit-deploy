/**
 * Git MCP-specific prompt definitions and validation logic
 */

/**
 * Validates MCP name according to rules:
 * - Not empty
 * - No spaces
 * - Only alphanumeric characters and hyphens
 * @param {string} name - MCP name to validate
 * @returns {true | string} - true if valid, error message if invalid
 */
export function validateMcpName(name) {
  if (!name || name.trim() === "") {
    return "MCP name is required";
  }

  if (name.includes(" ")) {
    return "MCP name cannot contain spaces";
  }

  const validPattern = /^[a-z0-9-]+$/i;
  if (!validPattern.test(name)) {
    return "MCP name can only contain letters, numbers, and hyphens";
  }

  return true;
}

/**
 * Validates Git URL format (GitHub or GitLab)
 * @param {string} url - Git repository URL to validate
 * @returns {{ valid: boolean, provider: 'github'|'gitlab'|null, error: string|null }}
 */
export function validateGitUrl(url) {
  if (!url || url.trim() === "") {
    return {
      valid: false,
      provider: null,
      error: "Git repository URL is required",
    };
  }

  const gitUrlPattern =
    /^https:\/\/(github\.com|gitlab\.com)\/[\w-]+\/[\w-]+(\.git)?$/;
  const match = url.match(gitUrlPattern);

  if (!match) {
    if (url.includes("github.com") || url.includes("gitlab.com")) {
      return {
        valid: false,
        provider: null,
        error:
          "Invalid Git URL format. Must be: https://github.com/user/repo.git or https://gitlab.com/user/repo.git",
      };
    }
    return {
      valid: false,
      provider: null,
      error: "Only GitHub and GitLab repositories are supported",
    };
  }

  const provider = match[1].includes("github") ? "github" : "gitlab";

  return {
    valid: true,
    provider,
    error: null,
  };
}

/**
 * Parses comma-separated arguments string into array
 * @param {string} argsString - Comma-separated arguments
 * @returns {string[]} - Array of trimmed argument strings
 */
export function parseArgsString(argsString) {
  if (!argsString || argsString.trim() === "") {
    return [];
  }

  return argsString
    .split(",")
    .map((arg) => arg.trim())
    .filter((arg) => arg !== "");
}

/**
 * Returns prompts array for Git MCP configuration
 * @returns {Array} - Array of prompt objects for use with prompts library
 */
export function getGitMcpPrompts() {
  return [
    {
      type: "text",
      name: "name",
      message: "MCP Name (no spaces, alphanumeric with hyphens):",
      validate: (value) => validateMcpName(value),
    },
    {
      type: "text",
      name: "repoUrl",
      message: "Git Repository URL (GitHub or GitLab):",
      validate: (value) => {
        const result = validateGitUrl(value);
        return result.valid ? true : result.error;
      },
    },
    {
      type: "select",
      name: "type",
      message: "MCP server transport type:",
      choices: [
        { title: "stdio", value: "stdio" },
        { title: "http", value: "http" },
        { title: "sse", value: "sse" },
      ],
      initial: 0,
    },
    {
      type: "text",
      name: "command",
      message: "Command to run the MCP server:",
      initial: "node",
    },
    {
      type: "text",
      name: "args",
      message: "Arguments for the command (comma-separated, optional):",
      initial: "",
    },
    {
      type: "text",
      name: "buildCommand",
      message: "Build command:",
      initial: "npm install",
    },
  ];
}
