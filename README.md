# A11y Skills Deploy

A cross-platform CLI for deploying accessibility skills and MCP servers across Claude Code, Cursor, Codex, and VSCode. Automatically clones the a11y-skills repo and all required MCP server repositories.

## Install

```bash
npm install -g a11y-skills-deploy
# or
npx a11y-skills-deploy
```

## Usage

```bash
a11y-skills
```

### Flags

- `--local` / `--global`: Skip the scope prompt.
- `--yes`: Use defaults (local scope, all IDEs, install skills).

## What It Does

This CLI automates the setup of accessibility tooling by:

1. **Cloning the a11y-skills repository** - Contains GitHub Copilot skills for accessibility workflows
2. **Cloning MCP server repositories** - Installs 5 accessibility-focused MCP servers:
   - **wcag-mcp** - WCAG 2.2 guidelines, success criteria, and techniques
   - **aria-mcp** - WAI-ARIA roles, states, properties, and patterns
   - **magentaa11y** - Component accessibility acceptance criteria
   - **a11y-personas-mcp** - Accessibility personas for diverse user needs
   - **a11y-issues-template-mcp** - Format AxeCore violations into standardized issue templates
3. **Installing skills** - Copies skills to IDE-specific directories
4. **Configuring MCP servers** - Updates each IDE's MCP config to enable the accessibility tools

## Configuration

Edit `config/a11y.json` to customize the deployment:

- `repo.url` - Main skills repository to clone
- `mcpRepos` - Array of MCP repositories to clone
- `skillsSearchPaths` - Directories to search for skills in the cloned repo
- `ideSkillsPaths` - IDE-specific skills directories (configurable per IDE)
- `mcpServers` - MCP server definitions with placeholders:
  - `{repoDir}` - Path to the main a11y-skills repo
  - `{mcpRepoDir}` - Path to the MCP repos directory

## Directory Structure

### Local Install (Project-Specific)
```
your-project/
├── .github/skills/          # Skills copied here
├── .a11y-skills/            # Main skills repo cloned here
└── .a11y-mcp/               # MCP repos cloned here
    ├── wcag-mcp/
    ├── aria-mcp/
    ├── magentaa11y-mcp/
    ├── a11y-personas-mcp/
    └── accessibility-issues-template-mcp/
```

### Global Install (User-Wide)
```
~/.a11y-skills/              # Main skills repo
~/.a11y-mcp/                 # MCP repos
~/.claude/skills/            # Claude Code skills
~/.cursor/skills/            # Cursor skills
~/.codex/skills/             # Codex skills
~/.vscode/skills/            # VSCode skills
```

MCP configurations are written to each IDE's OS-specific config path:
- **macOS**: `~/Library/Application Support/{IDE}/mcp.json`
- **Windows**: `%APPDATA%\{IDE}\mcp.json`
- **Linux**: `~/.config/{IDE}/mcp.json`