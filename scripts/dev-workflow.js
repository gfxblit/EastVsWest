import { StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { spawn } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro'
];

// --- State Reducers ---

/**
 * Appends new messages to the existing history.
 * @param {Array} current - Current array of messages.
 * @param {Array} next - New messages to append.
 * @returns {Array} The updated message history.
 */
const aggregateMessages = (current, next) => current.concat(next);

/**
 * Updates the state with the latest value. 
 * If a new value is provided, it replaces the old one.
 * @param {any} current - Current value.
 * @param {any} next - New value.
 * @returns {any} The updated value.
 */
const updateLatest = (current, next) => next ? next : current;

// Define the state channels with clear descriptions
const agentStateChannels = {
  /**
   * The conversation history between the agents and the user.
   * Stores an array of LangChain Message objects.
   */
  messages: {
    value: aggregateMessages,
    default: () => [],
  },

  /**
   * The status of the coding phase.
   * Enum-like string: "pending", "coded".
   */
  code_status: {
    value: updateLatest,
    default: () => "pending",
  },

  /**
   * The output from the test runner.
   * String content containing pass/fail logs.
   */
  test_output: {
    value: updateLatest,
    default: () => "",
  },

  /**
   * The decision from the Reviewer agent.
   * Enum-like string: "pending", "approved", "rejected".
   */
  review_status: {
    value: updateLatest,
    default: () => "pending",
  },

  /**
   * The number of times the workflow has looped back to the Coder.
   * Integer count.
   */
  retry_count: {
    value: updateLatest,
    default: () => 0,
  }
};

/**
 * Manages the TDD development workflow using LangGraph and Gemini.
 * Orchestrates the coding, testing, and review phases.
 * 
 * Uses the `gemini` CLI tool for LLM inference instead of direct API calls.
 */
export class WorkflowManager {
  constructor(logger = console) {
    this.graph = null;
    this.logger = logger;
  }

  // --- Helpers ---

  /**
   * Invokes a shell command and streams output to stdout.
   * @param {string} command - The command to run (e.g., 'npm').
   * @param {Array} args - Arguments for the command.
   * @returns {Promise<string>} The combined stdout/stderr output.
   */
  async runCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false 
      });

      let fullOutput = '';
      
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        this.logger.log(chunk);
        fullOutput += chunk;
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        // Do not stream stderr to console to avoid noise (e.g. tool logs)
        // process.stderr.write(chunk); 
        fullOutput += chunk;
      });

      child.on('close', (code) => {
        if (code !== 0) {
          resolve(fullOutput); 
        } else {
          resolve(fullOutput);
        }
      });
      
      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Invokes the Gemini CLI with a prompt, supporting model fallback.
   * Streams output to stdout and returns the full response.
   * @param {string} prompt - The prompt to send.
   * @param {Array} args - (Optional) Additional CLI arguments.
   * @returns {Promise<string>} The generated response.
   */
  async invokeGemini(prompt, args = []) {
    for (let i = 0; i < DEFAULT_MODELS.length; i++) {
      const model = DEFAULT_MODELS[i];
      try {
        return await this._executeGemini(prompt, model, args);
      } catch (error) {
        const isQuotaError = error.message.includes('TerminalQuotaError') || error.message.includes('429');
        const isLastModel = i === DEFAULT_MODELS.length - 1;

        if (isQuotaError && !isLastModel) {
          const nextModel = DEFAULT_MODELS[i + 1];
          this.logger.log(`Quota exhausted for ${model}. Falling back to ${nextModel}...`);
          continue;
        }

        if (isQuotaError && isLastModel) {
          throw new Error(`All models exhausted. Last error: ${error.message}`);
        }

        // Non-quota error, fail immediately
        throw error;
      }
    }
  }

  /**
   * Internal method to execute the Gemini CLI with a specific model.
   * @private
   */
  async _executeGemini(prompt, model, args = []) {
    return new Promise((resolve, reject) => {
      // With shell: false, we don't need to manually escape quotes.
      // Node.js will pass the prompt argument directly to the executable.
      
      const child = spawn('gemini', ['-m', model, ...args, prompt], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false 
      });

      let fullOutput = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        this.logger.log(chunk); // Stream to console
        fullOutput += chunk;
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        // Do not stream stderr to console to avoid noise (e.g. tool logs)
        // process.stderr.write(chunk); 
        errorOutput += chunk;
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Gemini CLI exited with code ${code}: ${errorOutput}`));
        } else {
          resolve(fullOutput.trim());
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  // --- Tools ---
  
  /**
   * Reads a file from the filesystem.
   * @param {string} filePath - Path to the file.
   * @returns {Promise<string>} File content or error message.
   */
  async readFile(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      return `Error reading file: ${error.message}`;
    }
  }

  /**
   * Writes content to a file.
   * @param {string} filePath - Path to the file.
   * @param {string} content - Content to write.
   * @returns {Promise<string>} Success or error message.
   */
  async writeFile(filePath, content) {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    } catch (error) {
      return `Error writing file: ${error.message}`;
    }
  }

  // --- Nodes ---

  async coder(state) {
    const { messages, test_output, review_status } = state;
    this.logger.log("--- Coder Node ---");
    
    // Extract the user's initial request (always the first message)
    const initialRequest = messages[0].content;
    
    let systemPrompt = `You are a software engineer. Implement the following request: ${initialRequest}. 
    You have access to the file system and git.
    
    IMPORTANT: You MUST commit your changes using git. You may create multiple commits if it makes sense for the task.
    Please output the code changes in markdown blocks as well for the conversation record.`;

    // Add context from failures if applicable
    if (test_output && (test_output.includes("FAIL") || test_output.includes("failed"))) {
        systemPrompt = `Your previous implementation failed tests. 
        
        TEST OUTPUT:
        ${test_output}
        
        Please fix the code to satisfy the tests and the original request: ${initialRequest}.
        Make sure to commit your fixes.`;
    } else if (review_status === "rejected") {
        const lastMessage = messages[messages.length - 1];
        systemPrompt = `Your previous implementation was rejected by the reviewer.
        
        REVIEWER FEEDBACK:
        ${lastMessage.content}
        
        Please fix the code to satisfy the reviewer and the original request: ${initialRequest}.
        Make sure to commit your fixes.`;
    }
    
    const codeContent = await this.invokeGemini(systemPrompt, ['--yolo']);
    this.logger.log("\nCoding complete.");

    return { 
      code_status: "coded",
      messages: [new SystemMessage(codeContent)]
    };
  }

  async testRunner(state) {
    this.logger.log("--- Test Runner Node ---");
    const { retry_count } = state;
    
    // Run tests
    try {
      this.logger.log("Running npm test...");
      const unitOutput = await this.runCommand('npm', ['test']);
      
      if (unitOutput.includes('FAIL') || unitOutput.includes('failed')) {
         // Increment retry count on failure
         return { 
             test_output: "FAIL (Unit):\n" + unitOutput,
             retry_count: retry_count + 1,
             messages: [new SystemMessage("Tests failed (Unit):\n" + unitOutput)]
         };
      }

      this.logger.log("Running npm run test:e2e...");
      const e2eOutput = await this.runCommand('npm', ['run', 'test:e2e']);
      
      // Check for failures in E2E
      // Check for "FAIL", "failed" (Jest) and "npm ERR!" (Script exit code != 0)
      if (e2eOutput.includes('FAIL') || e2eOutput.includes('failed') || e2eOutput.includes('npm ERR!')) {
         // Increment retry count on failure
         return { 
             test_output: "FAIL (E2E):\n" + e2eOutput,
             retry_count: retry_count + 1,
             messages: [new SystemMessage("Tests failed (E2E):\n" + e2eOutput)]
         };
      }
      
      return { test_output: "PASS" };
    } catch (error) {
      return { 
          test_output: "FAIL: " + error.message,
          retry_count: retry_count + 1
      };
    }
  }

  async reviewer(state) {
    const { messages, test_output, retry_count } = state;
    this.logger.log("--- Reviewer Node ---");
    
    if (!test_output.includes("PASS")) {
       return { 
           review_status: "rejected", 
           messages: [new SystemMessage("Tests failed.")],
           retry_count: retry_count + 1
       };
    }

    const systemPrompt = `You are a senior reviewer. Review the implementation. 
    You have access to the file system and git.
    
    MANDATORY: You MUST activate the 'pr-reviewer' skill to perform a thorough review of the changes.
    
    You SHOULD use git tools (like 'git log' and 'git diff') to examine the coder's commits and the changes made.
    
    If the code looks correct, safe, and follows the requirements, output "APPROVED". 
    Otherwise, output "REJECTED" followed by a concise explanation of why.`;
    
    const reviewContent = await this.invokeGemini(systemPrompt, ['--yolo']);
    
    // Flexible check for "APPROVED" as a standalone word in the response
    const isApproved = /\bAPPROVED\b/i.test(reviewContent);
    this.logger.log(`\nReview decision: ${isApproved ? "Approved" : "Rejected"}`);
    
    // If rejected, increment retry count
    return { 
      review_status: isApproved ? "approved" : "rejected",
      messages: [new SystemMessage(reviewContent)],
      retry_count: isApproved ? retry_count : retry_count + 1
    };
  }

  // --- Conditional Logic ---
  
  shouldContinueFromTest(state) {
    if (state.test_output === "PASS") {
      return "reviewer";
    }
    
    // Check retries
    if (state.retry_count > 3) {
      this.logger.log("Max retries exceeded. Aborting.");
      return END;
    }
    
    return "coder";
  }

  shouldContinueFromReview(state) {
    if (state.review_status === "approved") {
      return END;
    }
    
    // Check retries
    if (state.retry_count > 3) {
      this.logger.log("Max retries exceeded. Aborting.");
      return END;
    }
    
    return "coder";
  }

  createGraph() {
    const workflow = new StateGraph({
      channels: agentStateChannels
    });

    // Add Nodes
    workflow.addNode("coder", this.coder.bind(this));
    workflow.addNode("test_runner", this.testRunner.bind(this));
    workflow.addNode("reviewer", this.reviewer.bind(this));

    // Add Edges
    workflow.addEdge(START, "coder");
    
    workflow.addEdge("coder", "test_runner");

    workflow.addConditionalEdges(
      "test_runner",
      this.shouldContinueFromTest.bind(this),
      {
        reviewer: "reviewer",
        coder: "coder",
        [END]: END
      }
    );

    workflow.addConditionalEdges(
      "reviewer",
      this.shouldContinueFromReview.bind(this),
      {
        [END]: END,
        coder: "coder"
      }
    );

    this.graph = workflow.compile();
    return this.graph;
  }

  async run(input) {
    if (!this.graph) {
      this.createGraph();
    }
    
    const initialState = {
      messages: [new HumanMessage(input)],
      retry_count: 0
    };

    return await this.graph.invoke(initialState);
  }
}

// CLI Entry Point
if (process.argv[1] === __filename) {
  const prompt = process.argv[2];
  if (!prompt) {
    console.error("Please provide a prompt argument.");
    process.exit(1);
  }

  const workflow = new WorkflowManager();
  workflow.run(prompt).then((result) => {
    // Check final state for success
    if (result.review_status === "approved" && (!result.test_output || result.test_output.includes("PASS"))) {
        console.log("Workflow completed successfully.");
        process.exit(0);
    } else {
        console.error("Workflow failed to converge.");
        process.exit(1);
    }
  }).catch(err => {
    console.error("Workflow failed:", err);
    process.exit(1);
  });
}
