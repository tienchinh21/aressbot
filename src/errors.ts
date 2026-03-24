export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  test?: boolean;
  test2?: boolean;

  constructor(status: number, code: string, message: string, details?: unknown, test?: boolean, test2?: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown): ApiError =>
  new ApiError(400, code, message, details);
