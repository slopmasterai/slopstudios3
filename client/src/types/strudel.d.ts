// Type declarations for Strudel packages (no official types available)

declare module '@strudel/web' {
  export function initStrudel(options?: {
    prebake?: () => Promise<void>;
    afterEval?: (options: { code: string; pattern: any }) => void;
  }): Promise<void>;

  export function samples(source: string | Record<string, string | string[]>): Promise<void>;
  export function evaluate(code: string): Promise<any>;
  export function hush(): void;
  export function note(pattern: string): any;
  export function s(pattern: string): any;
  export function repl(options?: any): any;
  export const webaudioOutput: any;
}

declare module '@strudel/webaudio' {
  export function initAudioOnFirstClick(): Promise<AudioContext>;
  export function repl(options: {
    defaultOutput?: any;
    getTime?: () => number;
  }): {
    setPattern: (pattern: any) => void;
    start: () => void;
    stop: () => void;
  };
  export const webaudioOutput: any;
}

declare module '@strudel/core' {
  export function s(pattern: string): any;
  export function note(pattern: string): any;
  export function stack(...patterns: any[]): any;
  export function sequence(...patterns: any[]): any;
  export function seq(...patterns: any[]): any;
  export function cat(...patterns: any[]): any;
  export function slowcat(...patterns: any[]): any;
  export const silence: any;
  export function pure(value: any): any;
  export function reify(thing: any): any;
  export class Pattern {
    constructor();
  }
  export class TimeSpan {
    constructor(begin: number, end: number);
  }
  export class Cyclist {
    constructor(options: {
      getTime: () => number;
      interval?: number;
      onTrigger: (hap: any, deadline: number, duration: number) => void;
    });
    setPattern(pattern: any): void;
    start(): void;
    stop(): void;
  }
}

declare module '@strudel/mini' {
  export function s(pattern: string): any;
  export function note(pattern: string): any;
  export function mini(pattern: string): any;
  export function m(pattern: string): any;
}

declare module '@strudel/transpiler' {
  export function evaluate(code: string): Promise<any>;
  export function transpile(code: string): string;
}

declare module 'superdough' {
  export function initAudioOnFirstClick(): Promise<AudioContext>;
  export function getAudioContext(): AudioContext;
  export function samples(url: string, options?: { tag?: string }): Promise<void>;
  export function superdough(
    value: any,
    deadline: number,
    duration?: number,
    cps?: number,
    gain?: number
  ): Promise<void>;
}
