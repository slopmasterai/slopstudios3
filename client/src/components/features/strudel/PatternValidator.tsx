import { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidationError {
  message: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
}

interface ValidationWarning {
  message: string;
  code?: string;
}

interface PatternValidatorProps {
  code: string;
  onValidationChange?: (isValid: boolean, errors: ValidationError[], warnings: ValidationWarning[]) => void;
  className?: string;
  showInline?: boolean;
  debounceMs?: number;
}

/**
 * Real-time pattern syntax validator
 * Provides inline error messages and suggestions as you type
 */
export function PatternValidator({
  code,
  onValidationChange,
  className,
  showInline = true,
  debounceMs = 300,
}: PatternValidatorProps) {
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Validate bracket matching
  const validateBrackets = useCallback((input: string): ValidationError[] => {
    const bracketErrors: ValidationError[] = [];
    const stack: { char: string; index: number }[] = [];
    const pairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '<': '>',
    };
    const closers = new Set(Object.values(pairs));

    let inString = false;
    let stringChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      // Track string state
      if ((char === '"' || char === "'") && (i === 0 || input[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      if (char in pairs) {
        stack.push({ char, index: i });
      } else if (closers.has(char)) {
        const expected = Object.entries(pairs).find(([, v]) => v === char)?.[0];
        if (stack.length === 0) {
          bracketErrors.push({
            message: `Unexpected closing bracket '${char}'`,
            column: i + 1,
            code: 'UNMATCHED_BRACKET',
            suggestion: `Remove this bracket or add an opening '${expected}'`,
          });
        } else {
          const last = stack.pop()!;
          if (pairs[last.char] !== char) {
            bracketErrors.push({
              message: `Mismatched brackets: expected '${pairs[last.char]}' but found '${char}'`,
              column: i + 1,
              code: 'MISMATCHED_BRACKET',
              suggestion: `Change '${char}' to '${pairs[last.char]}'`,
            });
          }
        }
      }
    }

    // Report unclosed brackets
    for (const unclosed of stack) {
      bracketErrors.push({
        message: `Unclosed bracket '${unclosed.char}'`,
        column: unclosed.index + 1,
        code: 'UNCLOSED_BRACKET',
        suggestion: `Add closing '${pairs[unclosed.char]}'`,
      });
    }

    return bracketErrors;
  }, []);

  // Validate string quotes
  const validateStrings = useCallback((input: string): ValidationError[] => {
    const stringErrors: ValidationError[] = [];
    let inString = false;
    let stringChar = '';
    let stringStart = 0;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === '"' || char === "'") && (i === 0 || input[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
          stringStart = i;
        } else if (char === stringChar) {
          inString = false;
        }
      }
    }

    if (inString) {
      stringErrors.push({
        message: `Unclosed string starting at column ${stringStart + 1}`,
        column: stringStart + 1,
        code: 'UNCLOSED_STRING',
        suggestion: `Add closing ${stringChar}`,
      });
    }

    return stringErrors;
  }, []);

  // Check for common issues
  const checkCommonIssues = useCallback((input: string): ValidationWarning[] => {
    const issueWarnings: ValidationWarning[] = [];

    // Very short pattern
    if (input.trim().length > 0 && input.trim().length < 5) {
      issueWarnings.push({
        message: 'Pattern is very short - it may not produce meaningful output',
        code: 'SHORT_PATTERN',
      });
    }

    // Check for common typos
    const typoPatterns = [
      { pattern: /\bsound\b(?!\()/, message: 'Did you mean sound()?' },
      { pattern: /\bnote\b(?!\()/, message: 'Did you mean note()?' },
      { pattern: /\bfast\b(?!\()/, message: 'Did you mean .fast()?' },
      { pattern: /\bslow\b(?!\()/, message: 'Did you mean .slow()?' },
    ];

    for (const { pattern, message } of typoPatterns) {
      if (pattern.test(input)) {
        issueWarnings.push({ message, code: 'POSSIBLE_TYPO' });
      }
    }

    // Check for deprecated patterns
    if (/\bstut\b/.test(input)) {
      issueWarnings.push({
        message: 'stut is deprecated, use echo instead',
        code: 'DEPRECATED_PATTERN',
      });
    }

    return issueWarnings;
  }, []);

  // Basic syntax validation
  const validateSyntax = useCallback((input: string): ValidationError[] => {
    const syntaxErrors: ValidationError[] = [];

    // Check for basic JavaScript syntax errors
    try {
      // Try to parse as an expression
      // We wrap in parentheses to handle object literals
      new Function(`return (${input})`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);

      // Extract line/column if available
      const match = errorMessage.match(/at position (\d+)/i);
      const position = match ? parseInt(match[1], 10) : undefined;

      syntaxErrors.push({
        message: errorMessage.replace(/^.*?:/, 'Syntax error:'),
        column: position,
        code: 'SYNTAX_ERROR',
        suggestion: 'Check for missing quotes, brackets, or function calls',
      });
    }

    return syntaxErrors;
  }, []);

  // Main validation function
  const validate = useCallback((input: string) => {
    if (!input.trim()) {
      setErrors([]);
      setWarnings([]);
      onValidationChange?.(true, [], []);
      return;
    }

    setIsValidating(true);

    const bracketErrors = validateBrackets(input);
    const stringErrors = validateStrings(input);
    const syntaxErrors = bracketErrors.length === 0 && stringErrors.length === 0
      ? validateSyntax(input)
      : [];
    const allErrors = [...bracketErrors, ...stringErrors, ...syntaxErrors];

    const issueWarnings = checkCommonIssues(input);

    setErrors(allErrors);
    setWarnings(issueWarnings);
    setIsValidating(false);

    onValidationChange?.(allErrors.length === 0, allErrors, issueWarnings);
  }, [validateBrackets, validateStrings, validateSyntax, checkCommonIssues, onValidationChange]);

  // Debounced validation
  useEffect(() => {
    const timer = setTimeout(() => {
      validate(code);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [code, debounceMs, validate]);

  // Compute validation status
  const status = useMemo(() => {
    if (!code.trim()) return 'empty';
    if (isValidating) return 'validating';
    if (errors.length > 0) return 'error';
    if (warnings.length > 0) return 'warning';
    return 'valid';
  }, [code, isValidating, errors, warnings]);

  if (!showInline) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Status indicator */}
      <div className="flex items-center gap-2 text-sm">
        {status === 'valid' && (
          <>
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-green-600">Pattern syntax is valid</span>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-red-600">
              {errors.length} error{errors.length !== 1 ? 's' : ''} found
            </span>
          </>
        )}
        {status === 'warning' && (
          <>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="text-yellow-600">
              {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {status === 'validating' && (
          <>
            <Info className="h-4 w-4 text-blue-500 animate-pulse" />
            <span className="text-blue-600">Validating...</span>
          </>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((error, index) => (
            <div
              key={index}
              className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p>{error.message}</p>
                {error.column && (
                  <p className="text-xs text-red-500">Column {error.column}</p>
                )}
                {error.suggestion && (
                  <p className="text-xs text-red-600 mt-1">
                    Suggestion: {error.suggestion}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && errors.length === 0 && (
        <div className="space-y-1">
          {warnings.map((warning, index) => (
            <div
              key={index}
              className="flex items-start gap-2 rounded-md bg-yellow-50 p-2 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>{warning.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PatternValidator;
