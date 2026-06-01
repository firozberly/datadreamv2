/// <reference types="vite/client" />

declare global {
  interface Window {
    gridSignal?: {
      ping: () => string
    }
  }
}

declare module 'papaparse' {
  export type ParseResult<T> = { data: T[]; errors: unknown[]; meta: unknown }
  export function parse<T>(input: string, config?: Record<string, unknown>): ParseResult<T>
}

export {}
