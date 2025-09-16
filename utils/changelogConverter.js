**
 * Convert plain changelog text into Nexus Mods comment Markdown with collapsible and links.
 * Supports NCR/ADR and NCRLite/ADRLite sections.
 * @param {string} changelogText
 * @returns {string}
 */
function convertChangelogToNexusMarkdown(changelogText) {
  let output = '<details><summary>View content</summary>\n\n';
  const lines = changelogText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Section headers
    if (/^(Added Mods|Updated Mods|Removed Mods)/i.test(line)) {
      const sectionIcon = /Added Mods/i.test(line)
        ? '### ➕ Added Mods'
        : /Updated Mods/i.test(line)
        ? '### 🔄 Updated Mods'
        : /Removed Mods/i.test(line)
        ? '### 🗑️ Removed Mods'
        : `### ${line.replace(':', '')}`;
      output += `\n${sectionIcon}\n\n`;
      continue;
    }

    // Subsection headers ("ADR Exclusive:", "NCR Exclusive:", etc)
    if (/Exclusive:/i.test(line)) {
      output += `**${line.replace(':', '')}:**\n`;
      continue;
    }

    // Bullet or mod+link line (try to extract name and url)
    // Support leading bullets/hyphens or just space separated
    let match = line.match(/^(?:[\-\*\•]\s*)?(.+?)\s*(https?:\/\/[^\s)]+)$/i);
    if (match) {
      output += `- [${match[1].trim()}](${match[2].trim()})\n`;
    } else if (line) {
      // Not empty, not a section, not a link = treat as text or subheader
      output += `${line}\n`;
    }
  }

  output += '\n</details>';
  return output;
}

module.exports = { convertChangelogToNexusMarkdown };
