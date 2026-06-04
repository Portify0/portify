import chalk from 'chalk';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

let currentLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

export function error(msg: string) {
  if (currentLevel >= LogLevel.ERROR) console.error(chalk.red('✖ ' + msg));
}

export function warn(msg: string) {
  if (currentLevel >= LogLevel.WARN) console.warn(chalk.yellow('⚠ ' + msg));
}

export function info(msg: string) {
  if (currentLevel >= LogLevel.INFO) console.log(chalk.blue('ℹ ' + msg));
}

export function success(msg: string) {
  if (currentLevel >= LogLevel.INFO) console.log(chalk.green('✔ ' + msg));
}

export function debug(msg: string) {
  if (currentLevel >= LogLevel.DEBUG) console.log(chalk.gray('🔍 ' + msg));
}

export function dim(msg: string) {
  if (currentLevel >= LogLevel.INFO) console.log(chalk.dim('  ' + msg));
}

export function blank() {
  if (currentLevel >= LogLevel.INFO) console.log("");
}
