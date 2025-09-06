module.exports = {
  getCollectionSlug: (name) => {
    const normalizedName = name.toLowerCase().trim();
    switch (normalizedName) {
      case 'ncr': return 'rcuccp';
      case 'adr': return 'srpv39';
      case 'ncr lite': return 'vfy7w1';
      case 'adr lite': return 'ezxduq';
      case 'ncrlite': return 'vfy7w1';
      case 'adrlite': return 'ezxduq';
      default: return name;
    }
  },

  getCollectionName: (slug) => {
    switch (slug) {
      case 'rcuccp': return 'NCR';
      case 'srpv39': return 'ADR';
      case 'vfy7w1': return 'NCR Lite';
      case 'ezxduq': return 'ADR Lite';
      default: return slug;
    }
  },

  computeDiff: (oldMods, newMods) => {
    const oldMap = new Map(oldMods.map((m) => [String(m.id), m]));
    const newMap = new Map(newMods.map((m) => [String(m.id), m]));

    const added = [];
    const removed = [];
    const updated = [];

    for (const [id, mod] of newMap.entries()) {
      if (!oldMap.has(id)) {
        added.push(mod);
      } else {
        const oldMod = oldMap.get(id);
        if (oldMod.version !== mod.version) {
          updated.push({ before: oldMod, after: mod });
        }
      }
    }

    for (const [id, mod] of oldMap.entries()) {
      if (!newMap.has(id)) {
        removed.push(mod);
      }
    }

    return { added, removed, updated };
  },

  findExclusiveChanges: (diffs1, diffs2) => {
    const exclusiveAdded1 = diffs1.added.filter(mod1 => !diffs2.added.some(mod2 => mod2.id === mod1.id));
    const exclusiveRemoved1 = diffs1.removed.filter(mod1 => !diffs2.removed.some(mod2 => mod2.id === mod1.id));
    const exclusiveUpdated1 = diffs1.updated.filter(update1 => !diffs2.updated.some(update2 => update2.before.id === update1.before.id));

    const exclusiveAdded2 = diffs2.added.filter(mod2 => !diffs1.added.some(mod1 => mod1.id === mod2.id));
    const exclusiveRemoved2 = diffs2.removed.filter(mod2 => !diffs1.removed.some(mod1 => mod1.id === mod2.id));
    const exclusiveUpdated2 = diffs2.updated.filter(update2 => !diffs1.updated.some(update1 => update1.before.id === update2.before.id));

    return {
      added1: exclusiveAdded1,
      removed1: exclusiveRemoved1,
      updated1: exclusiveUpdated1,
      added2: exclusiveAdded2,
      removed2: exclusiveRemoved2,
      updated2: exclusiveUpdated2
    };
  },

  splitLongDescription: (description, maxLength = 4096) => {
    if (description.length <= maxLength) return [description];

    const parts = [];
    let currentPart = '';
    const lines = description.split('\n');

    for (const line of lines) {
      if ((currentPart + line + '\n').length > maxLength) {
        if (currentPart) {
          parts.push(currentPart.trim());
          currentPart = '';
        }
        
        if (line.length > maxLength) {
          const words = line.split(' ');
          let tempLine = '';
          for (const word of words) {
            if ((tempLine + word + ' ').length > maxLength) {
              if (tempLine) {
                parts.push(tempLine.trim());
                tempLine = '';
              }
              tempLine += word + ' ';
            } else {
              tempLine += word + ' ';
            }
          }
          if (tempLine) {
            currentPart += tempLine.trim() + '\n';
          }
        } else {
          currentPart += line + '\n';
        }
      } else {
        currentPart += line + '\n';
      }
    }

    if (currentPart) parts.push(currentPart.trim());
    return parts;
  },

  sortModsAlphabetically: (mods) => mods.sort((a, b) => a.name.localeCompare(b.name)),
  
  sortUpdatedModsAlphabetically: (updatedMods) => updatedMods.sort((a, b) => a.before.name.localeCompare(b.before.name))
};