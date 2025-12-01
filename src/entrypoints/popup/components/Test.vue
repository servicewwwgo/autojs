<script setup lang="ts">

// 导入所有指令类型，用于测试用例
import type {
    NavigateInstruction,
    FindElementInstruction,
    MouseInstruction,
    InputInstruction,
    KeyboardInstruction,
    GetAttributeInstruction,
    ScreenshotInstruction,
    ExecuteScriptInstruction
} from '../../../types';

import { InstructionFactory } from '../../../instructions';
import { elementManager } from '../../../managers';

// ========== 测试用例：各种指令类型 ==========

// 1. 导航指令测试用例
const navigateInstruction_nav_1 = ref<NavigateInstruction>({
    type: 'navigate',
    tabId: 0,
    instructionID: 'inst_nav_1',
    url: 'https://www.google.com',
    delay: 1,
    retry: 1,
    timeout: 30,
    ignoreError: false,
    created_at: Date.now()
});

// 2.0 查找元素指令测试用例 - aria-label="Google 搜索"
const findElementInstruction_find_2_0 = ref<FindElementInstruction>({
    type: 'find_element',
    tabId: 0,
    instructionID: 'inst_find_2_0',
    element: {
        tabId: 0,
        name: 'searchButton',
        description: 'Google 搜索按钮',
        backup: 'Google 搜索',
        selector: 'input[aria-label="Google 搜索"]',
        selectorType: 'css'
    },
    created_at: Date.now()
});

// 2.1 查找元素指令测试用例 - aria-label="搜索"
const findElementInstruction_find_2_1 = ref<FindElementInstruction>({
    type: 'find_element',
    tabId: 0,
    instructionID: 'inst_find_2_1',
    element: {
        tabId: 0,
        name: 'searchInput',
        description: 'Google 搜索输入框',
        backup: '',
        selector: 'textarea[aria-label="搜索"]',
        selectorType: 'css'
    },
    created_at: Date.now()
});

// 3. 文本输入指令测试用例 - aria-label="搜索"
const inputInstruction_input_3_0 = ref<InputInstruction>({
    type: 'input',
    tabId: 0,
    instructionID: 'inst_input_3_0',
    elementName: 'searchButton',
    text: '電腦',
    clear: true,
    delay: 0.1,
    retry: 1,
    created_at: Date.now()
});

// 4. 鼠标操作指令测试用例
const clickInstruction_click_4_0 = ref<MouseInstruction>({
    type: 'mouse',
    tabId: 0,
    instructionID: 'inst_click_4_0',
    elementName: 'searchButton',
    action: 'click',
    created_at: Date.now()
});

// 5. 键盘操作指令测试用例
const keyboardInstruction_key_1 = ref<KeyboardInstruction>({
    type: 'keyboard',
    tabId: 0,
    instructionID: 'inst_key_1',
    elementName: 'searchInput',
    action: 'press',
    key: 'Enter',
    delay: 0.5,
    created_at: Date.now()
});

// 6. 获取元素属性指令测试用例
const getAttributeInstruction_attr_1 = ref<GetAttributeInstruction>({
    type: 'get_attribute',
    tabId: 0,
    instructionID: 'inst_attr_1',
    elementName: 'searchInput',
    attribute: 'value',
    created_at: Date.now()
});

// 7. 截图指令测试用例
const screenshotInstruction_screen_1 = ref<ScreenshotInstruction>({
    type: 'screenshot',
    tabId: 0,
    instructionID: 'inst_screen_1',
    format: 'png',
    quality: 100,
    fullPage: false,
    created_at: Date.now()
});

// 8. 执行脚本指令测试用例
const executeScriptInstruction_script_1 = ref<ExecuteScriptInstruction>({
    type: 'execute_script',
    tabId: 0,
    instructionID: 'inst_script_1',
    script: 'return document.title;',
    args: [],
    created_at: Date.now()
});


export const example = [
    // 1. 导航指令 - 打开网页
    InstructionFactory.toObject(navigateInstruction_nav_1.value, elementManager),
    // 2. 查找元素指令 - 搜索按钮
    InstructionFactory.toObject(findElementInstruction_find_2_0.value, elementManager),
    // 2.1 查找元素指令 - 搜索输入框
    InstructionFactory.toObject(findElementInstruction_find_2_1.value, elementManager),
    // 3. 文本输入指令 - 搜索输入框
    InstructionFactory.toObject(inputInstruction_input_3_0.value, elementManager),
    // 4. 鼠标操作指令 - 搜索按钮
    InstructionFactory.toObject(clickInstruction_click_4_0.value, elementManager),
];



</script>