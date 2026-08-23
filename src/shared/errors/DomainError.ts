/**
 * Base class for the whole error taxonomy. A bare `throw new Error(...)` is
 * never used in module code — every thrown error extends this, carrying a
 * module-specific `code` (e.g. `IMAGE_UNREADABLE`) while the HTTP status
 * stays fixed per subclass.
 */
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
