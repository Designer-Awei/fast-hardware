/**
 * @fileoverview Skills / Agent 进度总线：统一派发 `fast-hardware-skills-progress` 与 IPC，
 * 阶段文案由生产者写入 detail，ChatManager 仅订阅消费，避免引擎与 UI 硬耦合。
 */
(function skillsProgressBus(global) {
    'use strict';

    /** @type {string} */
    const EVENT_NAME = 'fast-hardware-skills-progress';

    /**
     * 广播进度详情到本窗口 + 主进程（供 `onAgentSkillProgress` 等订阅）
     * @param {Record<string, unknown>} [detail] - 载荷，常见字段：type、phase、line、skillName
     * @returns {void}
     */
    function emit(detail) {
        const d = detail != null && typeof detail === 'object' ? { ...detail } : {};
        try {
            global.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: d }));
        } catch (e) {
            console.warn('⚠️ fast-hardware-skills-progress 派发失败:', e?.message || e);
        }
        try {
            if (global.electronAPI && typeof global.electronAPI.publishAgentSkillProgress === 'function') {
                global.electronAPI.publishAgentSkillProgress(d);
            }
        } catch (e) {
            console.warn('⚠️ publishAgentSkillProgress 失败:', e?.message || e);
        }
    }

    global.fastHardwareSkillsProgress = {
        EVENT_NAME,
        emit
    };
})(typeof window !== 'undefined' ? window : globalThis);
