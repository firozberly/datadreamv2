const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('gridSignal', {
  ping: () => 'GRID/SIGNAL'
});
