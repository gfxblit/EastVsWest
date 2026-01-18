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
    invoke: jest.fn().mockResolvedValue({ review_status: 'approved' }),
  }),
};

jest.unstable_mockModule('@langchain/langgraph', () => ({
  StateGraph: jest.fn().mockImplementation(() => mockStateGraphInstance),
  START: 'START',
  END: 'END',
}));

// Mock fs/promises
jest.unstable_mockModule('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  default: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
  },
}));

// Mock readline/promises
const mockRlInstance = {
  question: jest.fn(),
  close: jest.fn(),
};
jest.unstable_mockModule('readline/promises', () => ({
  default: {
    createInterface: jest.fn().mockReturnValue(mockRlInstance),
  },
  createInterface: jest.fn().mockReturnValue(mockRlInstance),
}));

// Dynamic import of the module under test
const { WorkflowManager, updateLatest, aggregateMessages } = await import('./dev-workflow.js');
const fs = (await import('fs/promises')).default;
const readline = (await import('readline/promises')).default;

describe('WorkflowManager', () => {
  let workflow;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateGraphInstance.addNode.mockClear();
    mockStateGraphInstance.addEdge.mockClear();
    mockStateGraphInstance.addConditionalEdges.mockClear();
    mockStateGraphInstance.setEntryPoint.mockClear();
    mockSpawn.mockClear();
    mockRlInstance.question.mockClear();
    mockRlInstance.close.mockClear();
    delete process.env.NTFY_CHANNEL;

    workflow = new WorkflowManager({ log: () => {} });
  });

  test('should create a state graph with all required nodes and compile successfully', () => {
    workflow.createGraph();
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('coder', expect.any(Function));
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith(
      'test_runner',
      expect.any(Function),
    );
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('reviewer', expect.any(Function));
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('pr_creator', expect.any(Function));
    expect(mockStateGraphInstance.compile).toHaveBeenCalled(); // Ensure compile is called
  });

  test('should add all required conditional edges for workflow transitions', () => {
    workflow.createGraph();

    // Check test_runner transitions
    expect(mockStateGraphInstance.addConditionalEdges).toHaveBeenCalledWith(
      'test_runner',
      expect.any(Function),
      expect.objectContaining({
        reviewer: 'reviewer',
        coder: 'coder',
        END: 'END',
      }),
    );

    // Check reviewer transitions
    expect(mockStateGraphInstance.addConditionalEdges).toHaveBeenCalledWith(
      'reviewer',
      expect.any(Function),
      expect.objectContaining({
        pr_creator: 'pr_creator',
        coder: 'coder',
        END: 'END',
      }),
    );

    // Check pr_creator transitions
    expect(mockStateGraphInstance.addConditionalEdges).toHaveBeenCalledWith(
      'pr_creator',
      expect.any(Function),
      expect.objectContaining({
        END: 'END',
      }),
    );
  });

  const validStartNodes = ['coder', 'test_runner', 'reviewer', 'pr_creator'];

  test.each(validStartNodes)('should compile successfully when startNode is "%s"', (startNode) => {
    workflow = new WorkflowManager({ log: () => {} }, startNode);
    expect(() => workflow.createGraph()).not.toThrow();
    expect(mockStateGraphInstance.compile).toHaveBeenCalled();
  });

  test('should fallback to coder for invalid entry point and log valid nodes and compile successfully', () => {
    const logs = [];
    workflow = new WorkflowManager({ log: (msg) => logs.push(msg) }, 'invalid');
    expect(() => workflow.createGraph()).not.toThrow();

    // The conditional edge from START will be called, ensure it targets 'coder'
    expect(mockStateGraphInstance.addConditionalEdges).toHaveBeenCalledWith(
      'START',
      expect.any(Function),
      expect.objectContaining({ coder: 'coder' }),
    );

    expect(mockStateGraphInstance.compile).toHaveBeenCalled();
    expect(
      logs.some((l) =>
        l.includes('Valid nodes are: coder, test_runner, reviewer, pr_creator'),
      ),
    ).toBe(true);
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
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const state = { messages: [{ content: 'Build a login form' }] };
    const coderPromise = workflow.coder(state);

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
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const state = { messages: [{ content: 'Build a login form' }] };
    const coderPromise = workflow.coder(state);

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

  test('should include test failure in coder prompt', async () => {
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const state = {
      messages: [{ content: 'Fix bug' }],
      test_output: 'FAIL: Expected 1 to be 2',
    };
    const coderPromise = workflow.coder(state);

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('Fixing...'));
      mockChild.emit('close', 0);
    }, 10);

    await coderPromise;
    expect(mockSpawn.mock.calls[0][1][3]).toContain('Your previous implementation failed tests.');
    expect(mockSpawn.mock.calls[0][1][3]).toContain('FAIL: Expected 1 to be 2');
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

  test('should allow review to proceed if test_output is empty', async () => {
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const reviewPromise = workflow.reviewer({
      test_output: '',
      retry_count: 0,
    });

    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('Thinking...\nAPPROVED'));
      mockChild.emit('close', 0);
    }, 10);

    const result = await reviewPromise;
    expect(result.review_status).toBe('approved');
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
      expect(mockSpawn.mock.calls[0][1]).toContain('gemini-3-pro-preview');
    });

    test('Quota Fallback: Should retry with next model on TerminalQuotaError', async () => {
      const mockChild1 = new EventEmitter();
      mockChild1.stdout = new EventEmitter();
      mockChild1.stderr = new EventEmitter();
      const mockChild2 = new EventEmitter();
      mockChild2.stdout = new EventEmitter();
      mockChild2.stderr = new EventEmitter();

      mockSpawn.mockReturnValueOnce(mockChild1).mockReturnValueOnce(mockChild2);

      const invokePromise = workflow.invokeGemini('Hello');

      setTimeout(() => {
        mockChild1.stderr.emit('data', Buffer.from('TerminalQuotaError: Quota exceeded'));
        mockChild1.emit('close', 1);
      }, 10);

      setTimeout(() => {
        mockChild2.stdout.emit('data', Buffer.from('Response from second model'));
        mockChild2.emit('close', 0);
      }, 20);

      const result = await invokePromise;
      expect(result).toBe('Response from second model');
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn.mock.calls[0][1]).toContain('gemini-3-pro-preview');
      expect(mockSpawn.mock.calls[1][1]).toContain('gemini-3-flash-preview');
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
      const mockChild4 = new EventEmitter();
      mockChild4.stdout = new EventEmitter();
      mockChild4.stderr = new EventEmitter();

      mockSpawn
        .mockReturnValueOnce(mockChild1)
        .mockReturnValueOnce(mockChild2)
        .mockReturnValueOnce(mockChild3)
        .mockReturnValueOnce(mockChild4);

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
      setTimeout(() => {
        mockChild4.stderr.emit('data', Buffer.from('TerminalQuotaError'));
        mockChild4.emit('close', 1);
      }, 40);

      await expect(invokePromise).rejects.toThrow(/All models exhausted/);
      expect(mockSpawn).toHaveBeenCalledTimes(4);
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
    test('getTmuxSession should return session name from tmux', async () => {
      mockSpawn.mockImplementation((cmd) => {
        const mockChild = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        setTimeout(() => {
          if (cmd === 'tmux') {
            mockChild.stdout.emit('data', Buffer.from('my-session\n'));
          }
          mockChild.emit('close', 0);
        }, 1);
        return mockChild;
      });

      const session = await workflow.getTmuxSession();
      expect(session).toBe('my-session');
    });

    test('getTmuxSession should return no-tmux on error', async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        setTimeout(() => {
          mockChild.emit('error', new Error('tmux not found'));
        }, 1);
        return mockChild;
      });

      const session = await workflow.getTmuxSession();
      expect(session).toBe('no-tmux');
    });

    test('readFile should call fs.readFile', async () => {
      fs.readFile.mockResolvedValue('content');
      const result = await workflow.readFile('test.txt');
      expect(fs.readFile).toHaveBeenCalledWith('test.txt', 'utf-8');
      expect(result).toBe('content');
    });

    test('writeFile should call fs.writeFile', async () => {
      fs.writeFile.mockResolvedValue();
      const result = await workflow.writeFile('test.txt', 'content');
      expect(fs.writeFile).toHaveBeenCalledWith('test.txt', 'content', 'utf-8');
      expect(result).toContain('Successfully wrote');
    });

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

    test('runCommand should handle output containing only null bytes', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const promise = workflow.runCommand('ls');

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('\x00\x00\x00'));
        mockChild.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result.output).toBe('');
    });

    test('runCommand should strip ANSI escape sequences fully', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const promise = workflow.runCommand('ls');

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('\x1B[31mRed Text\x1B[0m'));
        mockChild.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result.output).toBe('Red Text');
    });
  });

  describe('Notifications', () => {
    test('notify should do nothing if NTFY_CHANNEL is not set', async () => {
      await workflow.notify('Title', 'Message');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    test('notify should call curl if NTFY_CHANNEL is set', async () => {
      process.env.NTFY_CHANNEL = 'test-channel';

      // Mock tmux and curl responses
      mockSpawn.mockImplementation((cmd, args) => {
        const mockChild = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        setTimeout(() => {
          if (cmd === 'tmux') {
            mockChild.stdout.emit('data', Buffer.from('test-session\n'));
          }
          mockChild.emit('close', 0);
        }, 1);
        return mockChild;
      });

      await workflow.notify('Title', 'Message', 4);

      expect(mockSpawn).toHaveBeenCalledWith(
        'curl',
        expect.arrayContaining([
          '-sS',
          '-H',
          'Title: Title',
          '-H',
          'Priority: 4',
          '-d',
          expect.stringContaining('Session: test-session\nMessage'),
          'https://ntfy.sh/test-channel',
        ]),
        expect.anything(),
      );
    });

    test('testRunner should notify on failure', async () => {
      process.env.NTFY_CHANNEL = 'test-channel';
      const spy = jest.spyOn(workflow, 'notify');

      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        setTimeout(() => {
          mockChild.stdout.emit('data', Buffer.from('FAIL tests'));
          mockChild.emit('close', 1);
        }, 1);
        return mockChild;
      });

      await workflow.testRunner({ retry_count: 0 });
      expect(spy).toHaveBeenCalledWith(
        'Workflow: Tests Failed',
        expect.stringContaining('Unit tests failed'),
        4,
      );
    });

    test('reviewer should notify on rejection', async () => {
      process.env.NTFY_CHANNEL = 'test-channel';
      const spy = jest.spyOn(workflow, 'notify');

      mockSpawn.mockImplementation(() => {
        const mockChild = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        setTimeout(() => {
          mockChild.stdout.emit('data', Buffer.from('REJECTED because reasons'));
          mockChild.emit('close', 0);
        }, 1);
        return mockChild;
      });

      await workflow.reviewer({ test_output: 'PASS', retry_count: 0 });
      expect(spy).toHaveBeenCalledWith(
        'Workflow: Review Rejected',
        expect.stringContaining('Reviewer rejected'),
        4,
      );
    });
  });

  describe('Reviewer Node', () => {
    test('reviewer node should return approved status if approved in response', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const reviewPromise = workflow.reviewer({ test_output: 'PASS', retry_count: 0 });

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('APPROVED'));
        mockChild.emit('close', 0);
      }, 10);

      const result = await reviewPromise;
      expect(result.review_status).toBe('approved');
    });

    test('reviewer node should return rejected status if rejected in response', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const reviewPromise = workflow.reviewer({ test_output: 'PASS', retry_count: 0 });

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('REJECTED: some issues'));
        mockChild.emit('close', 0);
      }, 10);

      const result = await reviewPromise;
      expect(result.review_status).toBe('rejected');
      expect(result.retry_count).toBe(1);
    });

    test('reviewer node should reject and increment retry if tests failed', async () => {
      const result = await workflow.reviewer({ test_output: 'FAIL', retry_count: 0 });
      expect(result.review_status).toBe('rejected');
      expect(result.retry_count).toBe(1);
    });
  });

  describe('Verbose Logging', () => {
    test('coder node should log system prompt when verbose is true', async () => {
      const logs = [];
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const verboseWorkflow = new WorkflowManager({ log: (msg) => logs.push(msg) }, 'coder', true);
      const coderPromise = verboseWorkflow.coder({ messages: [{ content: 'Test prompt' }] });

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('Response'));
        mockChild.emit('close', 0);
      }, 10);

      await coderPromise;
      expect(logs.some((l) => l.includes('[VERBOSE] Coder System Prompt'))).toBe(true);
    });

    test('reviewer node should log system prompt when verbose is true', async () => {
      const logs = [];
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const verboseWorkflow = new WorkflowManager(
        { log: (msg) => logs.push(msg) },
        'reviewer',
        true,
      );
      const reviewPromise = verboseWorkflow.reviewer({
        test_output: 'PASS',
        retry_count: 0,
        messages: [],
      });

      setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('APPROVED'));
        mockChild.emit('close', 0);
      }, 10);

      await reviewPromise;
      expect(logs.some((l) => l.includes('[VERBOSE] Reviewer System Prompt'))).toBe(true);
    });
  });

  describe('Conditional Logic', () => {
    test('shouldContinueFromTest returns reviewer on PASS', () => {
      expect(workflow.shouldContinueFromTest({ test_output: 'PASS' })).toBe('reviewer');
    });

    test('shouldContinueFromTest returns coder on FAIL and increments retry', () => {
      expect(workflow.shouldContinueFromTest({ test_output: 'FAIL', retry_count: 0 })).toBe(
        'coder',
      );
    });

    test('shouldContinueFromReview returns pr_creator on approved', () => {
      expect(workflow.shouldContinueFromReview({ review_status: 'approved' })).toBe('pr_creator');
    });

    test('shouldContinueFromReview returns coder on rejected', () => {
      expect(workflow.shouldContinueFromReview({ review_status: 'rejected', retry_count: 0 })).toBe(
        'coder',
      );
    });

    test('shouldContinueFromPrCreator returns coder on needs_commit or pr_failed', () => {
      expect(
        workflow.shouldContinueFromPrCreator({ review_status: 'needs_commit', retry_count: 0 }),
      ).toBe('coder');
      expect(
        workflow.shouldContinueFromPrCreator({ review_status: 'pr_failed', retry_count: 0 }),
      ).toBe('coder');
    });

    test('shouldContinueFromPrCreator returns END on pr_failed with retries > 3', () => {
      expect(
        workflow.shouldContinueFromPrCreator({ review_status: 'pr_failed', retry_count: 4 }),
      ).toBe('END');
    });
  });

  describe('PR Creator', () => {
    test('should push changes and create PR in prCreator', async () => {
      mockSpawn.mockImplementation((cmd, args) => {
        const mockChild = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        setTimeout(() => {
          if (cmd === 'git' && args[0] === 'branch') {
            mockChild.stdout.emit('data', Buffer.from('feature-branch\n'));
          } else if (cmd === 'git' && args[0] === 'status') {
            mockChild.stdout.emit('data', Buffer.from(''));
          } else if (cmd === 'git' && args[0] === 'push') {
            mockChild.emit('close', 0);
          } else if (cmd === 'gh' && args[0] === 'pr') {
            mockChild.stdout.emit('data', Buffer.from('https://github.com/org/repo/pull/1\n'));
            mockChild.emit('close', 0);
          }
          mockChild.emit('close', 0);
        }, 1);
        return mockChild;
      });

      const result = await workflow.prCreator({});
      expect(result.review_status).toBe('pr_created');
      expect(result.messages[0].content).toContain('PR Created');
    });

    test('should treat already existing PR as success in prCreator', async () => {
      mockSpawn.mockImplementation((cmd, args) => {
        const mockChild = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        setTimeout(() => {
          if (cmd === 'git' && args[0] === 'branch') {
            mockChild.stdout.emit('data', Buffer.from('feature-branch\n'));
          } else if (cmd === 'git' && args[0] === 'status') {
            mockChild.stdout.emit('data', Buffer.from(''));
          } else if (cmd === 'git' && args[0] === 'push') {
            mockChild.emit('close', 0);
          } else if (cmd === 'gh' && args[0] === 'pr') {
            mockChild.stdout.emit(
              'data',
              Buffer.from('a pull request already exists: https://github.com/org/repo/pull/1\n'),
            );
            mockChild.emit('close', 1);
          }
          mockChild.emit('close', 0);
        }, 1);
        return mockChild;
      });

      const result = await workflow.prCreator({});
      expect(result.review_status).toBe('pr_created');
      expect(result.messages[0].content).toContain('PR already exists');
    });

    test('should return needs_commit in prCreator if changes are uncommitted', async () => {
      mockSpawn.mockImplementation((cmd, args) => {
        const mockChild = new EventEmitter();
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        setTimeout(() => {
          if (cmd === 'git' && args[0] === 'branch') {
            mockChild.stdout.emit('data', Buffer.from('feature-branch\n'));
          } else if (cmd === 'git' && args[0] === 'status') {
            mockChild.stdout.emit('data', Buffer.from('M file.js\n'));
          }
          mockChild.emit('close', 0);
        }, 1);
        return mockChild;
      });

      const result = await workflow.prCreator({ retry_count: 0 });
      expect(result.review_status).toBe('needs_commit');
    });
  });
});
