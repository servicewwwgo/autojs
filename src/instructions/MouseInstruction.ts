import { elementManager } from '../managers';
import type { MouseInstruction, MouseInstructionResult } from '../types';
import { LogLevel, OutputLogToFile } from '../utils';
import { BaseInstructionClass } from './BaseInstruction';

/**
 * 业务逻辑：模拟鼠标操作（点击、双击、右键、悬停、移动等），支持多种鼠标动作和轨迹模拟，用于页面交互和元素操作
 *
 * 实现方式：继承自 BaseInstructionClass，使用 CDP 的 Input.dispatchMouseEvent 发送鼠标事件，支持三种轨迹模拟方式（none、calculated、simulated）
 *
 * 注意事项：
 * - action 参数指定操作类型（click、dblclick、rightclick、hover、move_to 等）
 * - simulate 参数指定轨迹模拟方式（none 不模拟、calculated 计算轨迹、simulated 模拟轨迹），默认 calculated
 * - elementName 参数为可选，如果指定则计算元素中心坐标作为目标位置
 * - x、y 参数为可选坐标，如果未指定则使用元素中心坐标
 * - 轨迹模拟使用贝塞尔曲线和随机抖动，模拟真实鼠标移动
 * - 点击操作会先移动鼠标到目标位置，然后发送 mousePressed 和 mouseReleased 事件
 *
 * 相关代码：src/types/instruction.ts - MouseInstruction 接口（指令数据结构），src/instructions/index.ts - InstructionFactory 类（创建此指令实例）
 */
export class MouseInstructionClass extends BaseInstructionClass {
    public params: {
        action: 'click' | 'dblclick' | 'rightclick' | 'hover' | 'left_mousedown' | 'left_mouseup' | 'right_mousedown' | 'right_mouseup' | 'move_to';
        simulate?: 'calculated' | 'simulated' | 'none';
        elementName?: string;
        x?: number;
        y?: number;
    };

    constructor(instruction: MouseInstruction) {
        super(instruction);
        this.params = instruction.params;
    }

    /**
     * 业务逻辑：不模拟鼠标轨迹，直接移动到目标位置，用于快速移动场景，不进行任何轨迹计算
     *
     * 实现方式：直接发送 mouseMoved 事件到目标坐标，不计算中间路径
     *
     * 注意事项：
     * - CDP 的 mouseMoved 事件不会更新浏览器窗口中实际的鼠标指针位置（Chrome 安全特性）
     * - 但事件会正确触发，页面上的 hover 等事件会正常工作
     * - 移动后会等待 50 毫秒，确保浏览器处理鼠标移动事件
     * - 适用于不需要模拟真实轨迹的场景，移动速度最快
     *
     * 相关代码：CalculatedMouseTrajectory() 方法（计算轨迹），SimulatedMouseTrajectory() 方法（模拟轨迹），MoveMouseTo() 方法（统一移动方法）
     */
    private async NoneMouseTrajectory(targetX: number, targetY: number): Promise<void> {
        try {
            // 直接移動到目標位置，不進行任何軌跡模擬
            // 注意：CDP 的 mouseMoved 事件不會更新瀏覽器窗口中實際的鼠標指針位置
            // 這是 Chrome 的安全特性，防止通過 CDP 控制用戶的鼠標指針
            // 但事件會正確觸發，頁面上的 hover 等事件會正常工作
            await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: targetX,
                y: targetY,
                button: 'none',
                modifiers: 0
            });
            // 等待瀏覽器處理鼠標移動事件
            await this.Delay(0.05); // 50毫秒
        } catch (error) {
            OutputLogToFile(`[MouseInstruction] Error moving mouse to target position: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            throw error;
        }
    }

    /**
     * 业务逻辑：使用贝塞尔曲线和随机抖动模拟真实鼠标轨迹，用于模拟人类鼠标移动，避免被检测为自动化操作
     *
     * 实现方式：使用三次贝塞尔曲线计算轨迹点，添加随机抖动和速度曲线（ease-in-out），根据距离动态调整步数和速度
     *
     * 注意事项：
     * - 使用视口中心作为起点（CDP 无法获取当前鼠标位置）
     * - 根据距离动态调整总时间和步数，短距离至少 200ms，长距离最多 800ms
     * - 使用三次贝塞尔曲线生成平滑轨迹，添加随机抖动模拟手部微颤
     * - 速度曲线为 ease-in-out（中间快，两端慢），更接近真实移动
     * - 每步延迟有随机性（平均值的 0.7-1.3 倍），增加真实感
     * - CDP 的 mouseMoved 事件不会更新浏览器窗口中实际的鼠标指针位置，但事件会正确触发
     *
     * 相关代码：SimulatedMouseTrajectory() 方法（更复杂的轨迹模拟），MoveMouseTo() 方法（统一移动方法）
     */
    private async CalculatedMouseTrajectory(targetX: number, targetY: number): Promise<void> {
        try {
            // 獲取當前鼠標位置（如果無法獲取，使用視口中心作為起點）
            // 注意：CDP 沒有直接獲取當前鼠標位置的方法，所以我們使用視口中心作為起點
            let viewportWidth = 1920;
            let viewportHeight = 1080;

            try {
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
            // 目標總時間：短距離（<200px）至少 200ms，長距離（>500px）至少 500ms
            // 確保移動過程可見，模擬真實的鼠標移動速度
            const minTotalTime = 0.2; // 最小總時間 200ms
            const maxTotalTime = 0.8; // 最大總時間 800ms
            const targetTotalTime = Math.min(maxTotalTime, Math.max(minTotalTime, distance / 1000)); // 根據距離計算目標總時間

            // 增加步數，確保移動流暢可見
            const minSteps = 20;
            const maxSteps = 80;
            const steps = Math.max(minSteps, Math.min(maxSteps, Math.floor(distance / 15)));

            // 計算每步的平均延遲時間
            const avgDelayPerStep = targetTotalTime / steps;
            // 每步延遲範圍：平均值的 0.7-1.3 倍，添加隨機性
            const minDelayPerStep = avgDelayPerStep * 0.7;
            const maxDelayPerStep = avgDelayPerStep * 1.3;

            // 生成貝塞爾曲線控制點（添加一些隨機性）
            const controlPoint1X = startX + (targetX - startX) * 0.25 + (Math.random() - 0.5) * distance * 0.1;
            const controlPoint1Y = startY + (targetY - startY) * 0.25 + (Math.random() - 0.5) * distance * 0.1;
            const controlPoint2X = startX + (targetX - startX) * 0.75 + (Math.random() - 0.5) * distance * 0.1;
            const controlPoint2Y = startY + (targetY - startY) * 0.75 + (Math.random() - 0.5) * distance * 0.1;

            // 生成軌跡點
            const trajectory: Array<{ x: number; y: number; delay: number }> = [];

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

                // 計算速度曲線（ease-in-out，中間快，兩端慢）
                const speedFactor = t < 0.5
                    ? 2 * t * t  // 加速階段
                    : 1 - Math.pow(-2 * t + 2, 2) / 2; // 減速階段

                // 根據速度曲線計算延遲（中間快，兩端慢）
                const delay = minDelayPerStep + (maxDelayPerStep - minDelayPerStep) * (1 - speedFactor) + Math.random() * (maxDelayPerStep - minDelayPerStep) * 0.1;

                trajectory.push({
                    x: Math.round(x + jitterX),
                    y: Math.round(y + jitterY),
                    delay: Math.max(0.01, delay) // 確保最小延遲 10ms
                });
            }

            // 執行鼠標移動，每個點之間添加隨機延遲
            // 注意：CDP 的 mouseMoved 事件不會更新瀏覽器窗口中實際的鼠標指針位置
            // 這是 Chrome 的安全特性，但事件會正確觸發，頁面上的 hover 等事件會正常工作
            for (let i = 0; i < trajectory.length; i++) {
                const point = trajectory[i];

                await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: point.x,
                    y: point.y,
                    button: 'none',
                    modifiers: 0
                });

                // 使用計算出的延遲時間
                if (i < trajectory.length - 1) {
                    await this.Delay(point.delay);
                } else {
                    // 最後一個點也需要等待，確保瀏覽器處理鼠標移動事件
                    await this.Delay(0.05); // 50毫秒
                }
            }
        } catch (error) {
            OutputLogToFile(`[MouseInstruction] Error simulating mouse trajectory: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            // 如果模擬失敗，直接移動到目標位置
            await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: targetX,
                y: targetY,
                button: 'none',
                modifiers: 0
            });
            // 等待瀏覽器處理鼠標移動事件
            await this.Delay(0.05); // 50毫秒
        }
    }

    /**
     * 业务逻辑：使用更复杂的算法模拟真实鼠标轨迹，基于 humanize 算法，使用多段贝塞尔曲线和更真实的速度曲线，提供最高级别的轨迹模拟
     *
     * 实现方式：将路径分成多段，每段使用不同的贝塞尔曲线控制点，使用对数函数计算步数，添加更多随机性
     *
     * 注意事项：
     * - 使用多段贝塞尔曲线（最多3段），每段使用不同的控制点，轨迹更复杂真实
     * - 使用对数函数计算步数，使短距离和长距离的步数更合理
     * - 总时间更长（短距离至少 250ms，长距离最多 1000ms），移动更慢更真实
     * - 随机抖动更大（±2.5 像素），模拟更明显的手部微颤
     * - 延迟随机性更大（平均值的 0.6-1.4 倍），速度变化更明显
     * - 适用于需要最高级别轨迹模拟的场景，但移动速度较慢
     *
     * 相关代码：CalculatedMouseTrajectory() 方法（简单轨迹模拟），MoveMouseTo() 方法（统一移动方法）
     */
    private async SimulatedMouseTrajectory(targetX: number, targetY: number): Promise<void> {
        try {
            // 獲取視口尺寸
            let viewportWidth = 1920;
            let viewportHeight = 1080;

            try {
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

            // 根據距離動態調整總時間，確保移動過程可見
            // 目標總時間：短距離（<200px）至少 250ms，長距離（>500px）至少 600ms
            const minTotalTime = 0.25; // 最小總時間 250ms
            const maxTotalTime = 1.0; // 最大總時間 1000ms
            const targetTotalTime = Math.min(maxTotalTime, Math.max(minTotalTime, distance / 800)); // 根據距離計算目標總時間

            // 使用更真實的步數計算（基於 humanize 算法）
            // 步數與距離的關係更接近真實人類移動
            const minSteps = 25;
            const maxSteps = 100;
            // 使用對數函數來計算步數，使短距離和長距離的步數更合理
            const steps = Math.max(minSteps, Math.min(maxSteps, Math.floor(Math.log(distance + 1) * 12 + distance / 12)));

            // 計算每步的平均延遲時間
            const avgDelayPerStep = targetTotalTime / steps;
            // 每步延遲範圍：平均值的 0.6-1.4 倍，添加更多隨機性
            const minDelayPerStep = avgDelayPerStep * 0.6;
            const maxDelayPerStep = avgDelayPerStep * 1.4;

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

                    // 根據速度曲線和目標總時間計算延遲（中間快，兩端慢）
                    const delay = minDelayPerStep + (maxDelayPerStep - minDelayPerStep) * (1 - speedFactor) + Math.random() * (maxDelayPerStep - minDelayPerStep) * 0.15;

                    trajectory.push({
                        x: Math.round(x + jitterX),
                        y: Math.round(y + jitterY),
                        delay: Math.max(0.012, delay) // 確保最小延遲 12ms
                    });
                }
            }

            // 執行鼠標移動
            // 注意：CDP 的 mouseMoved 事件不會更新瀏覽器窗口中實際的鼠標指針位置
            // 這是 Chrome 的安全特性，但事件會正確觸發，頁面上的 hover 等事件會正常工作
            for (let i = 0; i < trajectory.length; i++) {
                const point = trajectory[i];

                await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: point.x,
                    y: point.y,
                    button: 'none',
                    modifiers: 0
                });

                // 使用計算出的延遲
                if (i < trajectory.length - 1) {
                    await this.Delay(point.delay);
                } else {
                    // 最後一個點也需要等待，確保瀏覽器處理鼠標移動事件
                    await this.Delay(0.05); // 50毫秒
                }
            }
        } catch (error) {
            OutputLogToFile(`[MouseInstruction] Error simulating mouse trajectory: ${error instanceof Error ? error.message : String(error)}`, { level: LogLevel.ERROR });
            // 如果模擬失敗，直接移動到目標位置
            await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: targetX,
                y: targetY,
                button: 'none',
                modifiers: 0
            });
            // 等待瀏覽器處理鼠標移動事件
            await this.Delay(0.05); // 50毫秒
        }
    }

    /**
     * 业务逻辑：统一的鼠标移动方法，根据 simulate 参数选择不同的轨迹模拟方式，提供灵活的轨迹模拟选项
     *
     * 实现方式：根据 simulate 参数（none、calculated、simulated）调用对应的轨迹模拟方法，默认使用 calculated
     *
     * 注意事项：
     * - simulate 参数可选，默认值为 'calculated'
     * - 'none' 表示不模拟轨迹，直接移动到目标位置
     * - 'calculated' 表示使用简单轨迹模拟（贝塞尔曲线）
     * - 'simulated' 表示使用复杂轨迹模拟（多段贝塞尔曲线）
     * - 如果 simulate 值未知，默认使用 calculated
     *
     * 相关代码：NoneMouseTrajectory()、CalculatedMouseTrajectory()、SimulatedMouseTrajectory() 方法（轨迹模拟实现），Execute() 方法（调用此方法移动鼠标）
     */
    private async MoveMouseTo(targetX: number, targetY: number): Promise<void> {
        const simulateType = this.params.simulate || 'calculated'; // 默認使用 calculated

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
     * 业务逻辑：执行鼠标操作指令，根据 action 参数执行相应的鼠标操作（点击、双击、右键、悬停、移动等），支持元素定位和坐标指定
     *
     * 实现方式：如果指定了 elementName，获取元素中心坐标，否则使用 x、y 坐标，然后根据 action 执行相应的鼠标操作
     *
     * 注意事项：
     * - 执行前会先调用 Delay() 方法处理延迟
     * - 如果指定了 elementName，会先滚动到元素位置，然后获取元素边界框计算中心坐标
     * - 如果未指定 elementName 和坐标，会返回错误
     * - 点击操作会先移动鼠标到目标位置，然后发送 mousePressed 和 mouseReleased 事件
     * - 双击操作会发送两次点击，间隔 150ms，第二次点击的 clickCount 为 2
     * - hover 操作只移动鼠标，不发送点击事件
     * - move_to 操作只移动鼠标到目标位置
     * - 返回结果包含操作坐标和动作类型，用于确认操作成功
     *
     * 相关代码：src/types/instruction.ts - MouseInstructionResult 接口（结果数据结构），MoveMouseTo() 方法（移动鼠标），src/instructions/BaseInstruction.ts - Retry() 方法（重试机制）
     */
    public async Execute(): Promise<MouseInstructionResult> {
        const result = await this.Retry(async () => {
            let defaultResult: MouseInstructionResult = { tabId: this.tabId, id: this.id, success: false, duration: 0 };

            let x: number | undefined = this.params.x;
            let y: number | undefined = this.params.y;

            // 如果指定了元素，获取元素位置
            if (this.params.elementName) {
                // 从 elementManager 获取元素
                const element = elementManager.GetElementByName(this.tabId, this.params.elementName);

                if (!element) {
                    return { ...defaultResult, error: `Element "${this.params.elementName}" not found in element manager` } as MouseInstructionResult;
                }

                // 获取 nodeId
                const nodeId = await element.GetNodeId();
                if (!nodeId) {
                    return { ...defaultResult, error: `Failed to get nodeId for element "${this.params.elementName}"` } as MouseInstructionResult;
                }

                // 滚动到元素位置
                await this.ExecuteCDPCommand('DOM.scrollIntoViewIfNeeded', { nodeId: nodeId });

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
                } else {
                    return { ...defaultResult, error: `Failed to get box model for element "${this.params.elementName}"` } as MouseInstructionResult;
                }
            }

            // 验证坐标是否有效
            if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
                return { ...defaultResult, error: 'Either elementName or valid x/y coordinates must be provided' } as MouseInstructionResult;
            }

            // 执行鼠标操作
            switch (this.params.action) {
                case 'click':
                    // 先移动鼠标到目标位置，确保事件正确触发
                    await this.MoveMouseTo(x, y);
                    await this.Delay(this.delay);
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
                    // 先移动鼠标到目标位置，确保事件正确触发
                    await this.MoveMouseTo(x, y);
                    await this.Delay(this.delay);
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
                    // 先移动鼠标到目标位置，确保事件正确触发
                    await this.MoveMouseTo(x, y);
                    await this.Delay(this.delay);
                    // 第一次点击
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
                    // 双击间隔：通常 50-200ms，这里使用 150ms
                    await this.Delay(0.15);
                    // 第二次点击（clickCount 为 2 表示双击）
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x,
                        y,
                        button: 'left',
                        clickCount: 2
                    });
                    await this.Delay(0.1);
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x,
                        y,
                        button: 'left',
                        clickCount: 2
                    });
                    break;

                case 'hover':
                    // hover 操作也使用模拟鼠标轨迹，更真实
                    await this.MoveMouseTo(x, y);
                    break;

                case 'left_mousedown':
                    // 先移动鼠标到目标位置，确保事件正确触发
                    await this.MoveMouseTo(x, y);
                    await this.Delay(this.delay);
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x,
                        y,
                        button: 'left',
                        clickCount: 1
                    });
                    break;

                case 'left_mouseup':
                    // 先移动鼠标到目标位置，确保事件正确触发
                    await this.MoveMouseTo(x, y);
                    await this.Delay(this.delay);
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x,
                        y,
                        button: 'left',
                        clickCount: 1
                    });
                    break;

                case 'right_mousedown':
                    // 先移动鼠标到目标位置，确保事件正确触发
                    await this.MoveMouseTo(x, y);
                    await this.Delay(this.delay);
                    await this.ExecuteCDPCommand('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x,
                        y,
                        button: 'right',
                        clickCount: 1
                    });
                    break;

                case 'right_mouseup':
                    // 先移动鼠标到目标位置，确保事件正确触发
                    await this.MoveMouseTo(x, y);
                    await this.Delay(this.delay);
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

                default:
                    return { ...defaultResult, error: `Unknown mouse action: ${this.params.action}` } as MouseInstructionResult;
            }

            return { ...defaultResult, success: true, data: { x, y, action: this.params.action } } as MouseInstructionResult;
        });

        return result as MouseInstructionResult;
    }
}

