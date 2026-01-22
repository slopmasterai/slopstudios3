/**
 * Utility Types
 * Common TypeScript utility types for the Slop Studios 3 codebase
 */

// =============================================================================
// Object Manipulation
// =============================================================================

/**
 * Makes all properties of T deeply partial
 */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

/**
 * Makes all properties of T deeply required
 */
export type DeepRequired<T> = T extends object
  ? { [P in keyof T]-?: DeepRequired<T[P]> }
  : T;

/**
 * Makes all properties of T deeply readonly
 */
export type DeepReadonly<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;

/**
 * Makes all properties of T mutable (removes readonly)
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Makes specified properties of T optional
 */
export type OptionalProps<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specified properties of T required
 */
export type RequiredProps<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Picks properties from T that are of type V
 */
export type PickByType<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K];
};

/**
 * Omits properties from T that are of type V
 */
export type OmitByType<T, V> = {
  [K in keyof T as T[K] extends V ? never : K]: T[K];
};

/**
 * Gets the keys of T that are of type V
 */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Makes specified properties nullable
 */
export type Nullable<T, K extends keyof T = keyof T> = {
  [P in keyof T]: P extends K ? T[P] | null : T[P];
};

/**
 * Removes null and undefined from all properties
 */
export type NonNullableProps<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

// =============================================================================
// Function Types
// =============================================================================

/**
 * Extracts the parameters of a function type as a tuple
 */
export type FunctionParams<T extends (...args: unknown[]) => unknown> = T extends (
  ...args: infer P
) => unknown
  ? P
  : never;

/**
 * Extracts the return type of a function type
 */
export type FunctionReturn<T extends (...args: unknown[]) => unknown> = T extends (
  ...args: unknown[]
) => infer R
  ? R
  : never;

/**
 * Makes a function async if it isn't already
 */
export type AsyncFunction<T extends (...args: unknown[]) => unknown> = (
  ...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>>>;

/**
 * Extracts the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Creates a function type that returns void
 */
export type VoidFunction<T extends (...args: unknown[]) => unknown> = (
  ...args: Parameters<T>
) => void;

// =============================================================================
// Array Types
// =============================================================================

/**
 * Gets the element type of an array
 */
export type ArrayElement<T extends readonly unknown[]> = T extends readonly (infer E)[]
  ? E
  : never;

/**
 * Ensures a type is an array
 */
export type Arrayify<T> = T extends unknown[] ? T : T[];

/**
 * Creates a tuple of length N with elements of type T
 */
export type TupleOf<T, N extends number, R extends T[] = []> = R['length'] extends N
  ? R
  : TupleOf<T, N, [T, ...R]>;

/**
 * Non-empty array type
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Readonly non-empty array
 */
export type ReadonlyNonEmptyArray<T> = readonly [T, ...T[]];

// =============================================================================
// String Types
// =============================================================================

/**
 * Capitalizes the first letter of a string type
 */
export type Capitalize<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${R}`
  : S;

/**
 * Converts a string type to lowercase
 */
export type Lowercase<S extends string> = S extends `${infer F}${infer R}`
  ? `${Lowercase<F>}${Lowercase<R>}`
  : S;

/**
 * Joins string literal types with a separator
 */
export type Join<T extends string[], Sep extends string = ''> = T extends []
  ? ''
  : T extends [infer F extends string]
    ? F
    : T extends [infer F extends string, ...infer R extends string[]]
      ? `${F}${Sep}${Join<R, Sep>}`
      : string;

/**
 * Splits a string type by a separator
 */
export type Split<S extends string, Sep extends string> = S extends `${infer H}${Sep}${infer T}`
  ? [H, ...Split<T, Sep>]
  : S extends ''
    ? []
    : [S];

// =============================================================================
// Union Types
// =============================================================================

/**
 * Gets the last element of a union type
 */
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * Excludes null and undefined from a union type
 */
export type NonNullableUnion<T> = T extends null | undefined ? never : T;

/**
 * Creates a union of all possible combinations of an object's values
 */
export type ValueOf<T> = T[keyof T];

/**
 * Creates a discriminated union type
 */
export type DiscriminatedUnion<T, K extends keyof T, V extends T[K]> = T extends { [key in K]: V }
  ? T
  : never;

// =============================================================================
// State Machine Types
// =============================================================================

/**
 * Defines a state machine state with metadata
 */
export interface StateMachineState<S extends string, D = unknown> {
  status: S;
  data?: D;
  error?: string;
  timestamp: string;
}

/**
 * Creates a discriminated union for state machine states
 */
export type StateUnion<
  States extends Record<string, unknown>
> = {
  [K in keyof States]: { status: K; data: States[K] };
}[keyof States];

/**
 * Workflow status type
 */
export type WorkflowStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Agent status type
 */
export type AgentStatus = 'idle' | 'busy' | 'error' | 'offline';

/**
 * Process status type
 */
export type ProcessStatus = 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';

// =============================================================================
// Result Types
// =============================================================================

/**
 * Success result type
 */
export interface Success<T> {
  success: true;
  data: T;
}

/**
 * Failure result type
 */
export interface Failure<E = string> {
  success: false;
  error: E;
}

/**
 * Result type that can be either success or failure
 */
export type Result<T, E = string> = Success<T> | Failure<E>;

/**
 * Creates a success result
 */
export function success<T>(data: T): Success<T> {
  return { success: true, data };
}

/**
 * Creates a failure result
 */
export function failure<E = string>(error: E): Failure<E> {
  return { success: false, error };
}

/**
 * Checks if a result is a success
 */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.success;
}

/**
 * Checks if a result is a failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return !result.success;
}

/**
 * Maps a successful result
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (isSuccess(result)) {
    return success(fn(result.data));
  }
  return result;
}

/**
 * Chains result operations
 */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> {
  if (isSuccess(result)) {
    return fn(result.data);
  }
  return result;
}

// =============================================================================
// Optional / Maybe Types
// =============================================================================

/**
 * Maybe type - represents a value that might not exist
 */
export type Maybe<T> = T | null | undefined;

/**
 * Checks if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: Maybe<T>): value is T {
  return value !== null && value !== undefined;
}

/**
 * Gets the value or a default
 */
export function getOrDefault<T>(value: Maybe<T>, defaultValue: T): T {
  return isDefined(value) ? value : defaultValue;
}

/**
 * Maps a maybe value
 */
export function mapMaybe<T, U>(value: Maybe<T>, fn: (v: T) => U): Maybe<U> {
  return isDefined(value) ? fn(value) : value;
}

// =============================================================================
// Async Types
// =============================================================================

/**
 * Represents a value that is either synchronous or asynchronous
 */
export type MaybeAsync<T> = T | Promise<T>;

/**
 * Represents a function that returns either sync or async
 */
export type MaybeAsyncFunction<T extends (...args: unknown[]) => unknown> = (
  ...args: Parameters<T>
) => MaybeAsync<ReturnType<T>>;

/**
 * Ensures a value is wrapped in a promise
 */
export async function ensureAsync<T>(value: MaybeAsync<T>): Promise<T> {
  return value;
}

// =============================================================================
// Record Types
// =============================================================================

/**
 * Creates a record with string keys and values of type T
 */
export type StringRecord<T> = Record<string, T>;

/**
 * Creates a record with number keys and values of type T
 */
export type NumberRecord<T> = Record<number, T>;

/**
 * Creates a partial record
 */
export type PartialRecord<K extends keyof never, T> = Partial<Record<K, T>>;

/**
 * Merges two object types, with the second taking precedence
 */
export type Merge<T, U> = Omit<T, keyof U> & U;

/**
 * Deep merge of two object types
 */
export type DeepMerge<T, U> = T extends object
  ? U extends object
    ? {
        [K in keyof T | keyof U]: K extends keyof U
          ? K extends keyof T
            ? DeepMerge<T[K], U[K]>
            : U[K]
          : K extends keyof T
            ? T[K]
            : never;
      }
    : U
  : U;

// =============================================================================
// JSON Types
// =============================================================================

/**
 * JSON primitive types
 */
export type JSONPrimitive = string | number | boolean | null;

/**
 * JSON array type
 */
export type JSONArray = JSONValue[];

/**
 * JSON object type
 */
export type JSONObject = { [key: string]: JSONValue };

/**
 * Any valid JSON value
 */
export type JSONValue = JSONPrimitive | JSONArray | JSONObject;

/**
 * Makes a type JSON serializable
 */
export type Serializable<T> = T extends JSONValue
  ? T
  : T extends { toJSON(): infer R }
    ? R
    : T extends object
      ? { [K in keyof T]: Serializable<T[K]> }
      : never;

// =============================================================================
// Event Types
// =============================================================================

/**
 * Event handler type
 */
export type EventHandler<T = void> = (event: T) => void | Promise<void>;

/**
 * Event emitter type
 */
export interface EventEmitter<Events extends Record<string, unknown>> {
  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void;
  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void;
  emit<K extends keyof Events>(event: K, data: Events[K]): void;
}

/**
 * Typed event map
 */
export type EventMap<T extends Record<string, unknown>> = {
  [K in keyof T]: EventHandler<T[K]>;
};

// =============================================================================
// Assertion Types
// =============================================================================

/**
 * Asserts that a condition is true at compile time
 */
export type Assert<T extends true> = T;

/**
 * Checks if two types are equal
 */
export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;

/**
 * Checks if a type extends another
 */
export type Extends<T, U> = T extends U ? true : false;

export default {
  success,
  failure,
  isSuccess,
  isFailure,
  mapResult,
  flatMapResult,
  isDefined,
  getOrDefault,
  mapMaybe,
  ensureAsync,
};
