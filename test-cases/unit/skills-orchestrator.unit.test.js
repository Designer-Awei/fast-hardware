/**
 * Fast Hardware - Skills Orchestrator unit tests
 *
 * 说明：
 * - 这里不依赖真实 LLM API，使用 mock LLM：
 *   根据 userMessage 与调用次数，模拟“LLM 选择正确 tool_calls/skills”的行为。
 * - 目标是验证 orchestrator：
 *   1) 能正确解析 tool_calls
 *   2) 能按 skillName 调用对应 skill executor
 *   3) 能在第二轮返回 final_message 后正确结束
 *
 * 运行：
 *   node test-cases/unit/skills-orchestrator.unit.test.js
 */

const assert = require('assert');

const { runAgentLoop } = require('../../skills/orchestrator');
const { listSkillsForLLM, SKILL_NAMES } = require('../../skills/registry');

function runTest(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`✅ ${name}`);
    })
    .catch((err) => {
      console.error(`❌ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function toStrictJsonContent(obj) {
  return JSON.stringify(obj);
}

async function testWebSearchSkillSelection() {
  const expectedSkill = SKILL_NAMES.WEB_SEARCH_EXA;
  const toolCallArgs = { query: 'SG90 datasheet pinout', numResults: 3, type: 'fast' };
  const finalMessage = '已完成联网资料补齐（mock）';

  let skillCalled = 0;
  let calledWithArgs = null;

  const callLLM = async (messages, _model) => {
    const prompt = messages[messages.length - 1]?.content || '';

    // 确保可用 skills 注入到了 prompt 中（验证“LLM 看得到能选的 skills”）
    const skills = listSkillsForLLM();
    for (const s of skills) {
      assert(prompt.includes(s.name), `prompt 缺少 skill: ${s.name}`);
    }

    if (callLLM._count === 0) {
      callLLM._count++;
      return {
        success: true,
        content: toStrictJsonContent({
          reasoning_steps: [{ step: 1, summary: '需要查资料补齐 pinout' }],
          tool_calls: [
            { toolCallId: 't1', skillName: expectedSkill, args: toolCallArgs }
          ]
        })
      };
    }

    return {
      success: true,
      content: toStrictJsonContent({
        reasoning_steps: [{ step: 2, summary: '已获得检索结果' }],
        final_message: finalMessage
      })
    };
  };
  callLLM._count = 0;

  const skillExecutors = {
    [expectedSkill]: async (args) => {
      skillCalled++;
      calledWithArgs = args;
      return { success: true, data: { results: [{ title: 'SG90 pinout', url: 'https://example.com' }] } };
    }
  };

  const res = await runAgentLoop({
    systemPrompt: 'You are a skill orchestrator.',
    userMessage: '请查 SG90 的模块级引脚/引脚证据。',
    availableSkillsForLLM: listSkillsForLLM(),
    model: 'mock-model',
    callLLM,
    skillExecutors,
    maxIterations: 2
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.finalMessage, finalMessage);
  assert.strictEqual(skillCalled, 1);
  assert.deepStrictEqual(calledWithArgs, toolCallArgs);
  assert.strictEqual(res.toolResults.length, 1);
  assert.strictEqual(res.toolResults[0].skillName, expectedSkill);
}

async function testComponentAutocompleteSkillSelection() {
  const expectedSkill = SKILL_NAMES.COMPONENT_AUTOCOMPLETE_VALIDATED;
  const toolCallArgs = {
    missingComponents: [
      { type: 'actuator', name: '舵机' }
    ],
    analysisResult: { components: [{ type: 'actuator', name: '舵机', exists: 0 }] }
  };
  const finalMessage = '已完成缺失元件补全（mock）';

  let skillCalled = 0;
  let calledWithArgs = null;

  const callLLM = async (messages, _model) => {
    if (callLLM._count === 0) {
      callLLM._count++;
      return {
        success: true,
        content: toStrictJsonContent({
          reasoning_steps: [{ step: 1, summary: '缺失元件需要生成/校验' }],
          tool_calls: [{ toolCallId: 't1', skillName: expectedSkill, args: toolCallArgs }]
        })
      };
    }

    return {
      success: true,
      content: toStrictJsonContent({
        reasoning_steps: [{ step: 2, summary: '组件补全完成' }],
        final_message: finalMessage
      })
    };
  };
  callLLM._count = 0;

  const skillExecutors = {
    [expectedSkill]: async (args) => {
      skillCalled++;
      calledWithArgs = args;
      return {
        success: true,
        data: {
          createdComponents: [{ name: '舵机', componentKey: 'std-sg90', status: 'reused' }]
        }
      };
    }
  };

  const res = await runAgentLoop({
    systemPrompt: 'You are a skill orchestrator.',
    userMessage: '根据匹配结果自动补全缺失元件并校验 pin 参数。',
    availableSkillsForLLM: listSkillsForLLM(),
    model: 'mock-model',
    callLLM,
    skillExecutors,
    maxIterations: 2
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.finalMessage, finalMessage);
  assert.strictEqual(skillCalled, 1);
  assert.deepStrictEqual(calledWithArgs, toolCallArgs);
}

async function testUnknownSkillHandling() {
  // 验证 orchestrator 在找不到 executor 时不会崩溃，而是返回失败的 tool result
  const unknownSkill = 'non_existent_skill';

  const callLLM = async (_messages, _model) => {
    if (callLLM._count === 0) {
      callLLM._count++;
      return {
        success: true,
        content: toStrictJsonContent({
          reasoning_steps: [{ step: 1, summary: '选择了一个不存在的 skill（mock）' }],
          tool_calls: [{ toolCallId: 't1', skillName: unknownSkill, args: { any: 1 } }]
        })
      };
    }

    return {
      success: true,
      content: toStrictJsonContent({
        reasoning_steps: [{ step: 2, summary: '即便失败也给出 final_message（mock）' }],
        final_message: '仍结束（mock）'
      })
    };
  };
  callLLM._count = 0;

  const res = await runAgentLoop({
    systemPrompt: 'You are a skill orchestrator.',
    userMessage: '触发一个未知 skill。',
    availableSkillsForLLM: listSkillsForLLM(),
    model: 'mock-model',
    callLLM,
    skillExecutors: {},
    maxIterations: 2
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.toolResults.length, 1);
  assert.strictEqual(res.toolResults[0].skillName, unknownSkill);
  assert.strictEqual(res.toolResults[0].result?.success, false);
}

async function main() {
  await runTest('web_search_exa skill selection', testWebSearchSkillSelection);
  await runTest('component_autocomplete_validated skill selection', testComponentAutocompleteSkillSelection);
  await runTest('unknown skill handling', testUnknownSkillHandling);

  if (process.exitCode) {
    console.error('\nSome tests failed.');
    process.exit(process.exitCode);
  } else {
    console.log('\nAll unit tests passed.');
  }
}

main();

