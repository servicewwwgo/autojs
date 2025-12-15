import type { MouseInstruction, InstructionResult } from '../types';
import { BaseInstructionClass } from './BaseInstruction';
import { elementManager } from '../managers';
import { OutputLogToFile, LogLevel } from '../utils';

/**
 * 鼠标操作指令
 */
export class MouseInstructionClass extends BaseInstructionClass {
    public action: 'click' | 'dblclick' | 'rightclick' | 'hover' | 'left_mousedown' | 'left_mouseup' | 'right_mousedown' | 'right_mouseup' | 'move_to';
    public elementName?: string;
    public x?: number;
    public y?: number;
    public simulate?: 'calculated' | 'simulated' | 'none';

    constructor(instruction: MouseInstruction) {
        super(instruction);
        this.action = instruction.action;
        this.elementName = instruction.elementName;
        this.x = instruction.x;
        this.y = instruction.y;
        this.simulate = instruction.simulate;
    }

    ToObject(): object {
        return {
            ...super.ToObject(),
            action: this.action,
            elementName: this.elementName,
            x: this.x,
            y: this.y
        } as object;
    }

    /**
     * 鼠標軌跡仿真 - 不模擬鼠標軌跡
     * 直接移動到目標位置，不進行任何模擬
     * @param targetX - 目標 X 坐標
     * @param targetY - 目標 Y 坐標
     */
    private async NoneMouseTrajectory(targetX: number, targetY: number): Promise<void> {
        try {
            // 直接移動到目標位置，不進行任何軌跡模擬
            await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: targetX,
                y: targetY
            });
        } catch (error) {
            OutputLogToFile(`[MouseInstruction] Error moving mouse to target position: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            throw error;
        }
    }

    /**
     * 鼠標軌跡仿真 - 真人鼠標軌跡模擬
     * 使用貝塞爾曲線和隨機抖動來模擬真實的鼠標移動軌跡
     * @param targetX - 目標 X 坐標
     * @param targetY - 目標 Y 坐標
     */
    private async CalculatedMouseTrajectory(targetX: number, targetY: number): Promise<void> {
        try {
            // 獲取當前鼠標位置（如果無法獲取，使用視口中心作為起點）
            // 注意：CDP 沒有直接獲取當前鼠標位置的方法，所以我們使用視口中心作為起點
            let viewportWidth = 1920;
            let viewportHeight = 1080;

            try {
                await this.ExecuteCDPCommand('Page.enable');
                const viewportResult = await this.ExecuteCDPCommand('Page.getLayoutMetrics');
                viewportWidth = viewportResult?.cssLayoutViewport?.clientWidth || 1920;
                viewportHeight = viewportResult?.cssLayoutViewport?.clientHeight || 1080;
            } catch (error) {
                OutputLogToFile(`[MouseInstruction] Failed to get viewport metrics, using default values: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            const startX = viewportWidth / 2;
            const startY = viewportHeight / 2;

            // 計算距離
            const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

            // 根據距離動態調整步數和速度
            // 距離越遠，步數越多，但每步的間隔時間也會稍微增加
            const minSteps = 10;
            const maxSteps = 50;
            const steps = Math.max(minSteps, Math.min(maxSteps, Math.floor(distance / 20)));

            // 生成貝塞爾曲線控制點（添加一些隨機性）
            const controlPoint1X = startX + (targetX - startX) * 0.25 + (Math.random() - 0.5) * distance * 0.1;
            const controlPoint1Y = startY + (targetY - startY) * 0.25 + (Math.random() - 0.5) * distance * 0.1;
            const controlPoint2X = startX + (targetX - startX) * 0.75 + (Math.random() - 0.5) * distance * 0.1;
            const controlPoint2Y = startY + (targetY - startY) * 0.75 + (Math.random() - 0.5) * distance * 0.1;

            // 生成軌跡點
            const trajectory: Array<{ x: number; y: number }> = [];

            for (let i = 0; i <= steps; i++) {
                const t = i / steps;

                // 三次貝塞爾曲線公式
                const x = Math.pow(1 - t, 3) * startX +
                    3 * Math.pow(1 - t, 2) * t * controlPoint1X +
                    3 * (1 - t) * Math.pow(t, 2) * controlPoint2X +
                    Math.pow(t, 3) * targetX;

                const y = Math.pow(1 - t, 3) * startY +
                    3 * Math.pow(1 - t, 2) * t * controlPoint1Y +
                    3 * (1 - t) * Math.pow(t, 2) * controlPoint2Y +
                    Math.pow(t, 3) * targetY;

                // 添加微小的隨機抖動（模擬手部微顫）
                const jitterX = (Math.random() - 0.5) * 2;
                const jitterY = (Math.random() - 0.5) * 2;

                trajectory.push({
                    x: Math.round(x + jitterX),
                    y: Math.round(y + jitterY)
                });
            }

            // 執行鼠標移動，每個點之間添加隨機延遲
            for (let i = 0; i < trajectory.length; i++) {
                const point = trajectory[i];

                await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: point.x,
                    y: point.y
                });

                // 添加隨機延遲（5-15毫秒），模擬真實的鼠標移動速度變化
                // 注意：Delay 方法使用秒為單位
                if (i < trajectory.length - 1) {
                    const delay = 0.005 + Math.random() * 0.01; // 5-15毫秒
                    await this.Delay(delay);
                }
            }
        } catch (error) {
            OutputLogToFile(`[MouseInstruction] Error simulating mouse trajectory: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            // 如果模擬失敗，直接移動到目標位置
            await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: targetX,
                y: targetY
            });
        }
    }

    /**
     * 鼠標軌跡仿真 - 開源鼠標軌跡模擬
     * 使用更複雜的算法來模擬真實的鼠標移動軌跡
     * 基於 humanize 算法，使用多段貝塞爾曲線和更真實的速度曲線
     * @param targetX - 目標 X 坐標
     * @param targetY - 目標 Y 坐標
     */
    private async SimulatedMouseTrajectory(targetX: number, targetY: number): Promise<void> {
        try {
            // 獲取視口尺寸
            let viewportWidth = 1920;
            let viewportHeight = 1080;

            try {
                await this.ExecuteCDPCommand('Page.enable');
                const viewportResult = await this.ExecuteCDPCommand('Page.getLayoutMetrics');
                viewportWidth = viewportResult?.cssLayoutViewport?.clientWidth || 1920;
                viewportHeight = viewportResult?.cssLayoutViewport?.clientHeight || 1080;
            } catch (error) {
                OutputLogToFile(`[MouseInstruction] Failed to get viewport metrics, using default values: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.WARN });
            }

            const startX = viewportWidth / 2;
            const startY = viewportHeight / 2;

            // 計算距離
            const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

            // 使用更真實的步數計算（基於 humanize 算法）
            // 步數與距離的關係更接近真實人類移動
            const minSteps = 15;
            const maxSteps = 80;
            // 使用對數函數來計算步數，使短距離和長距離的步數更合理
            const steps = Math.max(minSteps, Math.min(maxSteps, Math.floor(Math.log(distance + 1) * 10 + distance / 15)));

            // 使用多段貝塞爾曲線（更真實）
            // 將路徑分成多段，每段使用不同的控制點
            const segments = Math.min(3, Math.max(1, Math.floor(distance / 200)));
            const segmentLength = distance / segments;

            const trajectory: Array<{ x: number; y: number; delay: number }> = [];

            for (let seg = 0; seg < segments; seg++) {
                const segStartX = seg === 0 ? startX : trajectory[trajectory.length - 1].x;
                const segStartY = seg === 0 ? startY : trajectory[trajectory.length - 1].y;
                const segEndX = seg === segments - 1 ? targetX : startX + (targetX - startX) * ((seg + 1) / segments);
                const segEndY = seg === segments - 1 ? targetY : startY + (targetY - startY) * ((seg + 1) / segments);

                const segSteps = Math.floor(steps / segments);
                const segDistance = Math.sqrt(Math.pow(segEndX - segStartX, 2) + Math.pow(segEndY - segStartY, 2));

                // 為每段生成控制點（添加更多隨機性）
                const randomFactor1 = 0.15 + Math.random() * 0.1; // 0.15-0.25
                const randomFactor2 = 0.75 + Math.random() * 0.1; // 0.75-0.85

                const controlPoint1X = segStartX + (segEndX - segStartX) * randomFactor1 + (Math.random() - 0.5) * segDistance * 0.15;
                const controlPoint1Y = segStartY + (segEndY - segStartY) * randomFactor1 + (Math.random() - 0.5) * segDistance * 0.15;
                const controlPoint2X = segStartX + (segEndX - segStartX) * randomFactor2 + (Math.random() - 0.5) * segDistance * 0.15;
                const controlPoint2Y = segStartY + (segEndY - segStartY) * randomFactor2 + (Math.random() - 0.5) * segDistance * 0.15;

                for (let i = 0; i <= segSteps; i++) {
                    const t = i / segSteps;

                    // 三次貝塞爾曲線
                    const x = Math.pow(1 - t, 3) * segStartX +
                        3 * Math.pow(1 - t, 2) * t * controlPoint1X +
                        3 * (1 - t) * Math.pow(t, 2) * controlPoint2X +
                        Math.pow(t, 3) * segEndX;

                    const y = Math.pow(1 - t, 3) * segStartY +
                        3 * Math.pow(1 - t, 2) * t * controlPoint1Y +
                        3 * (1 - t) * Math.pow(t, 2) * controlPoint2Y +
                        Math.pow(t, 3) * segEndY;

                    // 添加隨機抖動（模擬手部微顫）
                    const jitterX = (Math.random() - 0.5) * 2.5;
                    const jitterY = (Math.random() - 0.5) * 2.5;

                    // 計算速度曲線（ease-in-out，中間快，兩端慢）
                    // 使用更真實的速度變化
                    const speedFactor = t < 0.5
                        ? 2 * t * t  // 加速階段
                        : 1 - Math.pow(-2 * t + 2, 2) / 2; // 減速階段

                    // 根據速度曲線計算延遲（中間快，兩端慢）
                    const baseDelay = 0.008; // 8毫秒基礎延遲
                    const maxDelay = 0.025; // 25毫秒最大延遲
                    const delay = baseDelay + (maxDelay - baseDelay) * (1 - speedFactor) + Math.random() * 0.01;

                    trajectory.push({
                        x: Math.round(x + jitterX),
                        y: Math.round(y + jitterY),
                        delay: delay
                    });
                }
            }

            // 執行鼠標移動
            for (let i = 0; i < trajectory.length; i++) {
                const point = trajectory[i];

                await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: point.x,
                    y: point.y
                });

                // 使用計算出的延遲（最後一個點不需要延遲）
                if (i < trajectory.length - 1) {
                    await this.Delay(point.delay);
                }
            }
        } catch (error) {
            OutputLogToFile(`[MouseInstruction] Error simulating mouse trajectory: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            // 如果模擬失敗，直接移動到目標位置
            await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: targetX,
                y: targetY
            });
        }
    }

    /**
     * 統一的鼠標移動方法，根據 simulate 參數選擇不同的軌跡模擬方式
     * @param targetX - 目標 X 坐標
     * @param targetY - 目標 Y 坐標
     */
    private async MoveMouseTo(targetX: number, targetY: number): Promise<void> {
        const simulateType = this.simulate || 'calculated'; // 默認使用 calculated

        switch (simulateType) {
            case 'none':
                await this.NoneMouseTrajectory(targetX, targetY);
                break;
            case 'calculated':
                await this.CalculatedMouseTrajectory(targetX, targetY);
                break;
            case 'simulated':
                await this.SimulatedMouseTrajectory(targetX, targetY);
                break;
            default:
                // 默認使用 calculated
                await this.CalculatedMouseTrajectory(targetX, targetY);
                break;
        }
    }

    /**
     * 執行鼠標操作指令
     * @returns 指令結果
     */
    public async Execute(): Promise<InstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: InstructionResult = { tabId: this.tabId, instructionID: this.instructionID, success: false, duration: 0 };

            let x = this.x || 0;
            let y = this.y || 0;

            // 如果指定了元素，获取元素位置
            if (this.elementName) {
                // 从 elementManager 获取元素
                const element = elementManager.GetElementByName(this.tabId, this.elementName);

                if (!element) {
                    return { ...defaultResult, error: `Element "${this.elementName}" not found in element manager` };
                }

                // 获取元素的 nodeId
                const nodeId = element.GetNodeId();

                if (!nodeId) {
                    return { ...defaultResult, error: `Element "${this.elementName}" has no nodeId. Make sure the element was found using FindElementInstruction first.` };
                }

                // 启用 DOM 域
                await this.ExecuteCDPCommand('DOM.enable');
                // 滚动到元素位置
                await this.ExecuteCDPCommand('DOM.scrollIntoViewIfNeeded', { nodeId: nodeId });
                // 聚焦元素
                await this.ExecuteCDPCommand('DOM.focus', { nodeId: nodeId });

                // 使用 CDP 获取元素的边界框
                const boxModel = await this.ExecuteCDPCommand('DOM.getBoxModel', {
                    nodeId: nodeId
                });

                if (boxModel?.model?.content && boxModel.model.content.length >= 8) {
                    // content 数组格式: [x1, y1, x2, y2, x3, y3, x4, y4]
                    // 计算中心点
                    const left = Math.min(boxModel.model.content[0], boxModel.model.content[2], boxModel.model.content[4], boxModel.model.content[6]);
                    const top = Math.min(boxModel.model.content[1], boxModel.model.content[3], boxModel.model.content[5], boxModel.model.content[7]);
                    const right = Math.max(boxModel.model.content[0], boxModel.model.content[2], boxModel.model.content[4], boxModel.model.content[6]);
                    const bottom = Math.max(boxModel.model.content[1], boxModel.model.content[3], boxModel.model.content[5], boxModel.model.content[7]);

                    x = left + (right - left) / 2;
                    y = top + (bottom - top) / 2;
                }
            }

            // 执行鼠标操作
            switch (this.action) {
                case 'click':
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x,
                        y,
                        button: 'left',
                        clickCount: 1
                    });
                    await this.Delay(0.1);
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x,
                        y,
                        button: 'left',
                        clickCount: 1
                    });
                    break;

                case 'rightclick':
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x,
                        y,
                        button: 'right',
                        clickCount: 1
                    });
                    await this.Delay(0.1);
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x,
                        y,
                        button: 'right',
                        clickCount: 1
                    });
                    break;

                case 'dblclick':
                    for (let i = 0; i < 2; i++) {
                        await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                            type: 'mousePressed',
                            x,
                            y,
                            button: 'left',
                            clickCount: i + 1
                        });
                        await this.Delay(0.1);
                        await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                            type: 'mouseReleased',
                            x,
                            y,
                            button: 'left',
                            clickCount: i + 1
                        });
                        if (i === 0) await this.Delay(0.5);
                    }
                    break;

                case 'hover':
                    // hover 操作也使用模拟鼠标轨迹，更真实
                    await this.MoveMouseTo(x, y);
                    break;

                case 'left_mousedown':
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x,
                        y,
                        button: 'left',
                        clickCount: 1
                    });
                    break;

                case 'left_mouseup':
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x,
                        y,
                        button: 'left',
                        clickCount: 1
                    });
                    break;

                case 'right_mousedown':
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x,
                        y,
                        button: 'right',
                        clickCount: 1
                    });
                    break;

                case 'right_mouseup':
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x,
                        y,
                        button: 'right',
                        clickCount: 1
                    });
                    break;

                case 'move_to':
                    // 使用模拟鼠标轨迹移动到目标位置
                    await this.MoveMouseTo(x, y);
                    break;
            }

            return { ...defaultResult, success: true, data: { x, y, action: this.action } };
        });

        return result;
    }
}

