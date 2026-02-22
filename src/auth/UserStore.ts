import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export type UserRole = 'admin' | 'investor' | 'observer';

export interface User {
  id: string;
  email: string;              // 邮箱 (唯一登录ID)
  nickname: string;           // 昵称 (唯一, 显示名)
  username: string;           // 保留兼容 (= nickname)
  passwordHash: string;
  role: UserRole;
  entityId?: string; // Linked game entity for investors
  createdAt: string;
  referralCode: string;       // 邀请码 (唯一)
  invitedBy?: string;         // 邀请者的userId
  hasRecharged: boolean;      // 是否已首充
  totalRecharged: number;     // 累计充值金额
}

export interface UserPublic {
  id: string;
  email: string;
  nickname: string;
  username: string;
  role: UserRole;
  entityId?: string;
  createdAt: string;
  referralCode: string;
  invitedBy?: string;
  hasRecharged: boolean;
  totalRecharged: number;
}

/** Email verification code storage */
interface VerificationCode {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number; // prevent brute force
}

const JWT_SECRET = process.env.JWT_SECRET || 'echoworld-secret-key-2026';
const DATA_FILE = path.join(process.cwd(), 'data', 'users.json');

function generateReferralCode(): string {
  return uuidv4().slice(0, 8).toUpperCase();
}

class UserStore {
  private users: Map<string, User> = new Map();
  private verificationCodes: Map<string, VerificationCode> = new Map(); // key = email

  constructor() {
    this.load();
    // Create default admin if none exists
    if (!this.findByUsername('admin')) {
      const hash = bcrypt.hashSync('admin888', 10);
      const admin: User = {
        id: uuidv4(),
        email: 'jszhuzhi@gmail.com',
        nickname: 'Admin',
        username: 'admin',
        passwordHash: hash,
        role: 'admin',
        createdAt: new Date().toISOString(),
        referralCode: generateReferralCode(),
        hasRecharged: false,
        totalRecharged: 0,
      };
      this.users.set(admin.id, admin);
      this.save();
    } else {
      // 确保已有 admin 账号绑定了 email 和 nickname（兼容旧数据）
      const admin = this.findByUsername('admin')!;
      let needsSave = false;
      if (!admin.email) { admin.email = 'jszhuzhi@gmail.com'; needsSave = true; }
      if (!admin.nickname) { admin.nickname = 'Admin'; needsSave = true; }
      if (needsSave) this.save();
    }
    // Create default test investor if none exists
    if (!this.findByUsername('testplayer')) {
      const hash = bcrypt.hashSync('test123456', 10);
      const tester: User = {
        id: uuidv4(),
        email: 'test@echoworld.local',
        nickname: 'TestPlayer',
        username: 'testplayer',
        passwordHash: hash,
        role: 'investor',
        createdAt: new Date().toISOString(),
        referralCode: generateReferralCode(),
        hasRecharged: false,
        totalRecharged: 0,
      };
      this.users.set(tester.id, tester);
      this.save();
    }
  }

  private load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        for (const u of data) {
          // 兼容旧数据：补充新字段默认值
          if (!u.referralCode) u.referralCode = generateReferralCode();
          if (u.hasRecharged === undefined) u.hasRecharged = false;
          if (u.totalRecharged === undefined) u.totalRecharged = 0;
          if (!u.email) u.email = `${u.username}@echoworld.local`;
          if (!u.nickname) u.nickname = u.username;
          this.users.set(u.id, u);
        }
      }
    } catch {
      // Start fresh
    }
  }

  save() {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(this.users.values()), null, 2));
    } catch {
      // Ignore save errors
    }
  }

  findByUsername(username: string): User | undefined {
    for (const u of this.users.values()) {
      if (u.username === username) return u;
    }
    return undefined;
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  getAllUsers(): UserPublic[] {
    return Array.from(this.users.values()).map(u => ({
      id: u.id,
      email: u.email || `${u.username}@echoworld.local`,
      nickname: u.nickname || u.username,
      username: u.username,
      role: u.role,
      entityId: u.entityId,
      createdAt: u.createdAt,
      referralCode: u.referralCode || generateReferralCode(),
      invitedBy: u.invitedBy,
      hasRecharged: u.hasRecharged ?? false,
      totalRecharged: u.totalRecharged ?? 0,
    }));
  }

  findByEmail(email: string): User | undefined {
    const lower = email.toLowerCase();
    for (const u of this.users.values()) {
      if ((u.email || '').toLowerCase() === lower) return u;
    }
    return undefined;
  }

  findByNickname(nickname: string): User | undefined {
    const lower = nickname.toLowerCase();
    for (const u of this.users.values()) {
      if ((u.nickname || u.username).toLowerCase() === lower) return u;
    }
    return undefined;
  }

  findByReferralCode(code: string): User | undefined {
    for (const u of this.users.values()) {
      if (u.referralCode === code) return u;
    }
    return undefined;
  }

  createUser(email: string, nickname: string, password: string, role: UserRole, invitedBy?: string): User {
    if (this.findByEmail(email)) {
      throw new Error('EMAIL_EXISTS');
    }
    if (this.findByNickname(nickname)) {
      throw new Error('NICKNAME_EXISTS');
    }
    const user: User = {
      id: uuidv4(),
      email: email.toLowerCase(),
      nickname,
      username: nickname, // keep username = nickname for backward compat
      passwordHash: bcrypt.hashSync(password, 10),
      role,
      createdAt: new Date().toISOString(),
      referralCode: generateReferralCode(),
      invitedBy,
      hasRecharged: false,
      totalRecharged: 0,
    };
    this.users.set(user.id, user);
    this.save();
    return user;
  }

  updateUser(id: string, updates: Partial<Pick<User, 'role' | 'entityId' | 'hasRecharged' | 'totalRecharged'>>) {
    const user = this.users.get(id);
    if (!user) throw new Error('用户不存在');
    if (updates.role) user.role = updates.role;
    if (updates.entityId !== undefined) user.entityId = updates.entityId;
    if (updates.hasRecharged !== undefined) user.hasRecharged = updates.hasRecharged;
    if (updates.totalRecharged !== undefined) user.totalRecharged = updates.totalRecharged;
    this.save();
    return user;
  }

  deleteUser(id: string) {
    this.users.delete(id);
    this.save();
  }

  login(emailOrUsername: string, password: string): string {
    // Try email first, then username (backward compat)
    const user = this.findByEmail(emailOrUsername) || this.findByUsername(emailOrUsername);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      throw new Error('LOGIN_FAILED');
    }
    return jwt.sign(
      { userId: user.id, username: user.nickname || user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  // ============ EMAIL VERIFICATION ============

  /** Generate and store a 6-digit verification code for email */
  generateVerificationCode(email: string): string {
    const lower = email.toLowerCase();
    // Rate limit: if existing code not expired and < 60s old, reject
    const existing = this.verificationCodes.get(lower);
    if (existing && existing.expiresAt > Date.now() && (existing.expiresAt - 5 * 60 * 1000 + 60 * 1000) > Date.now()) {
      throw new Error('CODE_TOO_FREQUENT');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    this.verificationCodes.set(lower, {
      email: lower,
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
      attempts: 0,
    });
    return code;
  }

  /** Verify a code for email */
  verifyCode(email: string, code: string): boolean {
    const lower = email.toLowerCase();
    const vc = this.verificationCodes.get(lower);
    if (!vc) return false;
    if (vc.expiresAt < Date.now()) {
      this.verificationCodes.delete(lower);
      return false;
    }
    vc.attempts++;
    if (vc.attempts > 5) {
      this.verificationCodes.delete(lower);
      return false; // too many attempts
    }
    if (vc.code !== code) return false;
    // Success - remove code
    this.verificationCodes.delete(lower);
    return true;
  }

  /** Clean expired verification codes */
  cleanExpiredCodes() {
    const now = Date.now();
    for (const [email, vc] of this.verificationCodes) {
      if (vc.expiresAt < now) this.verificationCodes.delete(email);
    }
  }

  verifyToken(token: string): { userId: string; username: string; role: UserRole } {
    return jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: UserRole };
  }
}

export const userStore = new UserStore();
