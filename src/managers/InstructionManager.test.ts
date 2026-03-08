import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstructionManager } from './InstructionManager';
import type { BaseInstructionClass } from '../instructions';
import type { BaseInstruction } from '../types';

vi.mock('../utils', () => ({
  LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
  OutputLogToFile: vi.fn(),
}));

/** 测试用最小指令实现 */
function createMockInstruction(tabId: number, id: string, created_at?: number): BaseInstructionClass {
  const inst: BaseInstruction = {
    tabId,
    type: 'mock',
    id,
    created_at,
  };
  return inst as unknown as BaseInstructionClass;
}

describe('InstructionManager', () => {
  let manager: InstructionManager;

  beforeEach(() => {
    manager = new InstructionManager();
  });

  it('AddInstructions and GetFirstInstructionByTabId 按 FIFO 顺序取出', () => {
    const a = createMockInstruction(1, 'a', 100);
    const b = createMockInstruction(1, 'b', 200);
    const c = createMockInstruction(1, 'c', 50);

    manager.AddInstructions(1, [a, b, c]);

    expect(manager.GetCountByTabId(1)).toBe(3);
    expect(manager.GetFirstInstructionByTabId(1)?.id).toBe('c'); // created_at 50 最先
    expect(manager.GetFirstInstructionByTabId(1)?.id).toBe('a');
    expect(manager.GetFirstInstructionByTabId(1)?.id).toBe('b');
    expect(manager.GetFirstInstructionByTabId(1)).toBeUndefined();
    expect(manager.GetCountByTabId(1)).toBe(0);
  });

  it('GetAllTabIds 返回有指令的 tabId 列表', () => {
    manager.AddInstructions(1, [createMockInstruction(1, 'a')]);
    manager.AddInstructions(2, [createMockInstruction(2, 'b')]);
    expect(manager.GetAllTabIds()).toEqual([1, 2]);
  });

  it('GetFirstInstructionByTabId 取完后该 tab 从 Map 中移除', () => {
    manager.AddInstructions(1, [createMockInstruction(1, 'a')]);
    manager.GetFirstInstructionByTabId(1);
    expect(manager.GetAllTabIds()).toEqual([]);
  });

  it('AddUnfilteredInstructions 按 tabId 分组，无 tabId 的指令被忽略', () => {
    const withTab = createMockInstruction(10, 'x');
    const noTab = { ...createMockInstruction(0, 'y'), tabId: 0 } as BaseInstructionClass;
    manager.AddUnfilteredInstructions([withTab, noTab]);
    expect(manager.GetAllTabIds()).toEqual([10]);
    expect(manager.GetCountByTabId(10)).toBe(1);
  });

  it('DeleteInstructionsByTabId 清空指定 tab 的指令', () => {
    manager.AddInstructions(1, [
      createMockInstruction(1, 'a'),
      createMockInstruction(1, 'b'),
    ]);
    manager.DeleteInstructionsByTabId(1);
    expect(manager.GetCountByTabId(1)).toBe(0);
    expect(manager.GetAllTabIds()).toEqual([]);
  });

  it('GetInstructionsByTabId 返回当前队列（不删除）', () => {
    const a = createMockInstruction(1, 'a');
    const b = createMockInstruction(1, 'b');
    manager.AddInstructions(1, [a, b]);
    const list = manager.GetInstructionsByTabId(1);
    expect(list).toHaveLength(2);
    expect(manager.GetFirstInstructionByTabId(1)?.id).toBe('a');
  });
});
