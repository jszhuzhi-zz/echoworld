import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export type UserRole = 'admin' | 'investor' | 'observer';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  entityId?: string; // Linked game entity for investors
  createdAt: string;
}

export interface UserPublic {
  id: string;
  username: string;
  role: UserRole;
  entityId?: string;
  createdAt: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'echoworld-secret-key-2026';
const DATA_FILE = path.join(process.cwd(), 'data', 'users.json');

class UserStore {
  private users: Map<string, User> = new Map();

  constructor() {
    this.load();
    // Create default admin if none exists
    if (!this.findByUsername('admin')) {
      const hash = bcrypt.hashSync('admin888', 10);
      const admin: User = {
        id: uuidv4(),
        username: 'admin',
        passwordHash: hash,
        role: 'admin',
        createdAt: new Date().toISOString(),
      };
      this.users.set(admin.id, admin);
      this.save();
    }
  }

  private load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        for (const u of data) {
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
      username: u.username,
      role: u.role,
      entityId: u.entityId,
      createdAt: u.createdAt,
    }));
  }

  createUser(username: string, password: string, role: UserRole): User {
    if (this.findByUsername(username)) {
      throw new Error('用户名已存在');
    }
    const user: User = {
      id: uuidv4(),
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      role,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    this.save();
    return user;
  }

  updateUser(id: string, updates: Partial<Pick<User, 'role' | 'entityId'>>) {
    const user = this.users.get(id);
    if (!user) throw new Error('用户不存在');
    if (updates.role) user.role = updates.role;
    if (updates.entityId !== undefined) user.entityId = updates.entityId;
    this.save();
    return user;
  }

  deleteUser(id: string) {
    this.users.delete(id);
    this.save();
  }

  login(username: string, password: string): string {
    const user = this.findByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      throw new Error('用户名或密码错误');
    }
    return jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  verifyToken(token: string): { userId: string; username: string; role: UserRole } {
    return jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: UserRole };
  }
}

export const userStore = new UserStore();
