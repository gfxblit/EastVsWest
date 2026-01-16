/**
 * @jest-environment node
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import EventEmitter from 'events';

// Capture mock instances to verify calls
const mockStateGraphInstance = {
  addNode: jest.fn().mockReturnThis(),
  addEdge: jest.fn().mockReturnThis(),
  addConditionalEdges: jest.fn().mockReturnThis(),
  setEntryPoint: jest.fn().mockReturnThis(),
  compile: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({ messages: [], plan: "Done" })
  })
};

jest.unstable_mockModule('@langchain/langgraph', () => ({
  StateGraph: jest.fn().mockImplementation(() => mockStateGraphInstance),
  START: 'START',
  END: 'END'
}));

// Mock child_process for gemini CLI calls
const mockSpawn = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
  exec: jest.fn() // Keeping exec mock just in case, though unused now
}));

jest.unstable_mockModule('readline/promises', () => ({
  default: {
    createInterface: jest.fn().mockReturnValue({
      question: jest.fn().mockResolvedValue('yes'),
      close: jest.fn()
    })
  }
}));

jest.unstable_mockModule('fs/promises', () => ({
  default: {
    readFile: jest.fn().mockResolvedValue('file content'),
    writeFile: jest.fn().mockResolvedValue(undefined)
  }
}));

// Dynamic import of the module under test
const { WorkflowManager } = await import('./dev-workflow.js');
const fs = (await import('fs/promises')).default;

describe('WorkflowManager', () => {
  let workflow;

  beforeEach(() => {
    // Clear mock data
    mockStateGraphInstance.addNode.mockClear();
    mockStateGraphInstance.addEdge.mockClear();
    mockStateGraphInstance.addConditionalEdges.mockClear();
    mockStateGraphInstance.setEntryPoint.mockClear();
    mockSpawn.mockClear();
    
    workflow = new WorkflowManager();
  });

  test('should create a state graph with all required nodes', () => {
    workflow.createGraph();
    
    // Verify Nodes
    const addedNodes = mockStateGraphInstance.addNode.mock.calls.map(args => args[0]);
    expect(addedNodes).toContain('coder');
    expect(addedNodes).toContain('test_runner');
    expect(addedNodes).toContain('reviewer');

    // Verify Edges (Simplified flow)
    const edges = mockStateGraphInstance.addEdge.mock.calls;
    expect(edges).toEqual(expect.arrayContaining([
      ['START', 'coder'],
      ['coder', 'test_runner']
    ]));
  });

  test('should execute the workflow', async () => {
    const result = await workflow.run('Implement feature X');
    expect(result).toBeDefined();
  });

  test('should invoke gemini cli for coder via spawn', async () => {
    // Setup mock spawn to emit data
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    // Trigger coder
    const state = { messages: [{ content: 'Build a login form' }] };
    const coderPromise = workflow.coder(state);

    // Simulate process execution
    setTimeout(() => {
      mockChild.stdout.emit('data', Buffer.from('Mocked '));
      mockChild.stdout.emit('data', Buffer.from('Code Response'));
      mockChild.emit('close', 0);
    }, 10);

    const result = await coderPromise;
    
    expect(mockSpawn).toHaveBeenCalled();
    const args = mockSpawn.mock.calls[0];
    expect(args[0]).toBe('gemini');
    expect(args[1]).toContain('--yolo');
    expect(args[1][args[1].length - 1]).toContain('Build a login form');
    expect(result.messages[0].content).toBe('Mocked Code Response');
  });

  test('should run tests via npm test', async () => {
    // Setup mock spawn to emit data
    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockChild);

    const testPromise = workflow.testRunner({ retry_count: 0 });

    // Simulate passing tests
    setTimeout(() => {
        mockChild.stdout.emit('data', Buffer.from('Test Suites: 1 passed, 1 total'));
        mockChild.emit('close', 0);
    }, 10);

    const result = await testPromise;

    expect(mockSpawn).toHaveBeenCalled();
    const args = mockSpawn.mock.calls[0];
    expect(args[0]).toBe('npm');
    expect(args[1]).toEqual(['test']);
    expect(result.test_output).toBe('PASS');
  });

  test('should increment retry count on failing tests', async () => {
     // Setup mock spawn to emit data
     const mockChild = new EventEmitter();
     mockChild.stdout = new EventEmitter();
     mockChild.stderr = new EventEmitter();
     mockSpawn.mockReturnValue(mockChild);
 
     const testPromise = workflow.testRunner({ retry_count: 1 });
 
     // Simulate failing tests
     setTimeout(() => {
         mockChild.stdout.emit('data', Buffer.from('FAIL  some.test.js'));
         mockChild.emit('close', 1);
     }, 10);
 
     const result = await testPromise;
 
     expect(result.test_output).toContain('FAIL');
     expect(result.retry_count).toBe(2);
  });

  test('should parse "APPROVED" from reviewer', async () => {
     // Setup mock spawn
     const mockChild = new EventEmitter();
     mockChild.stdout = new EventEmitter();
     mockChild.stderr = new EventEmitter();
     mockSpawn.mockReturnValue(mockChild);
 
     const reviewPromise = workflow.reviewer({ 
         test_output: "PASS", 
         retry_count: 0 
     });
 
     setTimeout(() => {
         mockChild.stdout.emit('data', Buffer.from('APPROVED'));
         mockChild.emit('close', 0);
     }, 10);
 
     const result = await reviewPromise;
     expect(result.review_status).toBe('approved');
     expect(result.retry_count).toBe(0);
  });

  test('should reject if reviewer says anything other than "APPROVED"', async () => {
     // Setup mock spawn
     const mockChild = new EventEmitter();
     mockChild.stdout = new EventEmitter();
     mockChild.stderr = new EventEmitter();
     mockSpawn.mockReturnValue(mockChild);
 
     const reviewPromise = workflow.reviewer({ 
         test_output: "PASS", 
         retry_count: 0 
     });
 
     setTimeout(() => {
         mockChild.stdout.emit('data', Buffer.from('Looks good but please fix indentation'));
         mockChild.emit('close', 0);
     }, 10);
 
     const result = await reviewPromise;
     expect(result.review_status).toBe('rejected');
     expect(result.retry_count).toBe(1);
  });

  describe('Tools', () => {
    test('readFile should call fs.readFile', async () => {
      const result = await workflow.readFile('test.txt');
      expect(fs.readFile).toHaveBeenCalledWith('test.txt', 'utf-8');
      expect(result).toBe('file content');
    });

    test('writeFile should call fs.writeFile', async () => {
      const result = await workflow.writeFile('test.txt', 'content');
      expect(fs.writeFile).toHaveBeenCalledWith('test.txt', 'content', 'utf-8');
      expect(result).toContain('Successfully wrote');
    });
  });

  describe('Conditional Logic', () => {
    test('shouldContinueFromTest returns reviewer on PASS', () => {
      expect(workflow.shouldContinueFromTest({ test_output: 'PASS', retry_count: 0 })).toBe('reviewer');
    });

    test('shouldContinueFromTest returns coder on FAIL with retries < 4', () => {
      expect(workflow.shouldContinueFromTest({ test_output: 'FAIL: error', retry_count: 3 })).toBe('coder');
    });

    test('shouldContinueFromTest returns END on FAIL with retries > 3', () => {
      expect(workflow.shouldContinueFromTest({ test_output: 'FAIL: error', retry_count: 4 })).toBe('END');
    });

    test('shouldContinueFromReview returns END on approved', () => {
      expect(workflow.shouldContinueFromReview({ review_status: 'approved', retry_count: 0 })).toBe('END');
    });

    test('shouldContinueFromReview returns coder on rejected with retries < 4', () => {
      expect(workflow.shouldContinueFromReview({ review_status: 'rejected', retry_count: 3 })).toBe('coder');
    });

    test('shouldContinueFromReview returns END on rejected with retries > 3', () => {
      expect(workflow.shouldContinueFromReview({ review_status: 'rejected', retry_count: 4 })).toBe('END');
    });
  });
});
