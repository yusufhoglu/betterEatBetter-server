export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
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
  create(input: CreateUserInput): Promise<User>;
  updateProfile(input: UpdateUserProfileInput): Promise<User>;
  deleteById(id: string): Promise<void>;
}
