# Implementation Plan - Google Drive Agent Skill (Enhanced)

Expand the `google-drive` skill beyond simple backup/restore to a full file management agent capable of reading, writing, and modifying files with hierarchical path awareness and context-safe operations.

## 🧠 Rigorous Thinking Protocol

### 1. Architectural Improvements (Deep Dive)
- **Problem: ID vs Path Disconnect**
    - Google Drive uses cryptic IDs, but humans/agents think in paths (`/Work/Report.pdf`).
    - **Solution**: Implement a `PathResolver` utility in `bridge.js` that recursively maps string paths to Drive IDs via cached listings.
- **Problem: Incompatible MIME Types**
    - "Reading" a Google Doc via `drive.files.get` returns a binary error.
    - **Solution**: Implement an `ExportMapper`. If a file has a Google MIME type (e.g., `application/vnd.google-apps.document`), the tool automatically utilizes `drive.files.export` to return plain text or markdown.
- **Problem: Context Flooding / Large Files**
    - Reading a 10MB file will overflow the LLM context.
    - **Solution**: Implement `drive_peek_file` which returns only the first/last 2000 characters and metadata (size, mimeType), allowing the agent to decide if a full read is necessary.

### 2. Step-by-Step Analysis & Sanity Checks
- **Step 1: Auth & Scope Audit**
    - Default to `drive.file` (highest safety). 
    - Include logic to prompt the user if a broad search requires higher scopes (`auth/drive`).
- **Step 2: Tool Suite Design**
    - `drive_list(path)`: Human-readable folder listing.
    - `drive_peek(path)`: Context-safe header reading.
    - `drive_read(path)`: Full read for small text/md files.
    - `drive_write(path, data)`: Atomic write/update.
    - `drive_trash(path)`: Safety-first deletion (no hard delete).
- **Step 3: Response Management**
    - Standardize all tool returns to JSON with `fileId`, `path`, and `mimeType`.

### 3. Edge Case & Security Audit
- **Risk: Shared Drives**: Current code might miss files in team drives. 
    - **Guard**: Set `includeItemsFromAllDrives: true` and `supportsAllDrives: true`.
- **Risk: Duplicate Names**: Drive allows two files named "test.txt" in one folder.
    - **Guard**: Path resolution will return the *most recent* match and include a warning if duplicates are detected.
- **Risk: Rate Limiting**: Batch operations might hit API quotas.
    - **Guard**: Implement basic exponential backoff for the V3 client.

## Proposed Changes

### [Component] Google Drive Skill
#### [MODIFY] [skill.json](file:///Users/nelsonwong/Documents/projects/Prometheus/skills/google-drive/skill.json) [NEW]
- Define `drive_peek_file` and `drive_export_doc` tools.
- Set `path` as the primary argument for all tools (auto-resolved to ID in bridge).

#### [MODIFY] [bridge.js](file:///Users/nelsonwong/Documents/projects/Prometheus/skills/google-drive/bridge.js) [NEW]
- Implement the `PathResolver` class for hierarchical navigation.
- Implement the `ExportMapper` for automated Google Doc conversion.
- Add `trashed: true` as the default "delete" mechanism.

## Verification Plan
### Automated Tests
- `scripts/test_drive_v2.js`:
    1. Resolve a deep path (`/Test/Nested/File.txt`).
    2. Export a Google Doc to markdown string.
    3. Verify "Peek" only returns a chunk of data.

### Manual Verification
- Niki test: "Prometheus, find the 'Project Alpha' summary Doc in my Drive, read the first few paragraphs, and tell me if it's up to date."
