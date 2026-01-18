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
export const aggregateMessages = (current, next) => current.concat(next);

/**
 * Updates the state with the latest value. 
 * If a new value is provided, it replaces the old one.
 * @param {any} current - Current value.
 * @param {any} next - New value.
 * @returns {any} The updated value.
 */
export const updateLatest = (current, next) => next !== undefined ? next : current;

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
  },

  /**
   * The URL of the created or existing Pull Request.
   * String content.
   */
  pr_url: {
    value: updateLatest,
    default: () => "",
  },

  /**
   * The URL of the GitHub issue being addressed.
   * String content.
   */
  issue_url: {
    value: updateLatest,
    default: () => "",
  },

  /**
   * Whether the plan has been approved by a human.
   * Boolean.
   */
  plan_approved: {
    value: updateLatest,
    default: () => false,
  },

  /**
   * The finalized plan after human approval.
   * String content.
   */
  final_plan: {
    value: updateLatest,
    default: () => "",
  }
};

/**
 * Manages the TDD development workflow using LangGraph and Gemini.
 * Orchestrates the coding, testing, and review phases.
 * 
 * Uses the `gemini` CLI tool for LLM inference instead of direct API calls.
 */
export class WorkflowManager {
  constructor(logger = console, startNode = "coder", verbose = false) {
    this.graph = null;
    this.logger = logger;
    this.startNode = startNode;
    this.verbose = verbose;
  }

  // --- Helpers ---

  /**
   * Streams a chunk of output to the configured logger.
   * Handles direct stdout writing for console to avoid extra newlines.
   * @param {string} chunk - The cleaned output chunk.
   * @private
   */
  _streamOutput(chunk) {
    if (!chunk) return;
    if (this.logger === console) {
      process.stdout.write(chunk);
    } else {
      this.logger.log(chunk);
    }
  }

  /**
   * Cleans a chunk of output by removing null bytes, non-printable control 
   * characters, and other disruptive symbols that can break terminal 
   * rendering or confuse LLM context. Preserves Tabs, Newlines, and CR.
   * @param {string} chunk - The raw output chunk.
   * @returns {string} The cleaned chunk.
   * @private
   */
  _cleanChunk(chunk) {
    if (typeof chunk !== 'string') return chunk;
    
    // Remove ANSI escape codes (e.g., colors) to avoid leaving junk like [31m
    // This matches the most common CSI (Control Sequence Introducer) sequences
    const withoutAnsi = chunk.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    // Remove disruptive control characters, including null bytes (\x00).
    // Matches \x00-\x08, \x0B-\x0C, \x0E-\x1F, \x7F (excluding \x09 TAB, \x0A LF, \x0D CR)
    return withoutAnsi.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

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
        const chunk = this._cleanChunk(data.toString());
        if (chunk) {
          this._streamOutput(chunk);
          fullOutput += chunk;
        }
      });

      child.stderr.on('data', (data) => {
        const chunk = this._cleanChunk(data.toString());
        if (chunk) {
          // Do not stream stderr to console to avoid noise (e.g. tool logs)
          fullOutput += chunk;
        }
      });

      child.on('close', (code) => {
        resolve({ output: fullOutput, exitCode: code });
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
        const chunk = this._cleanChunk(data.toString());
        if (chunk) {
          this._streamOutput(chunk); // Stream to console
          fullOutput += chunk;
        }
      });

      child.stderr.on('data', (data) => {
        const chunk = this._cleanChunk(data.toString());
        if (chunk) {
          // Do not stream stderr to console to avoid noise (e.g. tool logs)
          errorOutput += chunk;
        }
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

  /**
   * Retrieves the current tmux session name.
   * @returns {Promise<string>} The session name or 'no-tmux' as fallback.
   */
  async getTmuxSession() {
    try {
      const { output } = await this.runCommand('tmux', ['display-message', '-p', '#S']);
      if (output && output.trim()) {
        return output.trim();
      }
    } catch (e) {
      // Silence tmux errors
    }
    return 'no-tmux';
  }

  /**
   * Sends a notification to ntfy.sh if NTFY_CHANNEL is set.
   * @param {string} title - The notification title.
   * @param {string} message - The notification message.
   * @param {number} priority - Priority (1-5, default 3).
   */
  async notify(title, message, priority = 3) {
    const channel = process.env.NTFY_CHANNEL;
    if (!channel) return;

    const sessionName = await this.getTmuxSession();
    const fullMessage = `Session: ${sessionName}\n${message}`;

    try {
      await this.runCommand('curl', [
        '-sS',
        '-H', `Title: ${title}`,
        '-H', `Priority: ${priority.toString()}`,
        '-d', fullMessage,
        `https://ntfy.sh/${channel}`
      ]);
    } catch (error) {
      this.logger.log(`Failed to send notification: ${error.message}`);
    }
  }

  // --- Nodes ---

  async planner(state) {
    const { messages, issue_url } = state;
    this.logger.log("--- Planner Node ---");

    let currentIssueUrl = issue_url;
    if (!currentIssueUrl) {
      const initialRequest = messages[0].content;
      const issueMatch = initialRequest.match(/https:\/\/github\.com\/[^\s]+\/issues\/\d+/);
      if (issueMatch) {
        currentIssueUrl = issueMatch[0];
      }
    }

    if (!currentIssueUrl) {
      this.logger.log("No issue URL found. Skipping planner.");
      return { plan_approved: true };
    }

    this.logger.log(`Fetching issue details for: ${currentIssueUrl}...`);
    const { output: issueContent, exitCode } = await this.runCommand('gh', ['issue', 'view', currentIssueUrl]);
    
    if (exitCode !== 0) {
      this.logger.log(`Warning: Failed to fetch issue details. Proceeding without issue context.`);
    }

    const rl = readline.createInterface({ input, output });
    let finalPlan = "";

    try {
      let planApproved = false;
      let feedback = "";

      while (!planApproved) {
        const systemPrompt = `You are a technical architect. Based on the following GitHub issue and user feedback, generate a detailed implementation plan.
      
      ISSUE CONTENT:
      ${issueContent}
      
      PREVIOUS FEEDBACK:
      ${feedback || "None"}
      
      The plan MUST include:
      1. Requirements Summary: Clear list of what needs to be done.
      2. Importance: Why this change is needed.
      3. Test Plan: How the changes will be verified (Unit, Integration, E2E).
      4. Implementation Plan: Step-by-step technical approach.
      
      Format the output clearly for a human to review.`;

        this.logger.log("\nGenerating plan...");
        finalPlan = await this.invokeGemini(systemPrompt, ['--yolo']);
        
        this.logger.log("\n--- PROPOSED PLAN ---");
        this.logger.log(finalPlan);
        this.logger.log("\n---------------------\n");

        const answer = await rl.question("Do you approve this plan? (yes/no/feedback): ");
        const trimmedAnswer = answer.toLowerCase().trim();

        if (trimmedAnswer === 'yes' || trimmedAnswer === 'y') {
          planApproved = true;
        } else {
          feedback = await rl.question("Please provide feedback or specific requirements: ");
        }
      }
    } finally {
      rl.close();
    }

    this.logger.log("Plan approved. Commenting on GitHub issue...");
    await this.runCommand('gh', ['issue', 'comment', currentIssueUrl, '--body', `## Approved Implementation Plan\n\n${finalPlan}`]);

    return {
      issue_url: currentIssueUrl,
      plan_approved: true,
      final_plan: finalPlan
    };
  }

  async coder(state) {
    const { messages, test_output, review_status, final_plan } = state;
    this.logger.log("--- Coder Node ---");
    
    // Extract the user's initial request (always the first message)
    const initialRequest = messages[0].content;
    
    let systemPrompt = `You are a software engineer. Implement the following request: ${initialRequest}. 
    You have access to the file system and git.
    
    IMPORTANT: You MUST commit your changes using git. You may create multiple commits if it makes sense for the task.
    Please output the code changes in markdown blocks as well for the conversation record.`;

    if (final_plan) {
      systemPrompt += `\n\nAPPROVED PLAN:\n${final_plan}`;
    }

    // Add context from failures if applicable
    if (test_output && (test_output.includes("FAIL") || test_output.includes("failed"))) {
        systemPrompt = `Your previous implementation failed tests. 
        
        TEST OUTPUT:
        ${test_output}
        
        Please fix the code to satisfy the tests and the original request: ${initialRequest}.`;
        
        if (final_plan) {
          systemPrompt += `\n\nFollow the approved plan:\n${final_plan}`;
        }
        
        systemPrompt += `\n\nMake sure to commit your fixes.`;
    } else if (review_status === "rejected") {
        const lastMessage = messages[messages.length - 1];
        systemPrompt = `Your previous implementation was rejected by the reviewer.
        
        REVIEWER FEEDBACK:
        ${lastMessage.content}
        
        Please fix the code to satisfy the reviewer and the original request: ${initialRequest}.`;

        if (final_plan) {
          systemPrompt += `\n\nFollow the approved plan:\n${final_plan}`;
        }

        systemPrompt += `\n\nMake sure to commit your fixes.`;
    } else if (review_status === "needs_commit") {
        systemPrompt = `You have uncommitted changes that prevent PR creation. 
        Please review your changes and commit them using git.
        Original request: ${initialRequest}`;

        if (final_plan) {
          systemPrompt += `\n\nFollow the approved plan:\n${final_plan}`;
        }
    }
    
    if (this.verbose) {
      this.logger.log("\n--- [VERBOSE] Coder System Prompt ---");
      this.logger.log(systemPrompt);
      this.logger.log("------------------------------------\n");
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
      const { output: unitOutput, exitCode } = await this.runCommand('npm', ['test']);
      
      if (exitCode !== 0 || unitOutput.includes('FAIL') || unitOutput.includes('failed')) {
         const message = retry_count >= 3 ? "Max retries exceeded. Aborting." : "Unit tests failed. Returning to coder.";
         await this.notify("Workflow: Tests Failed", message, 4);
         // Increment retry count on failure
         return { 
             test_output: "FAIL (Unit):\n" + unitOutput,
             retry_count: retry_count + 1,
             messages: [new SystemMessage("Tests failed (Unit):\n" + unitOutput)]
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
    
    if (test_output && !test_output.includes("PASS")) {
       return { 
           review_status: "rejected", 
           messages: [new SystemMessage("Tests failed.")],
           retry_count: retry_count + 1
       };
    }

    const systemPrompt = `You are a senior reviewer. Review the implementation. 
    You have access to the file system and git.
    
    MANDATORY: You MUST activate the 'pr-reviewer' skill to perform a thorough review of the changes.
    
    You MUST examine all commits and the full diff between the current branch and 'origin/main'.
    Use tools like 'git log origin/main..HEAD' to see the commit history and 'git diff origin/main..HEAD' to review the code changes.
    
    You MUST evaluate commit granularity. Reject the implementation if:
    1. Commits are too large: They bundle multiple unrelated tasks or ideas, making them difficult to review (cognitive overload).
    2. Commits are too small: There are too many tiny, fragmented commits that lack independent value and should have been grouped or squashed.
    
    If the code looks correct, safe, and follows the requirements, output "APPROVED". 
    Otherwise, output "REJECTED" followed by a concise explanation of why.`;
    
    if (this.verbose) {
      this.logger.log("\n--- [VERBOSE] Reviewer System Prompt ---");
      this.logger.log(systemPrompt);
      this.logger.log("--------------------------------------\n");
    }

    const reviewContent = await this.invokeGemini(systemPrompt, ['--yolo']);
    
    // Flexible check for "APPROVED" as a standalone word in the response
    const isApproved = /\bAPPROVED\b/i.test(reviewContent);
    this.logger.log(`\nReview decision: ${isApproved ? "Approved" : "Rejected"}`);
    
    if (!isApproved) {
      const message = retry_count >= 3 ? "Max retries exceeded. Aborting." : "Reviewer rejected the implementation. Returning to coder.";
      await this.notify("Workflow: Review Rejected", message, 4);
    }

    // If rejected, increment retry count
    return { 
      review_status: isApproved ? "approved" : "rejected",
      messages: [new SystemMessage(reviewContent)],
      retry_count: isApproved ? retry_count : retry_count + 1
    };
  }

  async prCreator(state) {
    this.logger.log("--- PR Creator Node ---");
    const { retry_count } = state;
    
    try {
      // 1. Check if on a feature branch
      const { output: branchOutput, exitCode: branchCode } = await this.runCommand('git', ['branch', '--show-current']);
      const branchName = branchOutput.trim();
      
      if (branchCode !== 0 || branchName === 'main' || branchName === 'master' || !branchName) {
        this.logger.log("Not on a feature branch. Skipping PR creation.");
        return { review_status: "pr_skipped" };
      }

      this.logger.log(`On feature branch: ${branchName}`);

      // 2. Check for uncommitted changes
      const { output: statusOutput } = await this.runCommand('git', ['status', '--porcelain']);
      if (statusOutput.trim()) {
        this.logger.log("Uncommitted changes found. Returning to coder to finalize commits.");
        const message = retry_count >= 3 ? "Max retries exceeded. Aborting due to uncommitted changes." : "Uncommitted changes found. Returning to coder.";
        await this.notify("Workflow: Uncommitted Changes", message, 4);
        return { 
          review_status: "needs_commit",
          messages: [new SystemMessage("Uncommitted changes found. Please ensure all changes are committed before creating a PR.")],
          retry_count: retry_count + 1
        };
      }

      // 3. Push to origin
      this.logger.log("Pushing to origin...");
      const { output: pushOutput, exitCode: pushCode } = await this.runCommand('git', ['push', '-u', 'origin', branchName]);
      if (pushCode !== 0) {
        throw new Error(`Git push failed (exit ${pushCode}): ${pushOutput.trim()}`);
      }

      // 4. Create PR
      this.logger.log("Creating Pull Request...");
      const { output: prOutput, exitCode: prCode } = await this.runCommand('gh', ['pr', 'create', '--fill']);
      if (prCode !== 0) {
        if (prOutput.includes("already exists")) {
          this.logger.log("PR already exists. Treating as success.");
          // Try to extract the URL from the error message
          const urlMatch = prOutput.match(/https:\/\/github\.com\/[^\s]+/);
          const prUrl = urlMatch ? urlMatch[0] : "existing PR";
          return { 
            review_status: "pr_created",
            pr_url: prUrl,
            messages: [new SystemMessage(`PR already exists: ${prUrl}`)]
          };
        }
        throw new Error(`PR creation failed (exit ${prCode}): ${prOutput.trim()}`);
      }
      this.logger.log(`PR created: ${prOutput.trim()}`);

      return { 
        review_status: "pr_created",
        pr_url: prOutput.trim(),
        messages: [new SystemMessage(`PR Created: ${prOutput.trim()}`)]
      };
    } catch (error) {
      this.logger.log(`Error in PR creation: ${error.message}`);
      const message = retry_count >= 3 ? "Max retries exceeded. Aborting." : `Failed to create PR: ${error.message}`;
      await this.notify("Workflow: PR Failed", message, 5);
      return { 
        review_status: "pr_failed",
        messages: [new SystemMessage(`Failed to create PR: ${error.message}`)],
        retry_count: retry_count + 1
      };
    }
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
      return "pr_creator";
    }
    
    // Check retries
    if (state.retry_count > 3) {
      this.logger.log("Max retries exceeded. Aborting.");
      return END;
    }
    
    return "coder";
  }

  shouldContinueFromPrCreator(state) {
    if (state.review_status === "pr_created" || state.review_status === "pr_skipped") {
      return END;
    }
    
    // Check retries to avoid infinite loops
    if (state.retry_count > 3) {
      this.logger.log("Max retries exceeded in PR Creator. Aborting.");
      return END;
    }

    // If pr_failed or needs_commit, return to coder
    this.logger.log(`PR Creator failed or needs commit (status: ${state.review_status}). Returning to coder.`);
    return "coder";
  }

  createGraph() {
    const workflow = new StateGraph({
      channels: agentStateChannels
    });

    // Add Nodes
    workflow.addNode("planner", this.planner.bind(this));
    workflow.addNode("coder", this.coder.bind(this));
    workflow.addNode("test_runner", this.testRunner.bind(this));
    workflow.addNode("reviewer", this.reviewer.bind(this));
    workflow.addNode("pr_creator", this.prCreator.bind(this));

    // Add Edges
    const validNodes = ["planner", "coder", "test_runner", "reviewer", "pr_creator"];
    const entryNode = validNodes.includes(this.startNode) ? this.startNode : "coder";
    
    if (entryNode !== this.startNode) {
      this.logger.log(`Warning: Invalid start node "${this.startNode}".`);
      this.logger.log(`Valid nodes are: ${validNodes.join(", ")}`);
      this.logger.log(`Falling back to "coder".`);
    }

    workflow.addEdge(START, entryNode);
    
    workflow.addEdge("planner", "coder");
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
        pr_creator: "pr_creator",
        coder: "coder",
        [END]: END
      }
    );

    workflow.addConditionalEdges(
      "pr_creator",
      this.shouldContinueFromPrCreator.bind(this),
      {
        [END]: END
      }
    );

    this.graph = workflow.compile();
    return this.graph;
  }

  async run(input) {
    // Detect if input is a GitHub issue URL to set initial node to planner
    const issueMatch = input.match(/https:\/\/github\.com\/[^\s]+\/issues\/\d+/);
    if (issueMatch && this.startNode === "coder") {
      this.startNode = "planner";
    }

    if (!this.graph) {
      this.createGraph();
    }
    
    const initialState = {
      messages: [new HumanMessage(input)],
      retry_count: 0,
      issue_url: issueMatch ? issueMatch[0] : "",
      test_output: (this.startNode === "reviewer" || this.startNode === "pr_creator") ? "" : "",
      review_status: this.startNode === "pr_creator" ? "approved" : "pending"
    };

    return await this.graph.invoke(initialState);
  }
}

// CLI Entry Point
if (process.argv[1] === __filename) {
  if (!process.env.NTFY_CHANNEL) {
    console.error("Error: NTFY_CHANNEL environment variable is not defined.");
    console.error("This is required for workflow notifications. Please set it in your environment or .env file.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let startNode = "coder";
  let verbose = false;
  let promptParts = [];

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--start" || args[i] === "-s") && i + 1 < args.length) {
      startNode = args[i+1];
      i++; // Skip the next arg
    } else if (args[i] === "--verbose" || args[i] === "-v") {
      verbose = true;
    } else {
      promptParts.push(args[i]);
    }
  }

  const prompt = promptParts.join(" ") || "Continue development and verify implementation.";

  if (args.length === 0) {
    console.log("Usage: node scripts/dev-workflow.js [-s coder|test_runner|reviewer|pr_creator] [-v|--verbose] [prompt]");
  }

  const workflow = new WorkflowManager(console, startNode, verbose);
  console.log(`Starting workflow at node: ${startNode}`);
  workflow.run(prompt).then(async (result) => {
    // Check final state for success
    if (result.review_status === "pr_created") {
        const msg = `Workflow completed successfully. PR created: ${result.pr_url || "N/A"}`;
        console.log(msg);
        await workflow.notify("Workflow: Success", msg, 3);
        process.exit(0);
    } else if (result.review_status === "pr_skipped") {
        const msg = "Workflow completed successfully. PR skipped (not on a feature branch).";
        console.log(msg);
        await workflow.notify("Workflow: Success", msg, 3);
        process.exit(0);
    } else if (result.review_status === "pr_failed") {
        const msg = "Workflow completed code/tests but failed to create PR.";
        console.error(msg);
        await workflow.notify("Workflow: PR Failed", msg, 5);
        process.exit(1);
    } else if (result.review_status === "approved" && (!result.test_output || result.test_output.includes("PASS"))) {
        const msg = "Workflow completed successfully (no PR).";
        console.log(msg);
        await workflow.notify("Workflow: Success", msg, 3);
        process.exit(0);
    } else {
        const msg = "Workflow failed to converge.";
        console.error(msg);
        await workflow.notify("Workflow: Failed", msg, 5);
        process.exit(1);
    }
  }).catch(async err => {
    console.error("Workflow failed:", err);
    await workflow.notify("Workflow: Error", `Workflow failed with error: ${err.message}`, 5);
    process.exit(1);
  });
}