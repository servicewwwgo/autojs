import { ElementObject, Element } from '../types/Element';

/**
 * 元素对象管理器 - 用来保存全部元素对象
 */
export class ElementManager {
  /** 元素对象映射表，key为元素名称 */
  private elements: Map<string, ElementObject> = new Map();
  /** 元素关系映射表 */
  private relationships: Map<string, string[]> = new Map();

  constructor() {
    this.elements = new Map();
    this.relationships = new Map();
  }

  /**
   * 获取元素对象
   */
  getElement(name: string): ElementObject | null {
    return this.elements.get(name) || null;
  }

  /**
   * 保存元素对象
   */
  setElement(element: ElementObject): void {
    if (!element.name) {
      console.error('Element name is required');
      return;
    }

    this.elements.set(element.name, element);
    
    // 更新关系映射
    this.updateRelationships(element);
    
    console.log(`元素 "${element.name}" 已保存`);
  }

  /**
   * 批量保存元素对象
   */
  setElements(elements: ElementObject[]): void {
    elements.forEach(element => this.setElement(element));
  }

  /**
   * 删除元素对象
   */
  removeElement(name: string): boolean {
    const element = this.elements.get(name);
    if (!element) {
      console.warn(`元素 "${name}" 不存在`);
      return false;
    }

    this.elements.delete(name);
    this.relationships.delete(name);
    
    // 清理其他元素中的引用
    this.cleanupReferences(name);
    
    console.log(`元素 "${name}" 已删除`);
    return true;
  }

  /**
   * 检查元素是否存在
   */
  hasElement(name: string): boolean {
    return this.elements.has(name);
  }

  /**
   * 获取所有元素名称
   */
  getAllElementNames(): string[] {
    return Array.from(this.elements.keys());
  }

  /**
   * 获取所有元素对象
   */
  getAllElements(): ElementObject[] {
    return Array.from(this.elements.values());
  }

  /**
   * 清空所有元素
   */
  clearAll(): void {
    this.elements.clear();
    this.relationships.clear();
    console.log('所有元素已清空');
  }

  /**
   * 获取元素数量
   */
  getElementCount(): number {
    return this.elements.size;
  }

  /**
   * 根据选择器查找元素
   */
  findElementBySelector(selector: string, selectorType: 'css' | 'xpath' | 'id'): ElementObject | null {
    for (const element of this.elements.values()) {
      if (element.selector === selector && element.selectorType === selectorType) {
        return element;
      }
    }
    return null;
  }

  /**
   * 获取元素的子元素
   */
  getChildElements(parentName: string): ElementObject[] {
    const children: ElementObject[] = [];
    
    for (const element of this.elements.values()) {
      if (element.parentName === parentName) {
        children.push(element);
      }
    }
    
    return children;
  }

  /**
   * 获取元素的父元素
   */
  getParentElement(childName: string): ElementObject | null {
    const child = this.elements.get(childName);
    if (!child || !child.parentName) {
      return null;
    }
    
    return this.elements.get(child.parentName) || null;
  }

  /**
   * 获取元素的关联元素
   */
  getRelatedElements(elementName: string): ElementObject[] {
    const element = this.elements.get(elementName);
    if (!element) {
      return [];
    }
    
    const related: ElementObject[] = [];
    element.relatedNames.forEach(name => {
      const relatedElement = this.elements.get(name);
      if (relatedElement) {
        related.push(relatedElement);
      }
    });
    
    return related;
  }

  /**
   * 验证所有元素
   */
  validateAllElements(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [name, element] of this.elements) {
      if (!element.validate()) {
        errors.push(`元素 "${name}" 验证失败`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 刷新所有元素的DOM引用
   */
  refreshAllElements(): void {
    for (const element of this.elements.values()) {
      if (element instanceof Element) {
        // 重新查找DOM元素
        (element as Element).dom = null;
        element.validate();
      }
    }
    console.log('所有元素DOM引用已刷新');
  }

  /**
   * 导出所有元素配置
   */
  exportElements(): string {
    const elementsData = Array.from(this.elements.entries()).map(([name, element]) => ({
      name: element.name,
      description: element.description,
      selector: element.selector,
      selectorType: element.selectorType,
      parentName: element.parentName,
      childrenNames: element.childrenNames,
      relatedNames: element.relatedNames
    }));
    
    return JSON.stringify(elementsData, null, 2);
  }

  /**
   * 从JSON导入元素配置
   */
  importElements(jsonData: string): boolean {
    try {
      const elementsData = JSON.parse(jsonData);
      
      if (!Array.isArray(elementsData)) {
        console.error('Invalid elements data format');
        return false;
      }
      
      elementsData.forEach(elementData => {
        const element = new Element({
          name: elementData.name,
          description: elementData.description,
          selector: elementData.selector,
          selectorType: elementData.selectorType,
          parentName: elementData.parentName,
          childrenNames: elementData.childrenNames,
          relatedNames: elementData.relatedNames
        });
        
        this.setElement(element);
      });
      
      console.log(`成功导入 ${elementsData.length} 个元素`);
      return true;
    } catch (error) {
      console.error('导入元素配置失败:', error);
      return false;
    }
  }

  /**
   * 更新元素关系
   */
  private updateRelationships(element: ElementObject): void {
    // 更新父元素关系
    if (element.parentName) {
      const parent = this.elements.get(element.parentName);
      if (parent) {
        if (!parent.childrenNames.includes(element.name)) {
          parent.childrenNames.push(element.name);
        }
      }
    }
    
    // 更新子元素关系
    element.childrenNames.forEach(childName => {
      const child = this.elements.get(childName);
      if (child) {
        child.parentName = element.name;
      }
    });
    
    // 更新关联元素关系
    element.relatedNames.forEach(relatedName => {
      const related = this.elements.get(relatedName);
      if (related && !related.relatedNames.includes(element.name)) {
        related.relatedNames.push(element.name);
      }
    });
  }

  /**
   * 清理元素引用
   */
  private cleanupReferences(removedName: string): void {
    for (const element of this.elements.values()) {
      // 清理子元素引用
      const childIndex = element.childrenNames.indexOf(removedName);
      if (childIndex > -1) {
        element.childrenNames.splice(childIndex, 1);
      }
      
      // 清理关联元素引用
      const relatedIndex = element.relatedNames.indexOf(removedName);
      if (relatedIndex > -1) {
        element.relatedNames.splice(relatedIndex, 1);
      }
    }
  }

  /**
   * 获取元素统计信息
   */
  getStatistics(): {
    total: number;
    bySelectorType: Record<string, number>;
    withParent: number;
    withChildren: number;
    withRelated: number;
  } {
    const stats = {
      total: this.elements.size,
      bySelectorType: {} as Record<string, number>,
      withParent: 0,
      withChildren: 0,
      withRelated: 0
    };
    
    for (const element of this.elements.values()) {
      // 统计选择器类型
      stats.bySelectorType[element.selectorType] = (stats.bySelectorType[element.selectorType] || 0) + 1;
      
      // 统计关系
      if (element.parentName) stats.withParent++;
      if (element.childrenNames.length > 0) stats.withChildren++;
      if (element.relatedNames.length > 0) stats.withRelated++;
    }
    
    return stats;
  }
}
