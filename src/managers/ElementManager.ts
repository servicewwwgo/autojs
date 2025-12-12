import type { ElementData } from '../types';
import { OutputLogToFile, LogLevel } from '../utils';

/**
 * 元素对象接口
 */
export interface IElement {
    // 元素数据
    elementData: ElementData;

    // 验证方法
    Validate(): boolean;

    // 转换为对象
    ToObject(): object;

    // 获取节点ID
    GetNodeId(): number | undefined;

    // 获取元素tag
    GetTag(): string | undefined;

    // 获取元素名称
    GetName(): string | undefined;

    // 获取元素描述
    GetDescription(): string | undefined;

    // 获取元素備注
    GetBackup(): string | undefined;

    // 获取元素选择器
    GetSelector(): string | undefined;

    // 获取元素选择器类型
    GetSelectorType(): 'css' | 'xpath' | 'id';

    // 获取元素父元素名称
    GetParentName(): string | undefined;

    // 获取元素子元素名称
    GetChildrenName(): string | undefined;

    // 获取元素兄弟元素名称
    GetSiblingName(): string | undefined;

    // 获取元素兄弟元素偏移量
    GetSiblingOffset(): number | undefined;
}

/**
 * 元素对象实现类
 */
export class ElementClass implements IElement {
    public elementData: ElementData;

    constructor(data: ElementData) {
        this.elementData = data;
    }

    public Validate(): boolean {

        // 校驗
        if (!this.elementData.name) {
            return false;
        }

        if (!this.elementData.selector) {
            return false;
        }

        if (!this.elementData.selectorType) {
            return false;
        }

        if (!this.elementData.tabId) {
            return false;
        }

        if (!['css', 'xpath', 'id'].includes(this.elementData.selectorType)) {
            return false;
        }

        // 检查是否找到元素（通过 nodeId）
        if (!this.elementData.nodeId) {
            OutputLogToFile(`Element "${this.elementData.name}" not found with nodeId: ${this.elementData.nodeId}`, { level: LogLevel.ERROR });
            return false;
        }

        return true;
    }

    public ToObject(): object {
        return this.elementData;
    }

    public GetNodeId(): number | undefined {
        return this.elementData.nodeId;
    }

    public GetBackup(): string | undefined {
        return this.elementData.backup;
    }

    public GetTag(): string | undefined {
        return this.elementData.tag;
    }

    public GetName(): string | undefined {
        return this.elementData.name;
    }

    public GetDescription(): string | undefined {
        return this.elementData.description;
    }

    public GetSelector(): string | undefined {
        return this.elementData.selector;
    }

    public GetSelectorType(): 'css' | 'xpath' | 'id' {
        return this.elementData.selectorType;
    }

    public GetParentName(): string | undefined {
        return this.elementData.parentName;
    }

    public GetChildrenName(): string | undefined {
        return this.elementData.childrenName;
    }

    public GetSiblingName(): string | undefined {
        return this.elementData.siblingName;
    }

    public GetSiblingOffset(): number | undefined {
        return this.elementData.siblingOffset;
    }
}

/**
 * 元素管理器
 * 用于保存全部元素，按tabId和元素名称分组
 */
export class ElementManager {
    private elements: Map<number, Map<string, IElement>> = new Map();

    /**
     * 清空所有元素
     */
    public clearAll(): void {
        const totalCount = Array.from(this.elements.values()).reduce((sum, map) => sum + map.size, 0);
        this.elements.clear();
        OutputLogToFile(`元素管理器: 清空所有元素成功，清除数量: ${totalCount}`, { level: LogLevel.INFO });
    }

    /**
     * 根据元素名称获取
     */
    public GetElementByName(tabId: number, name: string): IElement | undefined {
        return this.elements.has(tabId) ? this.elements.get(tabId)?.get(name) : undefined;
    }

    /**
     * 根据元素名称保存
     */
    public SetElementByName(tabId: number, name: string, element: IElement): void {
        if (!this.elements.has(tabId)) {
            this.elements.set(tabId, new Map());
        }
        this.elements.get(tabId)?.set(name, element);
        OutputLogToFile(`元素管理器: 保存元素成功，标签页ID: ${tabId}, 元素名称: ${name}`, { level: LogLevel.INFO });
    }

    /**
     * 根据元素名称删除
     */
    public RemoveElementByName(tabId: number, name: string): void {
        if (this.elements.has(tabId)) {
            const deleted = this.elements.get(tabId)?.delete(name);
            if (deleted) {
                OutputLogToFile(`元素管理器: 删除元素成功，标签页ID: ${tabId}, 元素名称: ${name}`, { level: LogLevel.INFO });
            }
        }
    }

    /**
     * 检查元素名称是否存在
     */
    public HasElementByName(tabId: number, name: string): boolean {
        return this.elements.has(tabId) && this.elements.get(tabId)?.has(name) || false;
    }

    /**
     * 获取元素数量
     */
    public GetElementCount(tabId: number): number {
        return this.elements.has(tabId) ? this.elements.get(tabId)?.size || 0 : 0;
    }

    /**
     * 清空指定标签页的所有元素
     */
    public ClearTabElements(tabId: number): void {
        const count = this.elements.get(tabId)?.size || 0;
        this.elements.delete(tabId);
        OutputLogToFile(`元素管理器: 清空标签页元素成功，标签页ID: ${tabId}, 清除数量: ${count}`, { level: LogLevel.INFO });
    }
}

/**
 * 导出全局元素管理器
 */
export let elementManager: ElementManager = new ElementManager();