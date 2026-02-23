import * as fs from 'fs';
import * as path from 'path';

/**
 * 统一数据目录配置
 * 通过 DATA_DIR 环境变量可将数据存储到代码目录之外，
 * 升级代码时不会丢失历史数据。
 *
 * 默认: <项目根>/data
 * 推荐生产环境: DATA_DIR=/var/echoworld/data
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/** 确保数据目录存在 */
export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[DataDir] 创建数据目录: ${DATA_DIR}`);
  }
}

/** 获取数据文件的完整路径 */
export function dataFile(filename: string): string {
  return path.join(DATA_DIR, filename);
}
