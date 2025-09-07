/**
 * Changelog / comparison embed builders.
 * TODO: Integrate actual diff logic (e.g., reuse /diff command internals).
 */

function baseColor() {
  return 0x00aaff;
}
function pairColor() {
  return 0xff8c00;
}

async function buildSingleChangelog({ slug, display, oldRevision, newRevision }) {
  const title = `${display} updated: ${oldRevision || 'N/A'} → ${newRevision}`;
  const description = [
    `Detected revision bump for ${display}.`,
    '',
    'Details: (placeholder – integrate diff extraction here).'
  ].join('\n');

  return {
    embeds: [{
      title,
      description,
      color: baseColor(),
      timestamp: new Date().toISOString(),
      footer: { text: slug }
    }]
  };
}

async function buildPairComparison({
  leftSlug, rightSlug,
  leftDisplay, rightDisplay,
  leftOld, leftNew,
  rightOld, rightNew
}) {
  const title = `${leftDisplay} & ${rightDisplay} Updated`;
  const lines = [
    `${leftDisplay}: ${leftOld || '—'} → ${leftNew}`,
    `${rightDisplay}: ${rightOld || '—'} → ${rightNew}`,
    '',
    'Combined comparison (placeholder).',
    'Add diff summary lines here.'
  ];

  return {
    embeds: [{
      title,
      description: lines.join('\n'),
      color: pairColor(),
      timestamp: new Date().toISOString(),
      footer: { text: `${leftSlug}|${rightSlug}` }
    }]
  };
}

module.exports = {
  buildSingleChangelog,
  buildPairComparison
};
