/**
 * 直连对话「工作区工具」子系统：协议解析、别名规范、追踪气泡文案（与 `project-workspace-tools.js` 执行层分离，便于单测）。
 * @module tools/workspace-direct-chat-tools
 */

/**
 * 从模型输出中提取首个花括号配平的 JSON 子串（与 `skills-agent-shared` 同思路）。
 * @param {string} s
 * @returns {string|null}
 */
export function extractBalancedJsonObject(s) {
    const text = String(s || '');
    const start = text.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (inString) {
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

/**
 * 解析模型返回的 JSON（容忍围栏与前后噪声）。
 * @param {string} text
 * @returns {any}
 */
export function parseLooseJsonFromModel(text) {
    let s = String(text || '').trim();
    if (!s) return null;
    if (/^```(?:json)?\s*/i.test(s)) {
        s = s.replace(/^```(?:json)?\s*/i, '');
        const close = s.lastIndexOf('```');
        if (close >= 0) s = s.slice(0, close).trim();
    }
    try {
        return JSON.parse(s);
    } catch {
        /* empty */
    }
    const balanced = extractBalancedJsonObject(s);
    if (balanced) {
        try {
            return JSON.parse(balanced);
        } catch {
            /* empty */
        }
    }
    return null;
}

/**
 * 从直连工作区协议的模型输出中提取用户可见 Markdown（`final_message`）。
 * @param {string} raw
 * @returns {string}
 */
export function extractDirectWorkspaceFinalMessage(raw) {
    const tryObj = (o) => {
        if (o && typeof o === 'object' && typeof o.final_message === 'string') {
            const t = o.final_message.trim();
            return t || '';
        }
        return '';
    };
    const a = tryObj(parseLooseJsonFromModel(raw));
    if (a) return a;
    let s = String(raw || '').trim();
    if (/^```(?:json)?\s*/i.test(s)) {
        s = s.replace(/^```(?:json)?\s*/i, '');
        const close = s.lastIndexOf('```');
        if (close >= 0) s = s.slice(0, close).trim();
        const b = tryObj(parseLooseJsonFromModel(s));
        if (b) return b;
        const bal = extractBalancedJsonObject(s);
        if (bal) {
            try {
                const c = tryObj(JSON.parse(bal));
                if (c) return c;
            } catch {
                /* empty */
            }
        }
    }
    return '';
}

/**
 * 工作区工具在追踪气泡中的短标题
 * @param {string} toolName
 * @returns {string}
 */
export function workspaceToolShortNameForUi(toolName) {
    const n = String(toolName || '').toLowerCase();
    const map = {
        list_dir: '工作区 · 列目录',
        read_file: '工作区 · 读文件',
        grep_workspace: '工作区 · 搜索',
        workspace_list_dir: '工作区 · 列目录',
        workspace_read_file: '工作区 · 读文件',
        workspace_grep: '工作区 · 搜索',
        workspace_explore: '工作区 · 浏览',
        workspace_verify: '工作区 · 校验'
    };
    return map[n] || toolName || '工作区工具';
}

/**
 * @param {object} args
 * @returns {string}
 */
export function workspaceToolArgsPreview(args) {
    try {
        const t = JSON.stringify(args ?? {}, null, 0);
        return t.length > 1200 ? `${t.slice(0, 1200)}…` : t;
    } catch {
        return String(args ?? '');
    }
}

/**
 * @param {Record<string, unknown>} one - `_executeProjectWorkspaceTool` 返回值
 * @returns {string}
 */
export function workspaceToolResultPreview(one) {
    if (!one || typeof one !== 'object') return '';
    if (one.success === false && one.error != null) {
        return String(one.error);
    }
    try {
        const t = JSON.stringify(one);
        return t.length > 2400 ? `${t.slice(0, 2400)}…` : t;
    } catch {
        return String(one);
    }
}

/**
 * 工具执行前：折叠块内一句话说明（无参数表）
 * @param {string} toolName
 * @param {object} args
 * @returns {string}
 */
export function workspaceToolPlanningSummary(toolName, args) {
    const a = args && typeof args === 'object' ? args : {};
    const rel = String(a.relativePath ?? '.').trim() || '.';
    const nl = String(toolName || '').toLowerCase();
    const readPath = String(a.relativePath || '').trim();
    if (nl.includes('list') || nl.includes('list_dir')) {
        return `准备查看项目目录「${rel}」里有哪些文件与子文件夹。`;
    }
    if (nl.includes('read') || nl.includes('read_file')) {
        const hasSl = a.startLine != null && String(a.startLine).trim() !== '';
        const hasEl = a.endLine != null && String(a.endLine).trim() !== '';
        const co = Number(a.charOffset);
        const lineWin =
            hasSl || hasEl
                ? `（行 ${hasSl ? String(a.startLine).trim() : '1'}${hasEl ? `–${String(a.endLine).trim()}` : ' 起默认窗'}）`
                : '';
        const charWin =
            !lineWin && Number.isFinite(co) && Math.floor(co) > 0
                ? `（从第 ${Math.floor(co)} 字符起）`
                : '';
        return `准备读取「${readPath || '（路径未填）'}」${lineWin}${charWin}。`;
    }
    if (nl.includes('grep')) {
        const p = String(a.pattern || '').trim().slice(0, 48);
        return `准备在项目文本文件里搜索「${p || '（关键词未填）'}」。`;
    }
    if (nl.includes('explore')) {
        return `准备浏览「${rel}」下的目录结构（递归有限深度）。`;
    }
    if (nl.includes('verify')) {
        return `准备检查路径「${readPath || rel}」是否存在。`;
    }
    return `准备执行：${workspaceToolShortNameForUi(toolName)}。`;
}

/**
 * 工具完成后：折叠块内一句话说明（无原始 JSON）
 * @param {string} toolName
 * @param {object} args
 * @param {Record<string, unknown>} result
 * @returns {string}
 */
export function workspaceToolDetailSummary(toolName, args, result) {
    const a = args && typeof args === 'object' ? args : {};
    const rel = String(a.relativePath ?? '.').trim() || '.';
    const r = result && typeof result === 'object' ? result : {};
    if (r.success === false && r.error != null) {
        return `${workspaceToolShortNameForUi(toolName)}未能完成：${String(r.error).slice(0, 160)}${String(r.error).length > 160 ? '…' : ''}`;
    }
    const nl = String(toolName || '').toLowerCase();
    if (nl.includes('list') || nl.includes('list_dir')) {
        const fc = typeof r.counts === 'object' && r.counts ? Number(r.counts.files) : NaN;
        const dc = typeof r.counts === 'object' && r.counts ? Number(r.counts.directories) : NaN;
        const fs = Number.isFinite(fc) ? fc : (Array.isArray(r.files) ? r.files.length : '?');
        const ds = Number.isFinite(dc) ? dc : (Array.isArray(r.directories) ? r.directories.length : '?');
        return `已列出「${rel}」：约 ${fs} 个文件、${ds} 个子文件夹。`;
    }
    if (nl.includes('read') || nl.includes('read_file')) {
        const p = String(a.relativePath || '').trim() || rel;
        const fullLen = typeof r.length === 'number' ? r.length : null;
        const lines = typeof r.totalLines === 'number' ? r.totalLines : null;
        const lr = r.lineRange && typeof r.lineRange === 'object' ? r.lineRange : null;
        const rangeStr =
            lr && typeof lr.start === 'number' && typeof lr.end === 'number'
                ? ` 第 ${lr.start}–${lr.end} 行`
                : '';
        const piece = typeof r.contentChars === 'number' ? r.contentChars : null;
        const tr = r.truncated
            ? `；未读全（全文 ${fullLen != null ? `${fullLen} 字符` : ''}${lines != null ? `、${lines} 行` : ''}${
                  r.nextStartLine != null ? `，下一窗 startLine=${r.nextStartLine}` : ''
              }${r.nextCharOffset != null ? ` 或 charOffset=${r.nextCharOffset}` : ''}）`
            : '';
        return `已读取「${p}」${rangeStr}${piece != null ? `，片段约 ${piece} 字` : ''}${tr}。`;
    }
    if (nl.includes('grep')) {
        const pat = String(a.pattern || '').trim();
        const m = Array.isArray(r.matches) ? r.matches.length : 0;
        return `已在项目文件中搜索「${pat.slice(0, 36)}${pat.length > 36 ? '…' : ''}」，共命中 ${m} 处。`;
    }
    if (nl.includes('explore')) {
        const n = Array.isArray(r.entries) ? r.entries.length : 0;
        return `已浏览目录树（根「${rel}」），累计 ${n} 条路径。`;
    }
    if (nl.includes('verify')) {
        const p = String(a.relativePath || '').trim() || rel;
        const ok = r.exists !== false;
        return `路径「${p}」${ok ? '存在' : '不存在'}。`;
    }
    return `已完成：${workspaceToolShortNameForUi(toolName)}。`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function canonicalWorkspaceToolName(name) {
    const n = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_');
    const map = {
        list_dir: 'list_dir',
        listdir: 'list_dir',
        read_file: 'read_file',
        readfile: 'read_file',
        grep_workspace: 'grep_workspace',
        grep: 'grep_workspace',
        workspace_grep: 'workspace_grep',
        workspace_list_dir: 'workspace_list_dir',
        workspace_read_file: 'workspace_read_file',
        explore_workspace: 'workspace_explore',
        explore: 'workspace_explore',
        workspace_explore: 'workspace_explore',
        verify_workspace: 'workspace_verify',
        verify: 'workspace_verify',
        workspace_verify: 'workspace_verify'
    };
    return map[n] || n;
}

/** @type {readonly string[]} */
const ALLOWED_WORKSPACE_TOOL_SHORT_NAMES = Object.freeze([
    'list_dir',
    'read_file',
    'grep_workspace',
    'workspace_list_dir',
    'workspace_read_file',
    'workspace_grep',
    'workspace_explore',
    'workspace_verify'
]);

/**
 * @param {any} raw
 * @returns {Array<{ toolCallId: string, name: string, args: object }>}
 */
export function normalizeWorkspaceToolCalls(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((x) => x && typeof x === 'object')
        .map((x, idx) => {
            let argsRaw = x.args !== undefined && x.args !== null ? x.args : x.arguments;
            if (typeof argsRaw === 'string') {
                try {
                    argsRaw = JSON.parse(argsRaw);
                } catch {
                    argsRaw = {};
                }
            }
            const args = argsRaw != null && typeof argsRaw === 'object' ? argsRaw : {};
            const rawName = String(x.name || x.tool || x.tool_name || '').trim();
            return {
                toolCallId: String(x.toolCallId || x.id || `ws_${idx + 1}`),
                name: canonicalWorkspaceToolName(rawName),
                args
            };
        })
        .filter((x) => ALLOWED_WORKSPACE_TOOL_SHORT_NAMES.includes(x.name));
}
