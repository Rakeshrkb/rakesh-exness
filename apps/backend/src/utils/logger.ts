import { appendFileSync, mkdirSync, existsSync } from "fs";
import { readdirSync, unlinkSync, statSync } from "fs";
import { join } from "path";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

const LOG_DIR = join(process.cwd(), "logs");

// ensure logs/ directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFilePath(level: LogLevel): string {
  const date = new Date().toISOString().slice(0, 10); // "2026-04-02"
  if (level === "ERROR") {
    return join(LOG_DIR, `error-${date}.log`);
  }
  return join(LOG_DIR, `combined-${date}.log`);
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta !== undefined ? ` | ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
}

function writeToFile(level: LogLevel, formatted: string) {
  try {
    appendFileSync(getLogFilePath(level), formatted);
    // errors also go into combined log
    if (level === "ERROR") {
      appendFileSync(getLogFilePath("INFO"), formatted);
    }
  } catch (err) {
    console.error("[Logger] Failed to write to log file:", err);
  }
}

function log(level: LogLevel, message: string, meta?: unknown) {
  const formatted = formatMessage(level, message, meta);
  // trim the time to reduce for terminal output, but keep full timestamp in file
 const terminal = formatted.replace(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] /, "");

  // always print to console too
  if (level === "ERROR") process.stderr.write(formatted);
  else process.stdout.write(terminal);

  writeToFile(level, formatted);
}

export const logger = {
  info:  (message: string, meta?: unknown) => log("INFO",  message, meta),
  warn:  (message: string, meta?: unknown) => log("WARN",  message, meta),
  error: (message: string, meta?: unknown) => log("ERROR", message, meta),
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== "production") {
      log("DEBUG", message, meta);
    }
  },
};



function cleanOldLogs(daysToKeep = 7) {
  const files = readdirSync(LOG_DIR);
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

  for (const file of files) {
    const filePath = join(LOG_DIR, file);
    const { mtimeMs } = statSync(filePath);
    if (mtimeMs < cutoff) {
      unlinkSync(filePath);
      console.log(`[Logger] Deleted old log: ${file}`);
    }
  }
}

// call once at startup
cleanOldLogs(7);