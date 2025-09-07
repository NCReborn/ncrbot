const axios = require('axios');
const { EmbedBuilder } = require('discord.js');

// Map error patterns to suggested solutions (expand as needed)
const ERROR_PATTERNS = [
  {
    tool: 'redscript',
    patterns: [
      /\[UNRESOLVED_TYPE\]/i,
      /\[UNRESOLVED_METHOD\]/i,
      /REDScript compilation has failed/i,
    ],
    solution: `Redscript compilation failed. This is usually caused by outdated mods, missing dependencies, or incompatible mod/game versions. Update all your mods (especially those listed in the error), check for new versions of Redscript and dependencies, and uninstall or disable mods one by one to isolate the problem.`
  },
  {
    tool: 'ArchiveXL',
    patterns: [
      /\[ArchiveXL\]/i,
      /ArchiveXL.*error/i
    ],
    solution: `ArchiveXL error detected. Make sure you have the latest ArchiveXL, all its requirements, and that all dependent mods are compatible with your game version.`
  },
  {
    tool: 'TweakXL',
    patterns: [
      /\[TweakXL\]/i,
      /TweakXL.*error/i
    ],
    solution: `TweakXL error detected. Ensure you have the latest TweakXL and compatible mods.`
  },
  {
    tool: 'RED4ext',
    patterns: [
      /\[RED4ext\]/i,
      /red4ext.*error/i
    ],
    solution: `RED4ext error detected. Update RED4ext and all native mods.`
  },
  {
    tool: 'Cyber Engine Tweaks',
    patterns: [
      /\[Cyber Engine Tweaks\]/i,
      /\[CET\]/i,
      /cyber engine tweaks.*error/i,
      /CET.*error/i
    ],
    solution: `Cyber Engine Tweaks (CET) error detected. Update CET and check for mod version compatibility.`
  },
  {
    tool: 'REDmod',
    patterns: [
      /\[REDmod\]/i,
      /REDmod.*error/i
    ],
    solution: `REDmod error detected. Make sure REDmod is enabled in your launcher and your mods are in the correct directory.`
  }
];

// AI Diagnostics integration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
async function getAIDiagnostic(logSnippet) {
  if (!OPENAI_API_KEY) {
    return "AI diagnostics unavailable: no OpenAI API key configured.";
  }
  const prompt = `This is a crash log from a Cyberpunk 2077 modded setup. What does the following error mean and how do I fix it? Please keep your answer concise and actionable for a non-programmer.\n\nError snippet:\n${logSnippet}`;
  try {
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.2,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return resp.data.choices[0].message.content.trim();
  } catch (err) {
    return "AI diagnostics failed: " + (err.response?.data?.error?.message || err.message);
  }
}

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

/**
 * Analyze the log for known errors and always supplement with an AI summary.
 * Returns an object: { matches, aiSummary }
 */
async function analyzeLogForErrors(logContent) {
  const lines = logContent.split(/\r?\n/);
  // Flexible error line detection:
  const errorLines = lines.filter(line =>
    line.toUpperCase().includes('[ERROR') ||
    line.toUpperCase().includes('ERROR')
  );

  let matches = [];
  errorLines.forEach((line, i) => {
    for (const err of ERROR_PATTERNS) {
      for (const pattern of err.patterns) {
        const result = pattern.test(line);
        if (result) {
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

  if (
    logContent.match(/REDScript compilation has failed/i) &&
    !matches.some(m => m.tool === 'redscript')
  ) {
    matches.push({
      tool: 'redscript',
      lineNumber: null,
      line: 'REDScript compilation has failed.',
      solution: ERROR_PATTERNS.find(p => p.tool === 'redscript').solution
    });
  }

  // Always get an AI summary of the error lines (or logContent if no error lines)
let aiSummary = null;
if (matches.length > 0) {
  aiSummary = await getAIDiagnostic(
    matches.map(m => m.line).join('\n').slice(0, 2000)
  );
}

  return { matches, aiSummary };
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

/**
 * Builds an error analysis embed for a log file, including an AI summary field.
 * @param {Object} attachment - {name, url}
 * @param {Object} analysisResult - Output of analyzeLogForErrors: { matches, aiSummary }
 * @param {string} logContent - The log's full content
 * @param {string} messageUrl - The "jump to message" URL, or empty string if ephemeral
 * @param {boolean} showOriginalMessage - If false, don't show "Original Message" block (for ephemeral replies)
 */
function buildErrorEmbed(attachment, analysisResult, logContent, messageUrl = '', showOriginalMessage = true) {
  const { matches, aiSummary } = analysisResult;

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
  }

  // Always add the AI summary, if present
  if (aiSummary && matches.length > 0) {
  embed.addFields({
    name: "🤖 AI Summary of Potential Issues/Fixes",
    value: aiSummary.length > 1024 ? aiSummary.slice(0, 1021) + '...' : aiSummary
  });
}

  // Only show "Original Message" section for non-ephemeral messages with a valid URL
  if (showOriginalMessage && messageUrl) {
    embed.addFields({
      name: "Original Message",
      value: `[Jump to message](${messageUrl})`
    });
  }

  // Add italicized beta/AI disclaimer footer
  embed.setFooter({ text: 'This log analysis is AI-generated and currently in beta.', iconURL: null });

  return embed;
}

module.exports = {
  fetchLogAttachment,
  analyzeLogForErrors,
  buildErrorEmbed
};
