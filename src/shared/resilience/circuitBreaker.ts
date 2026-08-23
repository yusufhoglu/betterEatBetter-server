// TODO: Dis servis cagrilarini saran genel circuit breaker wrapper
export function withCircuitBreaker<T>(fn: () => Promise<T>): () => Promise<T> {
  return fn;
}
