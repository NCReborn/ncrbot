module.exports = function diffMods(oldMods, newMods) {
    const oldMap = new Map(oldMods.map(m => [m.name, m]));
    const newMap = new Map(newMods.map(m => [m.name, m]));

    const added = [];
    const removed = [];
    const updated = [];

    for (const [name, mod] of newMap) {
        if (!oldMap.has(name)) {
            added.push(mod);
        } else if (oldMap.get(name).version !== mod.version) {
            updated.push({
                name,
                oldVersion: oldMap.get(name).version,
                newVersion: mod.version
            });
        }
    }

    for (const [name, mod] of oldMap) {
        if (!newMap.has(name)) {
            removed.push(mod);
        }
    }

    return { added, updated, removed };
};
