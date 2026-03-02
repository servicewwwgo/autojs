import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResultManager } from './InstructionResultManager';
import type { InstructionResult } from '../types';

vi.mock('../utils', () => ({
  LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
  OutputLogToFile: vi.fn(),
}));

function makeResult(tabId: number, instructionID: string, success: boolean): InstructionResult {
  return { tabId, instructionID, success, duration: 0 };
}

describe('InstructionResultManager (ResultManager)', () => {
  let manager: ResultManager;

  beforeEach(() => {
    manager = new ResultManager();
  });

  it('SaveResult 后 GetResult 可获取', () => {
    manager.SaveResult(makeResult(1, 'a', true));
    expect(manager.GetResult(1)).toHaveLength(1);
    expect(manager.GetResult(1)![0].instructionID).toBe('a');
  });

  it('GetResultAndDelete 有结果时返回并删除该 tab 条目', () => {
    manager.SaveResult(makeResult(1, 'a', true));
    const got = manager.GetResultAndDelete(1);
    expect(got).toHaveLength(1);
    expect(manager.GetResult(1)).toBeUndefined();
  });

  it('GetResultAndDelete 空数组也会从 Map 中移除', () => {
    manager.SaveResult(makeResult(1, 'a', true));
    manager.GetResultAndDelete(1);
    const again = manager.GetResultAndDelete(1);
    expect(again).toBeUndefined();
  });

  it('ClearResult 清除指定 tab 结果', () => {
    manager.SaveResult(makeResult(1, 'a', true));
    manager.ClearResult(1);
    expect(manager.GetResult(1)).toBeUndefined();
  });

  it('GetAllResults 返回所有 tab 结果展平', () => {
    manager.SaveResult(makeResult(1, 'a', true));
    manager.SaveResult(makeResult(2, 'b', false));
    const all = manager.GetAllResults();
    expect(all).toHaveLength(2);
  });
});
