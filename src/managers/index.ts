/**
 * 业务逻辑：统一导出所有管理器类，提供集中的模块入口，便于其他模块导入使用
 *
 * 实现方式：使用 ES6 模块导出语法，重新导出各个管理器类和实例
 *
 * 注意事项：此文件作为管理器模块的统一入口，其他模块应从此文件导入管理器
 *
 * 相关代码：src/executor/InstructionExecutor.ts - 导入 InstructionManager 和 ResultManager，src/entrypoints/background.ts - 导入 nodeManager
 */
// export { TabManager, tabManager } from './TabManager';
export { NodeManager, nodeManager } from './NodeManager';
export { InstructionManager } from './InstructionManager';
export { ResultManager } from './InstructionResultManager';
export { ElementClass, ElementManager, elementManager, IElement } from './ElementManager';
