import type { GetUrlCookieItem, GetUrlInstruction, GetUrlInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：获取当前标签页的 URL，用于页面状态验证、数据提取和页面跳转确认，支持特殊页面（chrome://、about: 等）的检测
 *
 * 实现方式：继承自 BaseInstructionClass，使用 browser.tabs.get API 获取标签页信息，从中提取 URL（优先使用 url，如果不存在则使用 pendingUrl）
 *
 * 注意事项：
 * - 无需额外参数，直接使用指令的 tabId 字段
 * - usage 参数标识 URL 的用途（variable 用于变量赋值、data 用于数据返回、none 仅获取），默认值为 "data"
 * - 优先使用 tab.url，如果不存在则使用 tab.pendingUrl（导航中的 URL）
 * - 如果标签页不存在或没有 URL（如 chrome://、about: 等特殊页面），会返回明确的错误信息
 * - 支持延迟执行（delay 属性）和重试机制（retry 属性）
 * - 获取到的 URL 会记录到日志中，便于调试和监控
 *
 * 相关代码：src/types/instruction.ts - GetUrlInstruction 接口（指令数据结构），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
 */
export class GetUrlInstructionClass extends BaseInstructionClass {
  public params: {
    usage?: "variable" | "data" | "none";
  };

  constructor(instruction: GetUrlInstruction) {
    super(instruction);
    this.params = instruction.params;
  }

  /**
   * 业务逻辑：执行获取 URL 操作，读取当前标签页的 URL 并返回，用于页面状态验证和数据提取
   *
   * 实现方式：使用 browser.tabs.get API 获取标签页信息，优先使用 url 字段，如果不存在则使用 pendingUrl 字段
   *
   * 注意事项：
   * - 执行前会先调用 Delay() 方法处理延迟
   * - 如果标签页不存在（No tab with id），会返回明确的错误信息
   * - 如果标签页没有 URL（如 chrome://、about: 等特殊页面），会返回错误信息
   * - 优先使用 tab.url（当前 URL），如果不存在则使用 tab.pendingUrl（导航中的 URL）
   * - 获取到的 URL 会记录到日志中，便于调试和监控
   * - 返回结果包含 usage、url 和 cookies 字段；cookies 为当前站点（当前标签页 URL）下的全部 cookie，usage 默认为 "data"
   *
   * 相关代码：src/types/instruction.ts - GetUrlInstructionResult 接口（结果数据结构），src/instructions/BaseInstruction.ts - Retry() 方法（重试机制）
   */
  public async Execute(): Promise<GetUrlInstructionResult> {
    const result = await this.Retry(async () => {
      let defaultResult: GetUrlInstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

      // 如果设置了延迟，先等待
      await this.Delay(this.delay);

      // 使用 browser.tabs.get API 获取标签页信息
      let tab;
      try {
        tab = await browser.tabs.get(this.tabId);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('No tab with id') || errorMsg.includes('No tab with given id')) {
          return { ...defaultResult, error: `Tab ${this.tabId} does not exist` } as GetUrlInstructionResult;
        }
        throw error; // 重新抛出其他错误，让 Retry 处理
      }

      if (!tab) {
        return { ...defaultResult, error: `Failed to get tab ${this.tabId}` } as GetUrlInstructionResult;
      }

      // 获取URL，优先使用 url，如果不存在则使用 pendingUrl
      const url = tab.url || tab.pendingUrl || '';

      if (!url) {
        return { ...defaultResult, error: `Tab ${this.tabId} has no URL (may be a special page like chrome:// or about:)` } as GetUrlInstructionResult;
      }

      let cookies: GetUrlCookieItem[] = [];
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const list = await browser.cookies.getAll({ url });
          cookies = list.map((c) => ({
            name: c.name,
            value: c.value,
            ...(c.domain != null && { domain: c.domain }),
            ...(c.path != null && { path: c.path }),
            ...(c.secure != null && { secure: c.secure }),
            ...(c.httpOnly != null && { httpOnly: c.httpOnly }),
            ...(c.sameSite != null && { sameSite: c.sameSite }),
            ...(c.expirationDate != null && { expirationDate: c.expirationDate }),
            ...(c.hostOnly != null && { hostOnly: c.hostOnly }),
            ...(c.session != null && { session: c.session }),
          }));
        }
      } catch (cookieError) {
        OutputLogToFile(`[GetUrlInstruction] Failed to get cookies for tab ${this.tabId}: ${cookieError instanceof Error ? cookieError.message : String(cookieError)}`, { level: LogLevel.WARN });
      }

      OutputLogToFile(`[GetUrlInstruction] Current tab URL: ${url}, cookies: ${Array.isArray(cookies) ? cookies.length : 0}`, { level: LogLevel.INFO });

      return { ...defaultResult, success: true, data: { usage: this.params.usage || "data", url, cookies } } as GetUrlInstructionResult;
    });

    return result as GetUrlInstructionResult;
  }
}

