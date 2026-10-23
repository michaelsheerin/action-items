const DB_NAME = 'sheerin-action-items';
const DB_VERSION = 1;

export async function openStore() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('tasks', {keyPath: 'id'});
      request.result.createObjectStore('meta', {keyPath: 'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close older Action Items tabs, then reload.'));
  });
  db.onversionchange = () => db.close();
  function transaction(mode, action) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tasks', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('The browser did not save your changes.'));
      tx.onabort = () => reject(tx.error || new Error('The save was interrupted.'));
      try { action(tx.objectStore('tasks'), value => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }
  return {
    all: () => transaction('readonly', (store, result) => {
      const request = store.getAll(); request.onsuccess = () => result(request.result);
    }),
    // Read and patch inside one transaction so edits from other tabs are preserved.
    patch: (id, patch, seed) => transaction('readwrite', (store, result) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const task = {...(request.result || seed), ...patch, id};
        store.put(task); result(task);
      };
    }),
    import: (tasks, overwrite = false) => transaction('readwrite', (store, result) => {
      let count = 0;
      for (const task of tasks) {
        const request = store.get(task.id);
        request.onsuccess = () => {
          if (!request.result || overwrite) { store.put(task); count++; }
        };
      }
      result({get count() {return count;}});
    })
  };
}
