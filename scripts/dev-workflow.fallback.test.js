/**
 * @jest-environment node
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import EventEmitter from 'events';

// Mock child_process for gemini CLI calls
const mockSpawn = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock @langchain/langgraph
jest.unstable_mockModule('@langchain/langgraph', () => ({
  StateGraph: jest.fn().mockImplementation(() => ({
    addNode: jest.fn().mockReturnThis(),
    addEdge: jest.fn().mockReturnThis(),
    addConditionalEdges: jest.fn().mockReturnThis(),
    compile: jest.fn().mockReturnValue({})
  })),
  START: 'START',
  END: 'END'
}));

// Dynamic import of the module under test
const { WorkflowManager } = await import('./dev-workflow.js');

describe('WorkflowManager Model Fallback', () => {
  let workflow;
  let logs = [];

  beforeEach(() => {
    mockSpawn.mockClear();
    logs = [];
    workflow = new WorkflowManager({
      log: (msg) => logs.push(msg)
    });
  });

  test('Success on first try: Should use first model and exit successfully', async () => {
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const invokePromise = workflow.invokeGemini('Hello');

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('Response from first model'));
      mockChild.emit('close', 0);
    }, 10);

    const result = await invokePromise;

    expect(result).toBe('Response from first model');
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const args = mockSpawn.mock.calls[0];
    expect(args[1]).toContain('-m');
    expect(args[1]).toContain('gemini-3-pro-preview'); // Assuming this is the first model in the list
  });

  test('Quota Fallback: Should retry with next model on TerminalQuotaError', async () => {
    const mockChild1 = new EventEmitter();
    mockChild1.stdout = new EventEmitter();
    mockChild1.stderr = new EventEmitter();

    const mockChild2 = new EventEmitter();
    mockChild2.stdout = new EventEmitter();
    mockChild2.stderr = new EventEmitter();

    mockSpawn
      .mockReturnValueOnce(mockChild1)
      .mockReturnValueOnce(mockChild2);

    const invokePromise = workflow.invokeGemini('Hello');

    // First call fails with Quota Error
    setTimeout(() => {
      mockChild1.stderr.emit('data', Buffer.from('TerminalQuotaError: Quota exceeded'));
      mockChild1.emit('close', 1);
    }, 10);

    // Second call succeeds
    setTimeout(() => {
      mockChild2.stdout.emit('data', Buffer.from('Response from second model'));
      mockChild2.emit('close', 0);
    }, 20);

    const result = await invokePromise;

    expect(result).toBe('Response from second model');
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    
    expect(mockSpawn.mock.calls[0][1]).toContain('gemini-3-pro-preview');
    expect(mockSpawn.mock.calls[1][1]).toContain('gemini-3-flash-preview');
    
    expect(logs.some(l => l.includes('Quota exhausted for gemini-3-pro-preview'))).toBe(true);
  });

  test('Exhaustion: Should fail after all models fail with quota errors', async () => {
    // Assuming 3 models in the list
    const mockChild1 = new EventEmitter();
    mockChild1.stdout = new EventEmitter();
    mockChild1.stderr = new EventEmitter();
    const mockChild2 = new EventEmitter();
    mockChild2.stdout = new EventEmitter();
    mockChild2.stderr = new EventEmitter();
    const mockChild3 = new EventEmitter();
    mockChild3.stdout = new EventEmitter();
    mockChild3.stderr = new EventEmitter();

    mockSpawn
      .mockReturnValueOnce(mockChild1)
      .mockReturnValueOnce(mockChild2)
      .mockReturnValueOnce(mockChild3);

    const invokePromise = workflow.invokeGemini('Hello');

    setTimeout(() => {
      mockChild1.stderr.emit('data', Buffer.from('TerminalQuotaError'));
      mockChild1.emit('close', 1);
    }, 10);

    setTimeout(() => {
      mockChild2.stderr.emit('data', Buffer.from('429 Too Many Requests'));
      mockChild2.emit('close', 1);
    }, 20);

    setTimeout(() => {
      mockChild3.stderr.emit('data', Buffer.from('TerminalQuotaError'));
      mockChild3.emit('close', 1);
    }, 30);

    await expect(invokePromise).rejects.toThrow(/All models exhausted/);
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  test('Immediate Failure: Should not fallback on non-quota errors', async () => {
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const invokePromise = workflow.invokeGemini('Hello');

    setTimeout(() => {
      mockChild.stderr.emit('data', Buffer.from('Some other error'));
      mockChild.emit('close', 1);
    }, 10);

    await expect(invokePromise).rejects.toThrow(/Gemini CLI exited with code 1/);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});
