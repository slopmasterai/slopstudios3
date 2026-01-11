/**
 * Type declarations for Strudel and web-audio-engine modules
 * These are ESM-only packages without TypeScript declarations
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */

declare module 'web-audio-engine' {
  export class OfflineAudioContext {
    constructor(numberOfChannels: number, length: number, sampleRate: number);
    readonly destination: AudioDestinationNode;
    readonly sampleRate: number;
    readonly currentTime: number;
    createOscillator(): OscillatorNode;
    createGain(): GainNode;
    createChannelMerger(numberOfInputs?: number): ChannelMergerNode;
    createChannelSplitter(numberOfOutputs?: number): ChannelSplitterNode;
    startRendering(): Promise<AudioBuffer>;
  }

  export interface AudioBuffer {
    readonly length: number;
    readonly numberOfChannels: number;
    readonly sampleRate: number;
    getChannelData(channel: number): Float32Array;
  }

  export interface AudioDestinationNode {
    readonly numberOfInputs: number;
    readonly numberOfOutputs: number;
  }

  export interface AudioNode {
    connect(
      destination: AudioNode | AudioParam,
      outputIndex?: number,
      inputIndex?: number
    ): AudioNode;
    disconnect(): void;
  }

  export interface OscillatorNode extends AudioNode {
    type: 'sine' | 'square' | 'sawtooth' | 'triangle';
    frequency: AudioParam;
    start(when?: number): void;
    stop(when?: number): void;
  }

  export interface GainNode extends AudioNode {
    gain: AudioParam;
  }

  export interface ChannelMergerNode extends AudioNode {}
  export interface ChannelSplitterNode extends AudioNode {}

  export interface AudioParam {
    value: number;
    setValueAtTime(value: number, startTime: number): AudioParam;
    linearRampToValueAtTime(value: number, endTime: number): AudioParam;
    exponentialRampToValueAtTime(value: number, endTime: number): AudioParam;
  }
}

declare module '@strudel/transpiler' {
  /**
   * Evaluates Strudel code and returns a Pattern
   */
  export function evaluate(code: string): Promise<Pattern>;

  /**
   * The transpiler function for Strudel mini-notation
   */
  export function transpiler(code: string): string;
}

declare module '@strudel/core' {
  export interface Fraction {
    valueOf(): number;
    toFraction(): string;
  }

  export class TimeSpan {
    constructor(begin: number | Fraction, end: number | Fraction);
    begin: Fraction;
    end: Fraction;
  }

  export class State {
    constructor(span: TimeSpan);
    span: TimeSpan;
  }

  export interface Hap {
    whole: TimeSpan;
    part: TimeSpan;
    value: any;
    hasOnset(): boolean;
    combineContext(other: Hap): any;
  }

  export class Pattern {
    _Pattern: boolean;
    query(state: State): Hap[];
    firstCycle(stripContext?: boolean): Hap[];
    withValue(func: (value: any) => any): Pattern;
    fmap(func: (value: any) => any): Pattern;
  }

  // Export common pattern functions
  export function silence(): Pattern;
  export function pure(value: any): Pattern;
  export function stack(...patterns: Pattern[]): Pattern;
  export function cat(...patterns: Pattern[]): Pattern;
  export function seq(...patterns: Pattern[]): Pattern;
  export function s(pattern: string): Pattern;
  export function note(pattern: string): Pattern;
  export function n(pattern: string): Pattern;
  export function sound(pattern: string): Pattern;
  export function freq(pattern: string | number): Pattern;
  export function gain(pattern: string | number): Pattern;
  export function pan(pattern: string | number): Pattern;

  // Logger and repl
  export const logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };

  export function repl(options?: any): any;
  export function evaluate(code: string, transpiler?: any): Promise<Pattern>;
}

declare module '@strudel/mini' {
  // Side-effect only import that registers mini-notation with Pattern prototype
}

declare module '@strudel/webaudio' {
  export function webaudioOutput(hap: any, time: number, cps: number, duration: number): void;
  export function webaudioRepl(options?: any): any;
  export function getAudioContext(): AudioContext;
}
