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
const mockStateGraphInstance = {
  addNode: jest.fn().mockReturnThis(),
  addEdge: jest.fn().mockReturnThis(),
  addConditionalEdges: jest.fn().mockReturnThis(),
  setEntryPoint: jest.fn().mockReturnThis(),
  compile: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({ review_status: 'approved' })
  })
};

jest.unstable_mockModule('@langchain/langgraph', () => ({
  StateGraph: jest.fn().mockImplementation(() => mockStateGraphInstance),
  START: 'START',
  END: 'END'
}));

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
}));

// Dynamic import of the module under test
const { WorkflowManager, updateLatest, aggregateMessages } = await import('./dev-workflow.js');
const fs = (await import('fs/promises')).default;

describe('WorkflowManager', () => {
  let workflow;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateGraphInstance.addNode.mockClear();
    mockStateGraphInstance.addEdge.mockClear();
    mockStateGraphInstance.addConditionalEdges.mockClear();
    mockStateGraphInstance.setEntryPoint.mockClear();
    mockSpawn.mockClear();
    
    workflow = new WorkflowManager({ log: () => {} }, "coder");
  });

  test('should create a state graph with all required nodes', () => {
    workflow.createGraph();
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('coder', expect.any(Function));
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('test_runner', expect.any(Function));
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('reviewer', expect.any(Function));
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('pr_creator', expect.any(Function));
  });

  test('should allow custom entry point', () => {
    workflow = new WorkflowManager({ log: () => {} }, "reviewer");
    workflow.createGraph();
    
    const edges = mockStateGraphInstance.addEdge.mock.calls;
    expect(edges).toEqual(expect.arrayContaining([
      ['START', 'reviewer']
    ]));
  });

  test('should fallback to coder for invalid entry point and log valid nodes', () => {
    const logs = [];
    workflow = new WorkflowManager({ log: (msg) => logs.push(msg) }, "invalid");
    workflow.createGraph();
    
    const edges = mockStateGraphInstance.addEdge.mock.calls;
    expect(edges).toEqual(expect.arrayContaining([
      ['START', 'coder']
    ]));
    expect(logs.some(l => l.includes('Valid nodes are: coder, test_runner, reviewer, pr_creator'))).toBe(true);
  });

  test('should execute the workflow', async () => {
    const result = await workflow.run('Implement feature X');
    expect(result).toBeDefined();
    expect(mockStateGraphInstance.compile().invoke).toHaveBeenCalled();
  });

  test('coder node should invoke gemini and return coded status', async () => {
    // Setup mock spawn for coder
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    // Trigger coder
    const state = { messages: [{ content: 'Build a login form' }] };
    const coderPromise = workflow.coder(state);

    // Simulate process execution
    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('Mocked Code Response'));
      mockChild.emit('close', 0);
    }, 10);

    const result = await coderPromise;
    
    expect(result.code_status).toBe('coded');
    expect(result.messages[0].content).toBe('Mocked Code Response');
  });

  test('should strip null bytes from gemini output', async () => {
    // Setup mock spawn to emit data with null bytes
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    // Trigger coder
    const state = { messages: [{ content: 'Build a login form' }] };
    const coderPromise = workflow.coder(state);

    // Simulate process execution with null bytes
    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('Mocked\x00 '));
      mockChild.stdout.emit('data', Buffer.from('Code\x00 Response'));
      mockChild.emit('close', 0);
    }, 10);

    const result = await coderPromise;
    
    expect(result.messages[0].content).not.toContain('\x00');
    expect(result.messages[0].content).toBe('Mocked Code Response');
  });

  test('should strip disruptive control characters including null bytes', async () => {
    // Setup mock spawn to emit data with various control characters
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const state = { messages: [{ content: 'Build a login form' }] };
    const coderPromise = workflow.coder(state);

    // Simulate process execution with null (\x00), bell (\x07), and escape (\x1B)
    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('Mocked\x00Code\x07Response\x1B'));
      mockChild.emit('close', 0);
    }, 10);

    const result = await coderPromise;
    
    expect(result.messages[0].content).toBe('MockedCodeResponse');
  });

  test('should not modify clean output', async () => {
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const state = { messages: [{ content: 'Clean test' }] };
    const coderPromise = workflow.coder(state);

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('Clean response with spaces and\nnewlines.'));
      mockChild.emit('close', 0);
    }, 10);

    const result = await coderPromise;
    expect(result.messages[0].content).toBe('Clean response with spaces and\nnewlines.');
  });

  test('updateLatest should handle 0 as a valid value', () => {
    expect(updateLatest(10, 0)).toBe(0);
    expect(updateLatest(10, undefined)).toBe(10);
    expect(updateLatest(10, 5)).toBe(5);
    expect(updateLatest(undefined, 0)).toBe(0);
  });

  test('aggregateMessages should append messages', () => {
    const current = ['a'];
    const next = ['b', 'c'];
    expect(aggregateMessages(current, next)).toEqual(['a', 'b', 'c']);
  });

  describe('invokeGemini fallback', () => {
    let logs = [];
    beforeEach(() => {
      logs = [];
      workflow.logger = { log: (msg) => logs.push(msg) };
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
      expect(args[1]).toContain('gemini-3-pro-preview');
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

  describe('Tools', () => {
    test('runCommand should strip null bytes from output', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const promise = workflow.runCommand('ls');

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('file1\x00.txt\n'));
        mockChild.emit('close', 0);
      }, 10);

      const result = await promise;
      
      expect(result.output).not.toContain('\x00');
      expect(result.output).toBe('file1.txt\n');
    });

    test('runCommand should strip ANSI escape sequences fully', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const promise = workflow.runCommand('ls');

      setTimeout(() => {
              // Red color: \x1B[31m
              mockChild.stdout.emit('data', Buffer.from('\x1B[31mRed Text\x1B[0m'));
              mockChild.emit('close', 0);
            }, 10);
        
            const result = await promise;
            
            expect(result.output).toBe('Red Text');
          });
        
          describe('Verbose Logging', () => {
            test('coder node should log system prompt when verbose is true', async () => {
              const logs = [];
              const mockChild = new EventEmitter();
              mockChild.stdout = new EventEmitter();
              mockChild.stderr = new EventEmitter();
              mockSpawn.mockReturnValue(mockChild);
        
              const verboseWorkflow = new WorkflowManager({ log: (msg) => logs.push(msg) }, "coder", true);
              const coderPromise = verboseWorkflow.coder({ messages: [{ content: 'Test prompt' }] });
        
              setTimeout(() => {
                mockChild.stdout.emit('data', Buffer.from('Response'));
                mockChild.emit('close', 0);
              }, 10);
        
              await coderPromise;
              expect(logs.some(l => l.includes('[VERBOSE] Coder System Prompt'))).toBe(true);
            });
        
            test('reviewer node should log system prompt when verbose is true', async () => {
              const logs = [];
              const mockChild = new EventEmitter();
              mockChild.stdout = new EventEmitter();
              mockChild.stderr = new EventEmitter();
              mockSpawn.mockReturnValue(mockChild);
        
              const verboseWorkflow = new WorkflowManager({ log: (msg) => logs.push(msg) }, "reviewer", true);
              const reviewPromise = verboseWorkflow.reviewer({ 
                test_output: "PASS", 
                retry_count: 0,
                messages: [] 
              });
        
              setTimeout(() => {
                mockChild.stdout.emit('data', Buffer.from('APPROVED'));
                mockChild.emit('close', 0);
              }, 10);
        
              await reviewPromise;
              expect(logs.some(l => l.includes('[VERBOSE] Reviewer System Prompt'))).toBe(true);
            });
          });
        });});
