const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('studio', { ping: () => 'pong' });
