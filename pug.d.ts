declare module 'pug' {
  interface Options {
    filename?: string
    basedir?: string
    doctype?: string
    pretty?: boolean | string
    filters?: Record<string, (text: string, options: any) => string>
    self?: boolean
    debug?: boolean
    compileDebug?: boolean
    globals?: string[]
    cache?: boolean
    inlineRuntimeFunctions?: boolean
    name?: string
    plugins?: PugPlugin[]
  }

  interface PugPlugin {
    /** Override how an include/extends file is read (e.g. to cache reads). Receives an absolute path. */
    read?: (filename: string, options?: Options) => string
    /** Override how an include/extends path is resolved to an absolute path. */
    resolve?: (filename: string, source: string, options?: Options) => string
  }

  interface CompiledTemplate {
    (locals?: any): string
    /** Absolute paths of all files this template includes/extends (entry file not included). */
    dependencies: string[]
  }

  const pug: {
    compileFile: (source: string, options?: Options) => CompiledTemplate
    compile: (source: string, options?: Options) => CompiledTemplate
  }
  export = pug
}

declare module 'pug-load' {
  interface LoadOptions {
    filename?: string
    basedir?: string
    /** pug's lexer, threaded through by `compile`; lexes a source string to tokens. */
    lex?: (src: string, options: any) => any
    /** pug's parser, threaded through by `compile`; parses tokens to a shallow AST. */
    parse?: (tokens: any, options: any) => any
    [key: string]: any
  }

  interface PugLoad {
    /** Resolve includes/extends in a parsed AST (clones the input before mutating it). */
    (ast: any, options: LoadOptions): any
    /** Lex + parse `src`, then resolve its includes/extends. The seam pug compiles every file through. */
    string: (src: string, options: LoadOptions) => any
    file: (filename: string, options: LoadOptions) => any
  }

  const load: PugLoad
  export = load
}
