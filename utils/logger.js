/**
 * Colored Console Logger with CMYK Style
 * 
 * ANSI Color Codes:
 * - Cyan (C): \x1b[36m
 * - Magenta (M): \x1b[35m
 * - Yellow (Y): \x1b[33m
 * - Black/Key (K): \x1b[30m
 * - White: \x1b[37m
 * - Reset: \x1b[0m
 * - Bold: \x1b[1m
 * - Background colors: add 10 to foreground code (e.g., \x1b[46m for cyan bg)
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  
  // CMYK Colors
  cyan: '\x1b[36m',      // C
  magenta: '\x1b[35m',   // M
  yellow: '\x1b[33m',    // Y
  black: '\x1b[30m',     // K
  
  // Additional
  white: '\x1b[37m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  
  // Backgrounds
  bgCyan: '\x1b[46m',
  bgMagenta: '\x1b[45m',
  bgYellow: '\x1b[43m',
  bgBlack: '\x1b[40m',
};

/**
 * Get current timestamp
 */
const getTimestamp = () => {
  const now = new Date();
  return now.toLocaleString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

/**
 * Success log (Green with Cyan accent)
 */
const logSuccess = (message, ...args) => {
  console.log(
    `${colors.gray}[${getTimestamp()}]${colors.reset} ` +
    `${colors.green}${colors.bold}✓${colors.reset} ` +
    `${colors.cyan}${message}${colors.reset}`,
    ...args
  );
};

/**
 * Error log (Red with Magenta accent)
 */
const logError = (message, ...args) => {
  console.error(
    `${colors.gray}[${getTimestamp()}]${colors.reset} ` +
    `${colors.red}${colors.bold}✗${colors.reset} ` +
    `${colors.magenta}${message}${colors.reset}`,
    ...args
  );
};

/**
 * Info log (Blue with Cyan accent)
 */
const logInfo = (message, ...args) => {
  console.log(
    `${colors.gray}[${getTimestamp()}]${colors.reset} ` +
    `${colors.blue}${colors.bold}ℹ${colors.reset} ` +
    `${colors.cyan}${message}${colors.reset}`,
    ...args
  );
};

/**
 * Warning log (Yellow)
 */
const logWarning = (message, ...args) => {
  console.warn(
    `${colors.gray}[${getTimestamp()}]${colors.reset} ` +
    `${colors.yellow}${colors.bold}⚠${colors.reset} ` +
    `${colors.yellow}${message}${colors.reset}`,
    ...args
  );
};

/**
 * Debug log (Gray/Black)
 */
const logDebug = (message, ...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `${colors.gray}[${getTimestamp()}]${colors.reset} ` +
      `${colors.gray}◆${colors.reset} ` +
      `${colors.gray}${message}${colors.reset}`,
      ...args
    );
  }
};

/**
 * CMYK Banner (for startup)
 */
const logBanner = (text) => {
  console.log('\n' + colors.cyan + '╔' + '═'.repeat(text.length + 2) + '╗' + colors.reset);
  console.log(colors.cyan + '║ ' + colors.bold + colors.magenta + text + colors.reset + colors.cyan + ' ║' + colors.reset);
  console.log(colors.cyan + '╚' + '═'.repeat(text.length + 2) + '╝' + colors.reset + '\n');
};

/**
 * Server start log with CMYK style
 */
const logServerStart = (port) => {
  console.log('\n' + colors.bold + colors.cyan + '━'.repeat(50) + colors.reset);
  console.log(
    colors.bold + colors.magenta + '  🎨 INDIEGO ART - MANAGEMENT SYSTEM  ' + colors.reset
  );
  console.log(colors.bold + colors.cyan + '━'.repeat(50) + colors.reset + '\n');
  
  console.log(`${colors.cyan}➜${colors.reset} ${colors.bold}Server running on:${colors.reset} ${colors.yellow}http://localhost:${port}${colors.reset}`);
  console.log(`${colors.cyan}➜${colors.reset} ${colors.bold}Environment:${colors.reset} ${colors.magenta}${process.env.NODE_ENV || 'development'}${colors.reset}`);
  console.log(`${colors.cyan}➜${colors.reset} ${colors.bold}Time:${colors.reset} ${colors.gray}${getTimestamp()}${colors.reset}\n`);
  
  console.log(colors.bold + colors.cyan + '━'.repeat(50) + colors.reset + '\n');
};

/**
 * Database connection log
 */
const logDatabase = (status, message) => {
  if (status === 'success') {
    console.log(
      `${colors.green}${colors.bold}✓${colors.reset} ` +
      `${colors.cyan}Database:${colors.reset} ` +
      `${colors.green}${message}${colors.reset}`
    );
  } else {
    console.error(
      `${colors.red}${colors.bold}✗${colors.reset} ` +
      `${colors.magenta}Database:${colors.reset} ` +
      `${colors.red}${message}${colors.reset}`
    );
  }
};

module.exports = {
  logSuccess,
  logError,
  logInfo,
  logWarning,
  logDebug,
  logBanner,
  logServerStart,
  logDatabase,
  colors
};
