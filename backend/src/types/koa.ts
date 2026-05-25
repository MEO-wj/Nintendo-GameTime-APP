export interface AuthUser {
  userId: string;
  email: string;
}

export interface AppState {
  authUser?: AuthUser;
}
