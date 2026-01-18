import { PaginationMeta } from './pagination.types';

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

export interface ErrorDetail {
  field?: string;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
  timestamp: string;
  path: string;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
export type ApiPaginatedResponse<T> = PaginatedResponse<T> | ErrorResponse;

export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  meta: PaginationMeta,
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    meta,
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  path: string,
  details?: ErrorDetail[],
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
    path,
  };
}