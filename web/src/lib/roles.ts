export const Role = {
  PENDING: "PENDING",
  READER: "READER",
  EDITOR: "EDITOR",
  ADMIN: "ADMIN",
  REJECTED: "REJECTED",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ParseStatus = {
  PENDING: "PENDING",
  OK: "OK",
  FAILED: "FAILED",
} as const;

export type ParseStatus = (typeof ParseStatus)[keyof typeof ParseStatus];

export const DiffStatus = {
  PENDING: "PENDING",
  READY: "READY",
  FAILED: "FAILED",
} as const;

export type DiffStatus = (typeof DiffStatus)[keyof typeof DiffStatus];
