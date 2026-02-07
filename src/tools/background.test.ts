import { describe, expect, mock, test } from 'bun:test';
import { BackgroundTaskManager } from '../background';
import { createBackgroundTools } from './background';

// Mock the plugin context
function createMockContext() {
  let callCount = 0;
  return {
    client: {
      session: {
        create: mock(async () => ({
          data: { id: `test-session-${++callCount}` },
        })),
        status: mock(async () => ({ data: {} })),
        messages: mock(async () => ({ data: [] })),
        prompt: mock(async () => ({})),
      },
    },
    directory: '/test/directory',
  } as any;
}

describe('background_task tool enforcement', () => {
  test('allowed delegation succeeds', async () => {
    const ctx = createMockContext();
    const manager = new BackgroundTaskManager(ctx);
    const tools = createBackgroundTools(ctx, manager);

    // Launch orchestrator task to get a tracked session
    const orchTask = manager.launch({
      agent: 'orchestrator',
      prompt: 'coordinate',
      description: 'orchestrator task',
      parentSessionId: 'root-session',
    });

    await Promise.resolve();
    await Promise.resolve();

    const orchSessionId = orchTask.sessionId;
    if (!orchSessionId) throw new Error('Expected sessionId to be defined');

    // Delegate from orchestrator to explorer via the tool
    const result = await tools.background_task.execute(
      { agent: 'explorer', prompt: 'search', description: 'search task' },
      { sessionID: orchSessionId },
    );

    expect(result).toContain('Background task launched');
    expect(result).toContain('Task ID:');
  });

  test('blocked delegation returns error', async () => {
    const ctx = createMockContext();
    const manager = new BackgroundTaskManager(ctx);
    const tools = createBackgroundTools(ctx, manager);

    // Launch fixer task to get a tracked session
    const fixerTask = manager.launch({
      agent: 'fixer',
      prompt: 'implement',
      description: 'fixer task',
      parentSessionId: 'root-session',
    });

    await Promise.resolve();
    await Promise.resolve();

    const fixerSessionId = fixerTask.sessionId;
    if (!fixerSessionId) throw new Error('Expected sessionId to be defined');

    // Fixer tries to delegate to oracle — should be blocked
    const result = await tools.background_task.execute(
      { agent: 'oracle', prompt: 'research', description: 'research task' },
      { sessionID: fixerSessionId },
    );

    expect(result).toBe(
      "Agent 'oracle' is not allowed. Allowed agents: explorer",
    );
  });

  test('error message includes all allowed agents', async () => {
    const ctx = createMockContext();
    const manager = new BackgroundTaskManager(ctx);
    const tools = createBackgroundTools(ctx, manager);

    // Launch explorer task (leaf node — no delegation allowed)
    const explorerTask = manager.launch({
      agent: 'explorer',
      prompt: 'search',
      description: 'explorer task',
      parentSessionId: 'root-session',
    });

    await Promise.resolve();
    await Promise.resolve();

    const explorerSessionId = explorerTask.sessionId;
    if (!explorerSessionId) throw new Error('Expected sessionId to be defined');

    // Explorer tries to delegate to fixer — should show empty allowed list
    const result = await tools.background_task.execute(
      { agent: 'fixer', prompt: 'fix', description: 'fix task' },
      { sessionID: explorerSessionId },
    );

    expect(result).toBe("Agent 'fixer' is not allowed. Allowed agents: ");

    // Also verify designer's allowed list shows only explorer
    const designerTask = manager.launch({
      agent: 'designer',
      prompt: 'design',
      description: 'designer task',
      parentSessionId: 'root-session',
    });

    await Promise.resolve();
    await Promise.resolve();

    const designerSessionId = designerTask.sessionId;
    if (!designerSessionId) throw new Error('Expected sessionId to be defined');

    const designerResult = await tools.background_task.execute(
      { agent: 'oracle', prompt: 'research', description: 'research' },
      { sessionID: designerSessionId },
    );

    expect(designerResult).toBe(
      "Agent 'oracle' is not allowed. Allowed agents: explorer",
    );
  });

  test('missing toolContext throws', async () => {
    const ctx = createMockContext();
    const manager = new BackgroundTaskManager(ctx);
    const tools = createBackgroundTools(ctx, manager);

    // Call execute without sessionID — should throw
    await expect(
      tools.background_task.execute(
        { agent: 'explorer', prompt: 'test', description: 'test' },
        {} as any,
      ),
    ).rejects.toThrow('Invalid toolContext: missing sessionID');

    // Also test with undefined toolContext
    await expect(
      tools.background_task.execute(
        { agent: 'explorer', prompt: 'test', description: 'test' },
        undefined as any,
      ),
    ).rejects.toThrow('Invalid toolContext: missing sessionID');
  });

  test('unknown agent name blocked for non-orchestrator', async () => {
    const ctx = createMockContext();
    const manager = new BackgroundTaskManager(ctx);
    const tools = createBackgroundTools(ctx, manager);

    // Launch fixer task
    const fixerTask = manager.launch({
      agent: 'fixer',
      prompt: 'implement',
      description: 'fixer task',
      parentSessionId: 'root-session',
    });

    await Promise.resolve();
    await Promise.resolve();

    const fixerSessionId = fixerTask.sessionId;
    if (!fixerSessionId) throw new Error('Expected sessionId to be defined');

    // Fixer tries to delegate to an unknown agent — should be blocked
    const result = await tools.background_task.execute(
      {
        agent: 'unknown-agent',
        prompt: 'test',
        description: 'test',
      },
      { sessionID: fixerSessionId },
    );

    expect(result).toBe(
      "Agent 'unknown-agent' is not allowed. Allowed agents: explorer",
    );
  });
});
