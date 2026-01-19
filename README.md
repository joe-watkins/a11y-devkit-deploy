# A11y Devkit Deploy

A **fully config-driven**, cross-platform CLI for deploying accessibility skills and MCP servers across multiple IDEs: Claude Code, Cursor, Codex, VSCode, Windsurf, and Factory.

**Add new skills, MCP servers, or entire IDEs without writing code** - just edit the JSON config and re-run.

## Install

```bash
npm install -g a11y-devkit-deploy
# or
npx a11y-devkit-deploy
```

## Usage

```bash
a11y-devkit-deploy
```

### Flags

- `--local` / `--global`: Skip the scope prompt.
- `--yes`: Use defaults (local scope, all IDEs, install skills).

## After Installation

Once installation completes, you'll find a comprehensive usage guide in your IDE's skills directory:

- **Local install**: `.claude/skills/a11y/a11y-devkit-README.md` (or `.cursor/skills/a11y/`, `.codex/skills/a11y/` depending on your IDE)
- **Global install**: `~/.claude/skills/a11y/a11y-devkit-README.md` (or your IDE's global skills directory)

### What's in the Guide

The bundled README includes:
- **70+ example prompts** organized by complexity level (beginner to advanced)
- **Quick reference cheat sheet** for common tasks
- **Skill descriptions** explaining when to use each of the 7 skills
- **MCP server guides** with verification steps and example queries
- **Combined workflows** showing how to use skills and MCP servers together
- **Complete audit examples** using the orchestrator for end-to-end accessibility testing

### Preview the Guide

You can preview the guide here: [templates/deploy-README.md](templates/deploy-README.md)

### Next Steps

1. Open the README in your IDE's skills directory
2. Try the "Getting Started" prompts to verify everything is working
3. Explore the example prompts library to find workflows that match your needs
4. Use the MCP verification section to test all 5 MCP servers

### MCP Servers

All MCP servers are configured to run via `npx`, which means:
- No local installation or cloning required
- Automatically fetches the latest version when needed
- No disk space used for local copies
- Just restart your IDE and the servers will be available

## What It Does

This CLI automates the setup of accessibility tooling by:

1. **Installing skills from npm** - Downloads and installs accessibility skill packages (configurable in `config/a11y.json`)
2. **Configuring MCP servers** - Updates each IDE's MCP config to enable accessibility-focused MCP servers (also configurable)

**Default configuration includes:**
   - **7 accessibility skills** - Testing, remediation, validation, documentation, and orchestration
   - **5 MCP servers**:
     - **wcag** - WCAG 2.2 guidelines, success criteria, and techniques
     - **aria** - WAI-ARIA roles, states, properties, and patterns
     - **magentaa11y** - Component accessibility acceptance criteria
     - **a11y-personas** - Accessibility personas for diverse user needs
     - **arc-issues** - Format AxeCore violations into standardized issue templates

**Fully customizable** - add/remove skills, MCP servers, or entire IDEs by editing the config file.

## Why This Tool?

**Zero Hardcoded Values** - Every aspect of the tool is driven by `config/a11y.json`:
- IDE paths and configuration files
- Skills to install
- MCP servers to configure
- Even the IDE list itself

**Adding Support for a New IDE** takes just 5 lines of JSON:
```json
{
  "id": "new-ide",
  "displayName": "New IDE",
  "mcpServerKey": "servers",
  "skillsFolder": ".new-ide/skills",
  "mcpConfigFile": ".new-ide/mcp.json"
}
```

**Safe by Default** - Won't overwrite your existing:
- Custom MCP servers in your IDE configs
- Other skills in your skills directories
- Creates backups if it encounters JSON parsing errors

### Skills Installed (Default)

The following skill packages are installed from npm by default. **Add your own by editing `config/a11y.json`**:

| Skill | Package | Description |
|-------|---------|-------------|
| a11y-base-web | `a11y-base-web-skill` | Foundational accessibility patterns for web code |
| a11y-issue-writer | `a11y-issue-writer-skill` | Write clear accessibility issue reports |
| a11y-tester | `a11y-tester-skill` | Automated testing with axe-core and Playwright |
| a11y-remediator | `a11y-remediator-skill` | Fix accessibility issues in code |
| a11y-validator | `a11y-validator-skill` | Validate accessibility compliance |
| web-standards | `web-standards-skill` | Web standards and best practices |
| a11y-audit-fix-agent-orchestrator | `a11y-audit-fix-agent-orchestrator-skill` | Orchestrate full audit and fix workflows |

### No Local MCP Installation Required!

MCP servers are configured to use `npx`, which means:
- **No cloning** of MCP server repositories
- **No building** or `npm install` steps
- **No disk space** used for local copies
- **Always up-to-date** - npx fetches the latest version automatically

The generated MCP config looks like this:

```json
{
  "mcpServers": {
    "wcag": {
      "command": "npx",
      "args": ["-y", "wcag-mcp"]
    },
    "aria": {
      "command": "npx",
      "args": ["-y", "aria-mcp"]
    }
  }
}
```

## Configuration

The entire tool is **fully config-driven**. Edit `config/a11y.json` to customize everything without touching code.

### Adding a New Skill

Simply add an object to the `skills` array with a `name` (npm package) and `description`:

```json
{
  "skills": [
    {
      "name": "a11y-tester-skill",
      "description": "Run accessibility tests"
    },
    {
      "name": "your-custom-skill",
      "description": "Your custom skill description"
    }
  ]
}
```

### Adding a New MCP Server

Add an object to the `mcpServers` array with name, description, command, and args:

```json
{
  "mcpServers": [
    {
      "name": "wcag",
      "description": "WCAG guidelines reference",
      "command": "npx",
      "args": ["-y", "wcag-mcp"]
    },
    {
      "name": "your-custom-mcp",
      "description": "Your custom MCP server",
      "command": "npx",
      "args": ["-y", "your-mcp-package"]
    }
  ]
}
```

### Adding a New IDE

Add an object to the `ides` array with the IDE's configuration:

```json
{
  "ides": [
    {
      "id": "windsurf",
      "displayName": "Windsurf",
      "mcpServerKey": "servers",
      "skillsFolder": ".codeium/windsurf/skills",
      "mcpConfigFile": ".codeium/windsurf/mcp_config.json"
    }
  ]
}
```

**IDE Configuration Properties:**
- `id` - Unique identifier for the IDE
- `displayName` - Human-readable name shown in prompts
- `mcpServerKey` - MCP config key name (`"servers"` or `"mcpServers"`)
- `skillsFolder` - Path to skills directory (relative to home/project root)
- `mcpConfigFile` - Path to MCP config file (relative to home/project root)

### Config Structure

- `skillsFolder` - Subfolder name to bundle skills under (e.g., "a11y")
- `readmeTemplate` - README template file to copy into skills directories
- `skills` - Array of skill objects with `name` (npm package) and `description`
- `ides` - Array of IDE configuration objects
- `mcpServers` - MCP server definitions with name, description, command, and args

All changes take effect immediately - just re-run the CLI to deploy your updated config.

### Safe Merging

The CLI **safely merges** with existing configurations:
- **MCP configs** - Adds/updates only the specified servers, preserves others
- **Skills** - Installs only the configured skills, preserves other skills in the directory
- **Backups** - Creates `.bak` files if JSON parsing fails

## Directory Structure

### Local Install (Project-Specific)
```
your-project/
├── .claude/
│   ├── mcp.json            # Claude Code MCP config
│   └── skills/             # Claude Code skills
├── .cursor/
│   ├── mcp.json            # Cursor MCP config
│   └── skills/             # Cursor skills
├── .codex/
│   ├── mcp.json            # Codex MCP config
│   └── skills/             # Codex skills
├── .github/
│   ├── mcp.json            # VSCode MCP config
│   └── skills/             # VSCode skills
├── .codeium/windsurf/
│   ├── mcp_config.json     # Windsurf MCP config
│   └── skills/             # Windsurf skills
└── .factory/
    ├── mcp.json            # Factory MCP config
    └── skills/             # Factory skills
```

### Global Install (User-Wide)
```
~/.claude/
  ├── mcp.json              # Claude Code global MCP config
  └── skills/               # Claude Code global skills
~/.cursor/
  ├── mcp.json              # Cursor global MCP config
  └── skills/               # Cursor global skills
~/.codex/
  ├── mcp.json              # Codex global MCP config
  └── skills/               # Codex global skills
~/.github/
  ├── mcp.json              # VSCode global MCP config
  └── skills/               # VSCode global skills
~/.codeium/windsurf/
  ├── mcp_config.json       # Windsurf global MCP config
  └── skills/               # Windsurf global skills
~/.factory/
  ├── mcp.json              # Factory global MCP config
  └── skills/               # Factory global skills
```

**Note:** Paths are fully customizable per IDE in `config/a11y.json`

## MCP Servers Included (Default)

**Add your own by editing `config/a11y.json`**:

| Server | Package | Description |
|--------|---------|-------------|
| wcag | `wcag-mcp` | WCAG 2.2 guidelines, success criteria, techniques |
| aria | `aria-mcp` | WAI-ARIA roles, states, properties |
| magentaa11y | `magentaa11y-mcp` | Component accessibility acceptance criteria |
| a11y-personas | `a11y-personas-mcp` | Accessibility personas for diverse users |
| arc-issues | `arc-issues-mcp` | AxeCore violation formatting |

## Complete Config Example

Here's what a complete `config/a11y.json` looks like:

```json
{
  "skillsFolder": "a11y",
  "readmeTemplate": "deploy-README.md",
  "skills": [
    {
      "name": "a11y-base-web-skill",
      "description": "Core accessibility testing utilities"
    },
    {
      "name": "a11y-tester-skill",
      "description": "Run accessibility tests"
    }
  ],
  "ides": [
    {
      "id": "claude",
      "displayName": "Claude Code",
      "mcpServerKey": "servers",
      "skillsFolder": ".claude/skills",
      "mcpConfigFile": ".claude/mcp.json"
    },
    {
      "id": "cursor",
      "displayName": "Cursor",
      "mcpServerKey": "mcpServers",
      "skillsFolder": ".cursor/skills",
      "mcpConfigFile": ".cursor/mcp.json"
    },
    {
      "id": "windsurf",
      "displayName": "Windsurf",
      "mcpServerKey": "servers",
      "skillsFolder": ".codeium/windsurf/skills",
      "mcpConfigFile": ".codeium/windsurf/mcp_config.json"
    }
  ],
  "mcpServers": [
    {
      "name": "wcag",
      "description": "WCAG guidelines reference",
      "command": "npx",
      "args": ["-y", "wcag-mcp"]
    },
    {
      "name": "aria",
      "description": "ARIA specification reference",
      "command": "npx",
      "args": ["-y", "aria-mcp"]
    }
  ]
}
```

Everything is customizable - add, remove, or modify any section to match your needs.
