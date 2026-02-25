# Obsidian Skill

This skill allows Prometheus to manage Obsidian vaults and generate interactive JSON Canvas whiteboards.

## Core Rules for the Agent

### 1. JSON Canvas Generation (`obsidian_create_canvas`)
When generating `.canvas` files, follow these strict rules from the JSON Canvas specification:
- **Format**: Output valid JSON. No trailing commas or comments.
- **IDs**: Each node and edge must have a unique ID. If you don't provide one, the tool will generate a 16-character hex string.
- **Coordinates**: Use integers for `x`, `y`, `width`, and `height`.
- **Spacing**: Maintain at least `50px` of space between nodes. Standard card width is `400px`.
- **Text Nodes**: Use `type: "text"` and put Markdown in the `text` field. Use `\n` for newlines.
- **Color Presets**: 
  - `"1"`: Red | `"2"`: Orange | `"3"`: Yellow | `"4"`: Green | `"5"`: Cyan | `"6"`: Purple.
- **Z-Index**: Items later in the `nodes` array appear on top.

### 2. Note Structure and Metadata
- Use YAML frontmatter for metadata when creating new notes.
- Follow the user's existing vault organization where possible.
- Default Vault: `/Users/nelsonwong/Documents/Obsidian/My iMac notebooks`

### 3. Tool Usage Examples

**Creating a Brainstorming Canvas:**
```javascript
obsidian_create_canvas({
  canvasPath: "Brainstorm.canvas",
  nodes: [
    { type: "text", text: "# Goal\nBuild a better assistant", x: 0, y: 0, width: 400, height: 200, color: "4" },
    { type: "text", text: "## Feature 1\nObserve changes", x: 450, y: 0, width: 400, height: 200 }
  ],
  edges: [
    { fromNode: "...", toNode: "...", fromSide: "right", toSide: "left", toEnd: "arrow" }
  ]
})
```

**Searching and Reading:**
- Use `obsidian_search` to find notes by content.
- Use `obsidian_list_notes` to explore the vault structure.
- Always use `obsidian_read_note` before modifying an existing note to preserve context.
