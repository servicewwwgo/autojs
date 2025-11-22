/**
 * 节点配置对象类型
 */
export interface NodeProfile {
    node_type: string;
    node_id: string;
    node_name: string;
    node_token: string;
  }

/**
 * 指令结果类型
 */
export interface InstructionResult {
    instructionID: string;
    success: boolean;
    error?: string;
    duration: number;
    data?: any;
  }
