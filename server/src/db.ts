// db — pg Pool + withTransaction 헬퍼.
// 라우트/엔진은 Db 인터페이스(query 한 개)에만 의존해 테스트에서 모킹 가능하다.

import pg from 'pg';

export type Row = Record<string, any>;

export interface QueryResult {
  rows: Row[];
  rowCount?: number | null;
}

/** 최소 DB 인터페이스 — pg Pool/PoolClient 모두 만족. 테스트에선 이걸 모킹한다. */
export interface Db {
  query(text: string, values?: any[]): Promise<QueryResult>;
}

/** 트랜잭션용: BEGIN/COMMIT/ROLLBACK 가능한 클라이언트를 빌려줄 수 있는 풀. */
export interface TxPool {
  connect(): Promise<Db & { release(): void }>;
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('환경변수 DATABASE_URL이 설정되지 않았습니다.');
    pool = new pg.Pool({
      connectionString: url,
      max: 10,
      // Supabase 등 관리형 Postgres는 TLS 종단이 프록시라 self-signed 체인인 경우가 있다.
      ssl: url.includes('localhost') || url.includes('127.0.0.1')
        ? undefined
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

/**
 * withTransaction — 커넥션 1개를 빌려 BEGIN → fn → COMMIT, 예외 시 ROLLBACK.
 * fn이 던진 예외는 롤백 후 그대로 재던진다(라우트에서 상태코드 매핑).
 */
export async function withTransaction<T>(
  fn: (client: Db) => Promise<T>,
  txPool: TxPool = getPool(),
): Promise<T> {
  const client = await txPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // 롤백 실패는 원인 예외를 가리지 않는다
    }
    throw err;
  } finally {
    client.release();
  }
}

/** 라우트에서 상태코드를 지정해 던지는 에러. index.ts의 errorHandler가 매핑한다. */
export class HttpError extends Error {
  statusCode: number;
  payload?: Record<string, unknown>;
  constructor(statusCode: number, message: string, payload?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}
