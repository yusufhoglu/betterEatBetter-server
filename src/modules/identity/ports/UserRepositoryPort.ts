export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  deleteById(id: string): Promise<void>;
}
