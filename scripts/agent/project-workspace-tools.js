/**
 * @fileoverview 项目工作区读盘工具（list / read / grep / explore / verify）。
 * 供主进程 agent-loop 内联执行，亦可经 IPC 供渲染进程直连对话复用。
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

/** @type {readonly string[]} */
const WORKSPACE_TOOL_IDS = Object.freeze([
  'workspace_list_dir',
  'workspace_read_file',
  'workspace_grep',
  'workspace_explore',
  'workspace_verify'
]);

/**
 * @returns {Array<{ name: string, description: string }>}
 */
function getWorkspaceToolsForAgentList() {
  return [
    {
      name: 'workspace_list_dir',
      description:
        '列出项目内某目录下一层的文件与子文件夹名。args.relativePath 相对项目根（默认 "."）。先于 read 使用以发现 .ino / circuit_config.json 等。'
    },
    {
      name: 'workspace_read_file',
      description:
        '读取项目内 UTF-8 文本。支持 args.relativePath（单文件）或 args.relativePaths（批量，数组/逗号分隔字符串）。args.maxChars 500～64000（默认 12000）。长文件：不传行号时从文件头截断；传 startLine/endLine（1-based 含首尾）按行窗读取；传 charOffset（0-based）用字节窗衔接。返回 totalLines、lineRange、truncated、nextStartLine、nextCharOffset 供翻页。'
    },
    {
      name: 'workspace_grep',
      description:
        '在项目根**一级**文件内按**子串**（非正则）搜索。args.pattern 必填；args.extensions 可选；args.maxFiles / args.maxMatches 可限制体量。'
    },
    {
      name: 'workspace_explore',
      description:
        '递归浏览目录树（BFS，有深度与条数上限）。args.relativePath 默认 "."；args.maxDepth 1～4（默认 2）；args.maxEntries 默认 80。用于「扫一眼」子目录结构。'
    },
    {
      name: 'workspace_verify',
      description:
        '校验路径是否存在及类型/大小。args.relativePath 必填；args.expect 可选 "file"|"directory"。返回 exists、isFile、isDirectory、size。'
    }
  ];
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isWorkspaceToolName(name) {
  return WORKSPACE_TOOL_IDS.includes(String(name || '').trim());
}

/**
 * @param {string} projectRootAbs
 * @param {string} relativePath
 * @returns {{ absolute: string } | { error: string }}
 */
function safeResolveUnderProjectRoot(projectRootAbs, relativePath) {
  const root = path.resolve(String(projectRootAbs || '').trim());
  const rel = String(relativePath ?? '.').trim() || '.';
  const posix = rel.replace(/\\/g, '/');
  const parts = posix.split('/').filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) {
    return { error: '路径不可包含 ..' };
  }
  const absolute = parts.length === 0 ? root : path.resolve(root, ...parts);
  const relCheck = path.relative(root, absolute);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    return { error: '解析路径越出项目根' };
  }
  return { absolute };
}

/**
 * 将直连对话/模型别名规范为内部 tool id。
 * @param {string} raw
 * @returns {string|null}
 */
/** 未指定 endLine 时的默认行窗宽度（平衡单次 token 与往返次数） */
const READ_FILE_DEFAULT_LINE_SPAN = 320;

/** @param {string[]} linesArr lines from full.split(/\r?\n/) */
function charOffsetOfLine1(linesArr, line1) {
  const L = Math.max(1, Math.floor(line1) || 1);
  let o = 0;
  for (let i = 0; i < L - 1 && i < linesArr.length; i++) {
    o += linesArr[i].length + 1;
  }
  return o;
}

/** @param {string[]} linesArr lines from full.split(/\r?\n/) */
function sliceLinesByRange(linesArr, startLine1, endLine1) {
  const n = linesArr.length;
  const sl = Math.max(1, Math.min(Math.floor(startLine1) || 1, Math.max(1, n)));
  const el = Math.max(sl, Math.min(Math.floor(endLine1) || sl, n));
  return { startLine: sl, endLine: el, text: linesArr.slice(sl - 1, el).join('\n') };
}

/**
 * @param {string} text
 * @param {number} maxLen
 * @returns {{ text: string, cutAtNewline: boolean }}
 */
function truncateToMaxCharsPreferNewline(text, maxLen) {
  if (text.length <= maxLen) {
    return { text, cutAtNewline: false };
  }
  const hard = text.slice(0, maxLen);
  const lastBr = hard.lastIndexOf('\n');
  if (lastBr > maxLen * 0.55) {
    return { text: hard.slice(0, lastBr), cutAtNewline: true };
  }
  return { text: hard, cutAtNewline: false };
}

function normalizeWorkspaceToolId(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const map = {
    workspace_list_dir: 'workspace_list_dir',
    workspace_read_file: 'workspace_read_file',
    workspace_grep: 'workspace_grep',
    workspace_explore: 'workspace_explore',
    workspace_verify: 'workspace_verify',
    list_dir: 'workspace_list_dir',
    read_file: 'workspace_read_file',
    read_files: 'workspace_read_file',
    grep_workspace: 'workspace_grep',
    grep: 'workspace_grep',
    explore_workspace: 'workspace_explore',
    explore: 'workspace_explore',
    verify_workspace: 'workspace_verify',
    verify: 'workspace_verify'
  };
  const id = map[s];
  return id && WORKSPACE_TOOL_IDS.includes(id) ? id : null;
}

/**
 * @param {string} toolId
 * @param {object} args
 * @param {string} projectRootAbs
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
async function executeWorkspaceTool(toolId, args, projectRootAbs) {
  const id = normalizeWorkspaceToolId(toolId) || toolId;
  if (!WORKSPACE_TOOL_IDS.includes(id)) {
    return { success: false, error: `未知工作区工具: ${toolId}` };
  }
  const root = String(projectRootAbs || '').trim();
  if (!root) {
    return { success: false, error: '未设置项目根路径' };
  }

  const a = args && typeof args === 'object' ? args : {};

  try {
    if (id === 'workspace_list_dir') {
      const rel = String(a.relativePath ?? '.').trim() || '.';
      const r = safeResolveUnderProjectRoot(root, rel);
      if ('error' in r) return { success: false, error: r.error };
      const entries = await fs.readdir(r.absolute, { withFileTypes: true });
      const files = [];
      const directories = [];
      for (const e of entries) {
        if (e.isFile()) files.push(e.name);
        else if (e.isDirectory()) directories.push(e.name);
      }
      return {
        success: true,
        data: {
          relativePath: rel,
          files,
          directories,
          counts: { files: files.length, directories: directories.length }
        }
      };
    }

    if (id === 'workspace_read_file') {
      const relsFromArray = Array.isArray(a.relativePaths)
        ? a.relativePaths.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const relsFromCsv =
        !relsFromArray.length && typeof a.relativePaths === 'string'
          ? String(a.relativePaths)
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
          : [];
      const rels = [...relsFromArray, ...relsFromCsv].slice(0, 20);
      if (rels.length) {
        const perFileArgsBase = {
          maxChars: a.maxChars,
          startLine: a.startLine,
          endLine: a.endLine,
          charOffset: a.charOffset
        };
        /** @type {Array<{ relativePath: string, success: boolean, data?: any, error?: string }>} */
        const files = [];
        for (const p of rels) {
          const one = await executeWorkspaceTool(
            'workspace_read_file',
            { ...perFileArgsBase, relativePath: p },
            root
          );
          files.push({
            relativePath: p,
            success: !!one?.success,
            data: one?.data,
            error: one?.error
          });
        }
        return {
          success: true,
          data: {
            requested: rels,
            files,
            counts: {
              requested: rels.length,
              success: files.filter((x) => x.success).length,
              failed: files.filter((x) => !x.success).length
            },
            mode: 'batch_via_workspace_read_file'
          }
        };
      }

      const rel = String(a.relativePath || '').trim();
      if (!rel) {
        return {
          success: false,
          error: 'workspace_read_file 需要 args.relativePath（单文件）或 args.relativePaths（批量）'
        };
      }
      const r = safeResolveUnderProjectRoot(root, rel);
      if ('error' in r) return { success: false, error: r.error };
      const maxChars = Math.min(Math.max(Number(a.maxChars) || 12000, 500), 64000);
      const buf = await fs.readFile(r.absolute, 'utf8');
      const full = String(buf);
      const fullLength = full.length;
      const linesArr = full.split(/\r?\n/);
      const totalLines = linesArr.length;

      const hasStartLine = a.startLine != null && String(a.startLine).trim() !== '';
      const hasEndLine = a.endLine != null && String(a.endLine).trim() !== '';
      const charOffsetNum = Number(a.charOffset);
      const useLineMode = hasStartLine || hasEndLine;
      const useCharWindow =
        !useLineMode && Number.isFinite(charOffsetNum) && Math.floor(charOffsetNum) > 0;

      /** @type {string} */
      let content = '';
      let truncated = false;
      /** @type {'head'|'char_window'|'lines'} */
      let readMode = 'head';
      let startLineUsed = 1;
      let endLineUsed = totalLines;
      let charOffsetUsed = 0;
      /** @type {number|null} */
      let nextStartLine = null;
      /** @type {number|null} */
      let nextCharOffset = null;
      /** @type {string} */
      let note = '';

      if (useLineMode) {
        readMode = 'lines';
        startLineUsed = Math.max(
          1,
          Math.min(Math.floor(Number(a.startLine)) || 1, Math.max(1, totalLines))
        );
        if (hasEndLine) {
          endLineUsed = Math.max(
            startLineUsed,
            Math.min(Math.floor(Number(a.endLine)) || startLineUsed, totalLines)
          );
        } else {
          endLineUsed = Math.min(startLineUsed + READ_FILE_DEFAULT_LINE_SPAN - 1, totalLines);
        }
        const sliced = sliceLinesByRange(linesArr, startLineUsed, endLineUsed);
        content = sliced.text;
        const hitLineBudget = endLineUsed < totalLines;
        if (content.length > maxChars) {
          const { text: t, cutAtNewline } = truncateToMaxCharsPreferNewline(content, maxChars);
          content = t;
          truncated = true;
          const linesInChunk = t.length ? t.split('\n').length : 0;
          const actualEndLine = startLineUsed + Math.max(0, linesInChunk - 1);
          endLineUsed = actualEndLine;
          if (cutAtNewline && actualEndLine < totalLines) {
            nextStartLine = actualEndLine + 1;
            note = `因 maxChars 在行 ${actualEndLine} 后截断；可继续 startLine=${nextStartLine}。`;
          } else {
            const startCharInFull = charOffsetOfLine1(linesArr, startLineUsed);
            nextCharOffset = startCharInFull + t.length;
            note = `行窗内因长度触顶截断；请用 charOffset=${nextCharOffset} 续读同一文件。`;
          }
        } else if (hitLineBudget) {
          truncated = true;
          nextStartLine = endLineUsed + 1;
          note = `已读完行 ${startLineUsed}-${endLineUsed}；文件共 ${totalLines} 行，可继续 startLine=${nextStartLine}。`;
        }
      } else if (useCharWindow) {
        readMode = 'char_window';
        charOffsetUsed = Math.max(0, Math.min(Math.floor(charOffsetNum), fullLength));
        content = full.slice(charOffsetUsed, charOffsetUsed + maxChars);
        const ended = charOffsetUsed + content.length;
        truncated = ended < fullLength;
        if (truncated) {
          nextCharOffset = ended;
          note = `字符窗 [${charOffsetUsed}, ${ended})；全文 ${fullLength} 字符，可 charOffset=${nextCharOffset} 续读。`;
        }
      } else {
        readMode = 'head';
        charOffsetUsed = 0;
        if (fullLength > maxChars) {
          const { text: t, cutAtNewline } = truncateToMaxCharsPreferNewline(full, maxChars);
          content = t;
          truncated = true;
          nextCharOffset = t.length;
          const lineCountInContent = t.length ? t.split(/\r?\n/).length : 0;
          endLineUsed = Math.min(lineCountInContent, totalLines);
          startLineUsed = 1;
          if (cutAtNewline && nextCharOffset < fullLength) {
            nextStartLine = endLineUsed + 1;
            note = `文件头截断（优先在换行处）；共 ${totalLines} 行、` +
              `${fullLength} 字符。续读可 startLine=${nextStartLine} 或 charOffset=${nextCharOffset}。`;
          } else {
            note =
              `文件头截断；全文 ${fullLength} 字符。续读请 charOffset=${nextCharOffset}` +
              (totalLines > 1 ? `，或指定 startLine（如 ${Math.min(endLineUsed + 1, totalLines)}）。` : '。');
          }
        } else {
          content = full;
          truncated = false;
          startLineUsed = 1;
          endLineUsed = totalLines;
        }
      }

      return {
        success: true,
        data: {
          relativePath: rel,
          length: fullLength,
          totalLines,
          readMode,
          lineRange:
            readMode === 'lines'
              ? { start: startLineUsed, end: endLineUsed }
              : readMode === 'head' && !truncated
                ? { start: 1, end: totalLines }
                : readMode === 'head' && truncated
                  ? { start: startLineUsed, end: endLineUsed }
                  : null,
          charOffset: readMode === 'char_window' || readMode === 'head' ? charOffsetUsed : null,
          truncated,
          content,
          contentChars: content.length,
          nextStartLine,
          nextCharOffset,
          note: note || undefined
        }
      };
    }

    if (id === 'workspace_grep') {
      const pattern = String(a.pattern || '').trim();
      if (!pattern || pattern.length > 200) {
        return { success: false, error: 'workspace_grep 需要 args.pattern（≤200 字符）' };
      }
      const needle = pattern.toLowerCase();
      const extList = Array.isArray(a.extensions) && a.extensions.length
        ? a.extensions.map((x) => String(x).toLowerCase())
        : ['.ino', '.json', '.md', '.h', '.c', '.cpp', '.txt'];
      const maxFiles = Math.min(Math.max(Number(a.maxFiles) || 12, 1), 40);
      const maxMatches = Math.min(Math.max(Number(a.maxMatches) || 40, 1), 120);

      const rootRes = safeResolveUnderProjectRoot(root, '.');
      if ('error' in rootRes) return { success: false, error: rootRes.error };
      const entries = await fs.readdir(rootRes.absolute, { withFileTypes: true });
      const matches = [];
      let scanned = 0;
      for (const e of entries) {
        if (!e.isFile() || scanned >= maxFiles || matches.length >= maxMatches) break;
        const fn = e.name;
        if (!extList.some((ext) => fn.toLowerCase().endsWith(ext))) continue;
        const abs = path.join(rootRes.absolute, fn);
        let content = '';
        try {
          content = await fs.readFile(abs, 'utf8');
        } catch {
          continue;
        }
        scanned++;
        const lines = String(content).split(/\r?\n/);
        for (let li = 0; li < lines.length; li++) {
          if (matches.length >= maxMatches) break;
          const lineText = lines[li];
          if (lineText.toLowerCase().includes(needle)) {
            const text = lineText.length > 240 ? `${lineText.slice(0, 240)}…` : lineText;
            matches.push({ file: fn, line: li + 1, text });
          }
        }
      }
      return {
        success: true,
        data: {
          pattern,
          scannedFiles: scanned,
          matches,
          note: '仅在项目根目录一级文件内搜索（不含子文件夹）'
        }
      };
    }

    if (id === 'workspace_explore') {
      const rel = String(a.relativePath ?? '.').trim() || '.';
      const baseRes = safeResolveUnderProjectRoot(root, rel);
      if ('error' in baseRes) return { success: false, error: baseRes.error };
      const maxDepth = Math.min(Math.max(Number(a.maxDepth) || 2, 1), 4);
      const maxEntries = Math.min(Math.max(Number(a.maxEntries) || 80, 10), 200);

      /** @type {{ relative: string, type: 'file'|'directory' }[]} */
      const out = [];
      /** @type {{ abs: string, rel: string, depth: number }[]} */
      const q = [{ abs: baseRes.absolute, rel: rel === '.' ? '.' : rel.replace(/\\/g, '/'), depth: 0 }];

      while (q.length > 0 && out.length < maxEntries) {
        const { abs, rel: relPath, depth } = q.shift();
        let entries = [];
        try {
          entries = await fs.readdir(abs, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of entries) {
          if (out.length >= maxEntries) break;
          const childRel =
            relPath === '.' ? e.name : `${relPath.replace(/\/+$/, '')}/${e.name}`;
          const typ = e.isDirectory() ? 'directory' : 'file';
          out.push({ relative: childRel.replace(/\\/g, '/'), type: typ });
          if (e.isDirectory() && depth < maxDepth) {
            q.push({ abs: path.join(abs, e.name), rel: childRel, depth: depth + 1 });
          }
        }
      }
      return {
        success: true,
        data: {
          rootRelative: rel,
          maxDepth,
          maxEntries,
          entries: out,
          truncated: out.length >= maxEntries
        }
      };
    }

    if (id === 'workspace_verify') {
      const rel = String(a.relativePath || '').trim();
      if (!rel) {
        return { success: false, error: 'workspace_verify 需要 args.relativePath' };
      }
      const r = safeResolveUnderProjectRoot(root, rel);
      if ('error' in r) return { success: false, error: r.error };
      let st;
      try {
        st = await fs.stat(r.absolute);
      } catch (e) {
        return {
          success: true,
          data: {
            relativePath: rel,
            exists: false,
            expect: a.expect || null,
            message: e?.code === 'ENOENT' ? '路径不存在' : String(e?.message || e)
          }
        };
      }
      const isFile = st.isFile();
      const isDirectory = st.isDirectory();
      const expect = a.expect ? String(a.expect).trim().toLowerCase() : '';
      let expectOk = true;
      if (expect === 'file' && !isFile) expectOk = false;
      if (expect === 'directory' && !isDirectory) expectOk = false;
      return {
        success: true,
        data: {
          relativePath: rel,
          exists: true,
          isFile,
          isDirectory,
          size: st.size,
          expect: expect || null,
          expectOk: expect ? expectOk : null
        }
      };
    }
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }

  return { success: false, error: `未实现的工具分支: ${id}` };
}

/**
 * 供 IPC / 测试：原样执行（toolName 可为别名）。
 * @param {string} toolName
 * @param {object} args
 * @param {string} projectRootAbs
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
async function executeProjectWorkspaceToolCall(toolName, args, projectRootAbs) {
  const id = normalizeWorkspaceToolId(toolName);
  if (!id) {
    return { success: false, error: `无法识别的工作区工具: ${toolName}` };
  }
  return executeWorkspaceTool(id, args, projectRootAbs);
}

module.exports = {
  WORKSPACE_TOOL_IDS,
  getWorkspaceToolsForAgentList,
  isWorkspaceToolName,
  safeResolveUnderProjectRoot,
  normalizeWorkspaceToolId,
  executeWorkspaceTool,
  executeProjectWorkspaceToolCall
};
