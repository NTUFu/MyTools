declare module 'prettier/standalone' {
  export type Options = Record<string, unknown>
  export function format(source: string, options?: Options): string | Promise<string>
}

declare module 'prettier/plugins/markdown' {
  const plugin: unknown
  export default plugin
}
