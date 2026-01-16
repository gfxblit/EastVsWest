/**
 * @jest-environment node
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

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

jest.unstable_mockModule('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'Mocked Plan' })
  }))
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
    
    workflow = new WorkflowManager();
  });

  test('should create a state graph with all required nodes', () => {
    workflow.createGraph();
    
    // Verify Nodes
    const addedNodes = mockStateGraphInstance.addNode.mock.calls.map(args => args[0]);
    expect(addedNodes).toContain('planner');
    expect(addedNodes).toContain('human_feedback');
    expect(addedNodes).toContain('coder');
    expect(addedNodes).toContain('test_runner');
    expect(addedNodes).toContain('reviewer');

    // Verify Edges (Basic flow)
    const edges = mockStateGraphInstance.addEdge.mock.calls;
    expect(edges).toEqual(expect.arrayContaining([
      ['START', 'planner'],
      ['planner', 'human_feedback'],
      ['coder', 'test_runner']
    ]));
  });

  test('should execute the workflow', async () => {
    const result = await workflow.run('Implement feature X');
    expect(result).toBeDefined();
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
    test('shouldContinueFromFeedback returns coder on Approved', () => {
      expect(workflow.shouldContinueFromFeedback({ feedback: 'Approved' })).toBe('coder');
    });

    test('shouldContinueFromFeedback returns planner on Rejection', () => {
      expect(workflow.shouldContinueFromFeedback({ feedback: 'Rejected' })).toBe('planner');
    });

    test('shouldContinueFromTest returns reviewer on PASS', () => {
      expect(workflow.shouldContinueFromTest({ test_output: 'PASS' })).toBe('reviewer');
    });

    test('shouldContinueFromTest returns coder on FAIL', () => {
      expect(workflow.shouldContinueFromTest({ test_output: 'FAIL: error' })).toBe('coder');
    });

    test('shouldContinueFromReview returns END on approved', () => {
      expect(workflow.shouldContinueFromReview({ review_status: 'approved' })).toBe('END');
    });

    test('shouldContinueFromReview returns coder on rejected', () => {
      expect(workflow.shouldContinueFromReview({ review_status: 'rejected' })).toBe('coder');
    });
  });
});
