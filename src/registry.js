// A named extension point. Feature modules register entries by id; the UI
// renders them and the app looks them up by the state's selected id, so
// adding an option is one register() call, never an edit to a shared list.
//
//   const reg = createRegistry('look');
//   reg.register({ id: 'clay', name: 'Clay', ... });
//   reg.get('clay'); reg.entries(); reg.ids();
export function createRegistry(kind) {
  const byId = new Map();
  return {
    kind,
    register(entry) {
      if (!entry || typeof entry.id !== 'string' || !entry.id) {
        throw new Error(`${kind} entries need a string id`);
      }
      if (byId.has(entry.id)) throw new Error(`${kind} '${entry.id}' is already registered`);
      byId.set(entry.id, entry);
      return entry;
    },
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    entries: () => [...byId.values()],
    ids: () => [...byId.keys()],
  };
}
