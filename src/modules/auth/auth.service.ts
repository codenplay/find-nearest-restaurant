import type { Role } from '../../types/index.js';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password');
  }
}

export interface DemoUser {
  username: string;
  password: string;
  role: Role;
}

/**
 * Demo credential store, backed by env config. This is the seam to swap for a real identity
 * provider (e.g. an OIDC/SSO integration) in production - callers only depend on
 * `authenticate(username, password): Role`.
 */
export class AuthService {
  constructor(private readonly users: DemoUser[]) {}

  authenticate(username: string, password: string): Role {
    const user = this.users.find((u) => u.username === username);
    if (!user || user.password !== password) {
      throw new InvalidCredentialsError();
    }
    return user.role;
  }
}
