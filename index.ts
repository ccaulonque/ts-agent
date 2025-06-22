import OpenAI from "openai";
import {
  type ResponseInput,
  type FunctionTool,
  type ResponseInputItem,
} from "openai/resources/responses/responses";
import { exit } from "process";
import { readFileTool } from "./tools/read-file";
import { listFilesTool } from "./tools/list-files";
import { editFileTool } from "./tools/edit-file";

export type ToolDef = FunctionTool & {
  function: (params: string) => string | Promise<string>;
};

class Agent {
  private client: OpenAI;
  private getUserMessage: () => string | null;
  private tools: ToolDef[] = [];

  constructor(
    client: OpenAI,
    getUserMessage: () => string | null,
    tools: ToolDef[],
  ) {
    this.client = client;
    this.getUserMessage = getUserMessage;
    this.tools = tools;
  }

  async run(context: unknown) {
    const conversation: ResponseInput = [];
    let readUserInput = true;

    console.info("Chat with the model");
    while (true) {
      if (readUserInput) {
        process.stdout.write("You: ");
        const userInput = this.getUserMessage();
        if (!userInput) {
          break;
        }

        const userMessage = {
          role: "user",
          content: userInput,
        } as const;

        conversation.push(userMessage);
      }

      try {
        const message = await this.runInference(null, conversation);

        const toolResults: ResponseInputItem.FunctionCallOutput[] = [];
        for (const output of message.output) {
          conversation.push(output);
          switch (output.type) {
            case "message": {
              const content: string =
                typeof output.content === "string"
                  ? output.content
                  : output.content
                      .map((a) => ("text" in a ? a.text : ""))
                      .join("\n");
              console.info(`Model: ${content}`);
              break;
            }
            case "function_call": {
              if (output.type !== "function_call") {
                throw new Error("Invalid function call");
              }
              const result = await this.executeTool(
                output.name,
                output.arguments,
              );
              const functionResult: ResponseInputItem.FunctionCallOutput = {
                type: "function_call_output" as const,
                call_id: output.call_id,
                output: result,
              };
              toolResults.push(functionResult);
              break;
            }
          }
        }
        if (toolResults.length == 0) {
          readUserInput = true;
          continue;
        }
        readUserInput = false;
        conversation.push(...toolResults);
      } catch (error) {
        console.error("Error:", error);
        exit(1);
      }
    }
  }

  private runInference(context: unknown, conversation: ResponseInput) {
    return this.client.responses.create({
      model: "gpt-4.1-mini",
      input: conversation,
      tools: this.tools,
      max_output_tokens: 1024,
    });
  }

  private async executeTool(name: string, input: string): Promise<string> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }
    console.info(`[tool]: ${name}(${input})`);
    return await tool.function(input);
  }
}

function getUserMessage() {
  const userMessage = prompt("");
  return userMessage;
}

async function main() {
  const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_API_KEY,
  });
  const agent = new Agent(openai, getUserMessage, [
    readFileTool,
    listFilesTool,
    editFileTool,
  ]);
  agent.run(null);
}

main();
