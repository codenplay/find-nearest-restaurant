export type Role = 'admin' | 'user';

export interface Restaurant {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  radius: number;
  openingHours: string;
  image: string;
}

export interface AuthUser {
  username: string;
  role: Role;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { username: string; role: Role };
    user: { username: string; role: Role };
  }
}
