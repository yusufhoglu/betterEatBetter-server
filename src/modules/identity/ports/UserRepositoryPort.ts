export interface User {
  id: string;
  email: string;
  /** Null for users who only ever signed in through a social provider. */
  passwordHash: string | null;
  /** Google account `sub` claim, once a Google sign-in has been linked. */
  googleSub: string | null;
  name: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash?: string | null;
  googleSub?: string | null;
  name?: string | null;
  username?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface UpdateUserProfileInput {
  id: string;
  name?: string | null;
  username?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByGoogleSub(googleSub: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  /** Attaches a Google `sub` to an existing account (automatic account linking). */
  linkGoogleAccount(id: string, googleSub: string): Promise<User>;
  updateProfile(input: UpdateUserProfileInput): Promise<User>;
  deleteById(id: string): Promise<void>;
}
