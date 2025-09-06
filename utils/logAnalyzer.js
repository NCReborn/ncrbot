onst axios = require('axios');
const { EmbedBuilder } = require('discord.js');

// Map error patterns to suggested solutions (expand as needed)
const ERROR_PATTERNS = [
  {
    tool: 'redscript',
    patterns: [
      /\[ERROR.*UNRESOLVED_TYPE.*\]/i,
      /\[ERROR.*UNRESOLVED_METHOD.*\]/i,
      /REDScript compilation has failed/i,
    ],
    solution: `Redscript compilation failed. This is usually caused by outdated mods, missing dependencies, or incompatible mod/game versions. Update all your mods (especially those listed in the error), check for new versions of Redscript and dependencies, and uninstall or disable mods one by one to isolate the problem.`
  },
  {
    tool: 'ArchiveXL',
    patterns: [
      /\[ERROR.*ArchiveXL.*\]/i,
      /ArchiveXL.*error/i
    ],
    solution: `ArchiveXL error detected. Make sure you have the latest ArchiveXL, all its requirements, and that all dependent mods are compatible with your game version.`
  },
  {
    tool: 'TweakXL',
    patterns: [
      /\[ERROR.*TweakXL.*\]/i,
      /TweakXL.*error/i
    ],
    solution: `TweakXL error detected. Ensure you have the latest TweakXL and compatible mods.`
  },
  {
    tool: 'RED4ext',
    patterns: [
      /\[ERROR.*RED4ext.*\]/i,
      /red4ext.*error/i
    ],
    solution: `RED4ext error detected. Update RED4ext and all native mods.`
  },
  {
    tool: 'Cyber Engine Tweaks',
    patterns: [
      /\[ERROR.*Cyber Engine Tweaks.*\]/i,
      /\[ERROR.*CET.*\]/i,
      /cyber engine tweaks.*error/i,
      /CET.*error/i
    ],
    solution: `Cyber Engine Tweaks (CET) error detected. Update CET and check for mod version compatibility.`
  },
  {
    tool: 'REDmod',
    patterns: [
      /\[ERROR.*REDmod.*\]/i,
      /REDmod.*error/i
    ],
    solution: `REDmod error detected. Make sure REDmod is enabled in your launcher and your mods are in the correct directory.`
  }
];

async function fetchLogAttachment(attachment) {
  const validExts = ['.log', '.txt', '.error'];
  if (!validExts.some(ext => attachment.name.toLowerCase().endsWith(ext))) return null;
  try {
    const response = await axios.get(attachment.url);
    return response.data;
  } catch (err) {
    return null;
  }
}

function analyzeLogForErrors(logContent) {
  const lines = logContent.split('\n');
  const errorLines = lines.filter(line => /^\[ERROR\b/i.test(line));

  let matches = [];
  errorLines.forEach((line, i) => {
    for (const err of ERROR_PATTERNS) {
      for (const pattern of err.patterns) {
        if (pattern.test(line)) {
          matches.push({
            tool: err.tool,
            lineNumber: i + 1,
            line,
            solution: err.solution
          });
        }
      }
    }
  });

  // If compilation failed, highlight that even if no other match
  if (logContent.match(/REDScript compilation has failed/i) && !matches.some(m => m.tool === 'redscript')) {
    matches.push({
      tool: 'redscript',
      lineNumber: null,
      line: 'REDScript compilation has failed.',
      solution: ERROR_PATTERNS.find(p => p.tool === 'redscript').solution
    });
  }

  return matches;
}

function extractModList(logContent) {
  // Optionally, add a list of mods reported in the log as problematic:
  const modFailMatch = logContent.match(/This error has been caused by mods listed below:\n- ([\s\S]+)/i);
  if (modFailMatch) {
    const modList = modFailMatch[1].split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^- /, '').trim());
    return modList;
  }
  return [];
}

function buildErrorEmbed(attachment, matches, logContent, messageUrl) {
  const embed = new EmbedBuilder()
    .setTitle(`Crash Log Analysis: ${attachment.name}`)
    .setColor(0xff0000)
    .setTimestamp();

  if (matches.length > 0) {
    embed.setDescription(`Detected **${matches.length} critical error(s)** that may prevent the game from launching.\n\n**Summary:**`);

    matches.slice(0, 5).forEach(error => {
      embed.addFields({
        name: `❌ ${error.tool} (Line ${error.lineNumber || '?'})`,
        value: `\`\`\`${error.line.trim().slice(0, 200)}\`\`\`\n**Solution:** ${error.solution}`
      });
    });

    if (matches.length > 5) {
      embed.addFields({ name: "Note", value: `Showing only the first 5 errors. There may be more in your log.` });
    }

    const modList = extractModList(logContent);
    if (modList.length) {
      embed.addFields({
        name: "Mods Possibly Causing the Crash",
        value: modList.map(m => `• ${m}`).join('\n')
      });
    }

    embed.addFields({
      name: "Original Message",
      value: `[Jump to message](${messageUrl})`
    });

    // Redscript error - Possible Solutions prompt
    if (matches.some(m => m.tool === 'redscript')) {
      embed.addFields({
        name: "Possible Solutions",
        value: [
          ":warning: **If you are seeing a Redscript compilation failed error, please attempt a clean install as described in <#1399435694472040509>. This resolves most persistent script errors!**",
          "",
          "It may also be worth looking in <#1379124580051845130> for a list of common issues that can cause errors."
        ].join('\n')
      });
    }
  } else {
    embed
      .setDescription(`✅ **No critical errors were detected in this log file.**
      
If you are still experiencing issues:
- Please post any additional log files mentioned in the pinned comments of this channel.
- Or, head to <#1285796905640788030> and describe the issue you are having for further assistance.`);
    embed.addFields({
      name: "Original Message",
      value: `[Jump to message](${messageUrl})`
    });
  }

  return embed;
}

module.exports = {
  fetchLogAttachment,
  analyzeLogForErrors,
  buildErrorEmbed
};
