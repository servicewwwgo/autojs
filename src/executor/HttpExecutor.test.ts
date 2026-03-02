import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpExecutor } from './HttpExecutor';

vi.mock('../utils', () => ({
  LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
  OutputLogToFile: vi.fn(),
}));

describe('HttpExecutor', () => {
  let executor: HttpExecutor;
  let sendResult: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executor = new HttpExecutor();
    sendResult = vi.fn();
    executor.setSendResult(sendResult);
  });

  it('handleMessage 对未知 type 返回 handler not found 错误', async () => {
    await executor.handleMessage({
      type: 'unknown_type' as any,
      id: 'req-1',
    });
    expect(sendResult).toHaveBeenCalledTimes(1);
    expect(sendResult.mock.calls[0][0]).toMatchObject({
      type: 'unknown_type',
      id: 'req-1',
      success: false,
      error: 'handler not found: unknown_type',
    });
  });

  it('handleMessage http_request 缺少 data 时返回错误', async () => {
    await executor.handleMessage({
      type: 'http_request',
      id: 'req-2',
      data: undefined,
    });
    expect(sendResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-2',
        success: false,
        error: expect.stringContaining('data is undefined'),
      })
    );
  });

  it('handleMessage http_request 缺少 method 时返回错误', async () => {
    await executor.handleMessage({
      type: 'http_request',
      id: 'req-3',
      data: { url: 'https://example.com' } as any,
    });
    expect(sendResult).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('method'),
      })
    );
  });

  it('handleMessage http_request 缺少 url 时返回错误', async () => {
    await executor.handleMessage({
      type: 'http_request',
      id: 'req-4',
      data: { method: 'GET' } as any,
    });
    expect(sendResult).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('url'),
      })
    );
  });

  it('handleMessage http_request 成功时调用 sendResult 并返回 data', async () => {
    const resBody = JSON.stringify({ ok: true });
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      url: 'https://example.com/',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(resBody),
    });

    await executor.handleMessage({
      type: 'http_request',
      id: 'req-5',
      data: {
        method: 'GET',
        url: 'https://example.com/',
      },
    });

    expect(sendResult).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'http_request',
        id: 'req-5',
        success: true,
        data: expect.objectContaining({
          status: 200,
          statusText: 'OK',
          body: { ok: true },
        }),
      })
    );
  });

  it('handleMessage http_request 失败时调用 sendResult 并返回 error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await executor.handleMessage({
      type: 'http_request',
      id: 'req-6',
      data: {
        method: 'GET',
        url: 'https://example.com/',
      },
    });

    expect(sendResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-6',
        success: false,
        error: 'Network error',
      })
    );
  });
});
