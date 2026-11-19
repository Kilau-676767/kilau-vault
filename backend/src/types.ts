export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export interface Variables {
  userId: string;
  email: string;
  username: string;
}

export type AppContext = {
  Bindings: Env;
  Variables: Variables;
};
