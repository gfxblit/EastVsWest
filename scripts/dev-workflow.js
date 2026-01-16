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
  constructor() {
    this.graph = null;
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
        process.stdout.write(chunk);
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
   * Invokes the Gemini CLI with a prompt.
   * Streams output to stdout and returns the full response.
   * @param {string} prompt - The prompt to send.
   * @param {Array} args - (Optional) Additional CLI arguments.
   * @returns {Promise<string>} The generated response.
   */
  async invokeGemini(prompt, args = []) {
    return new Promise((resolve, reject) => {
      // With shell: false, we don't need to manually escape quotes.
      // Node.js will pass the prompt argument directly to the executable.
      
      const child = spawn('gemini', [...args, prompt], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false 
      });

      let fullOutput = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        process.stdout.write(chunk); // Stream to console
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
    const { messages } = state;
    console.log("--- Coder Node ---");
    
    // Extract the user's initial request or latest human message
    const lastMessage = messages[messages.length - 1];
    const userRequest = lastMessage.content;

    const systemPrompt = `You are a software engineer. Implement the following request: ${userRequest}. 
    You have access to the file system.
    Please output the code changes in markdown blocks.`;
    
    const codeContent = await this.invokeGemini(systemPrompt, ['--yolo']);
    console.log("\nCoding complete.");

    return { 
      code_status: "coded",
      messages: [new SystemMessage(codeContent)]
    };
  }

  async testRunner(state) {
    console.log("--- Test Runner Node ---");
    const { retry_count } = state;
    
    // Run tests
    try {
      console.log("Running npm test...");
      const output = await this.runCommand('npm', ['test']);
      
      if (output.includes('FAIL') || output.includes('failed')) {
         // Increment retry count on failure
         return { 
             test_output: "FAIL:\n" + output,
             retry_count: retry_count + 1
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
    console.log("--- Reviewer Node ---");
    
    if (!test_output.includes("PASS")) {
       return { 
           review_status: "rejected", 
           messages: [new SystemMessage("Tests failed.")],
           retry_count: retry_count + 1
       };
    }

    const systemPrompt = `You are a senior reviewer. Review the implementation. 
    If the code looks correct and safe, output exactly "APPROVED". 
    Otherwise, output "REJECTED" followed by a concise explanation of why.`;
    
    const reviewContent = await this.invokeGemini(systemPrompt);
    
    // Strict check for "APPROVED" at the start of the response
    const isApproved = reviewContent.trim().toUpperCase().startsWith("APPROVED");
    console.log(`\nReview decision: ${isApproved ? "Approved" : "Rejected"}`);
    
    // If rejected, increment retry count
    return { 
      review_status: isApproved ? "approved" : "rejected",
      messages: [new SystemMessage(reviewContent)],
      retry_count: isApproved ? retry_count : retry_count + 1
    };
  }

  // --- Conditional Logic ---
  
  shouldContinueFromTest(state) {
    if (state.test_output && state.test_output.includes("PASS")) {
      return "reviewer";
    }
    
    // Check retries
    if (state.retry_count > 3) {
      console.log("Max retries exceeded. Aborting.");
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
      console.log("Max retries exceeded. Aborting.");
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
