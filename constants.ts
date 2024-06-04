export const INVALID_HANDLE_VALUE = [
  0xffff_ffff_ffff_ffffn,
  // NOTE: Prior to Deno 1.44, -1n was returned as the error handle.
  // See: https://github.com/denoland/deno/pull/23981
  -1n,
] as const;

export const ERROR_SUCCESS = 0;
export const ERROR_BROKEN_PIPE = 109;
export const ERROR_IO_PENDING = 997;

export const STATUS_PENDING = 0x00000103n;

export const FILE_READ_DATA = 1;
export const FILE_WRITE_DATA = 2;
export const FILE_APPEND_DATA = 4;
export const FILE_READ_EA = 8;
export const FILE_WRITE_EA = 16;
export const FILE_READ_ATTRIBUTES = 128;
export const FILE_WRITE_ATTRIBUTES = 256;

export const STANDARD_RIGHTS_READ = 0x20000;
export const STANDARD_RIGHTS_WRITE = 0x20000;

export const SYNCHRONIZE = 0x100000;

export const FILE_GENERIC_READ = STANDARD_RIGHTS_READ +
  FILE_READ_DATA +
  FILE_READ_ATTRIBUTES +
  FILE_READ_EA +
  SYNCHRONIZE;
export const FILE_GENERIC_WRITE = STANDARD_RIGHTS_WRITE +
  FILE_WRITE_DATA +
  FILE_WRITE_ATTRIBUTES +
  FILE_WRITE_EA +
  FILE_APPEND_DATA +
  SYNCHRONIZE;

export const OPEN_EXISTING = 3;

export const PIPE_ACCESS_INBOUND = 0x00000001;
export const PIPE_ACCESS_OUTBOUND = 0x00000002;
export const PIPE_TYPE_BYTE = 0x00000000;
export const PIPE_WAIT = 0x00000000;
export const FILE_FLAG_OVERLAPPED = 0x40000000;

export const FORMAT_MESSAGE_ALLOCATE_BUFFER = 0x00000100;
export const FORMAT_MESSAGE_FROM_SYSTEM = 0x00001000;
export const FORMAT_MESSAGE_IGNORE_INSERTS = 0x00000200;
