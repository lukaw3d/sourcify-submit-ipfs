// Simple browser-compatible logger
export interface Logger {
  debug: (message: string, metadata?: Record<string, unknown>) => void;
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
  child: (options: { moduleName?: string }) => Logger;
}

class BrowserLogger implements Logger {
  private moduleName: string;

  constructor(moduleName = "") {
    this.moduleName = moduleName;
  }

  child(options: { moduleName?: string }): Logger {
    const newModuleName = options.moduleName || this.moduleName;
    return new BrowserLogger(newModuleName);
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    console.debug(`[${this.moduleName}] ${message}`, metadata || {});
  }

  info(message: string, metadata?: Record<string, unknown>) {
    console.info(`[${this.moduleName}] ${message}`, metadata || {});
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    console.warn(`[${this.moduleName}] ${message}`, metadata || {});
  }

  error(message: string, metadata?: Record<string, unknown>) {
    console.error(`[${this.moduleName}] ${message}`, metadata || {});
  }
}

const logger = new BrowserLogger("Monitor");
export default logger;

