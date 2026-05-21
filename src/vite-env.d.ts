/// <reference types="vite/client" />

declare global {
  interface Window {
    electron?: {
      platform: string
    }
  }
}

export {}
