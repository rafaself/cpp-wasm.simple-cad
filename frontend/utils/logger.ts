type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LoggerOptions = {
  minLevel?: LogLevel;
};

type Logger = {
  debug: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_MIN_LEVEL = (import.meta.env.VITE_UI_LOG_LEVEL as LogLevel | undefined) ?? 'info';
const LOG_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_UI_LOGS !== 'false';

const formatPrefix = (level: LogLevel, tag: string) =>
  `[${new Date().toISOString()}][${level.toUpperCase()}][${tag}]`;

const writerForLevel = (level: LogLevel) => {
  switch (level) {
    case 'warn':
      // eslint-disable-next-line no-console
      return console.warn;
    case 'error':
      // eslint-disable-next-line no-console
      return console.error;
    default:
      // eslint-disable-next-line no-console
      return console.log;
  }
};

const shouldLog = (level: LogLevel, minLevel: LogLevel) =>
  LOG_ENABLED && LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];

export const createLogger = (tag: string, options?: LoggerOptions): Logger => {
  const minLevel = options?.minLevel ?? DEFAULT_MIN_LEVEL;

  const log = (level: LogLevel, message: string, meta?: unknown) => {
    if (!shouldLog(level, minLevel)) {
      return;
    }

    const write = writerForLevel(level);
    const prefix = formatPrefix(level, tag);

    if (typeof meta === 'undefined') {
      write(prefix, message);
      return;
    }

    write(prefix, message, meta);
  };

  return {
    debug: (message: string, meta?: unknown) => log('debug', message, meta),
    info: (message: string, meta?: unknown) => log('info', message, meta),
    warn: (message: string, meta?: unknown) => log('warn', message, meta),
    error: (message: string, meta?: unknown) => log('error', message, meta),
  };
};

export const uiLogger = createLogger('ui');
