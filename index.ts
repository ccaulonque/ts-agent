import OpenAI from "openai";
import {
  type ResponseInput,
  type FunctionTool,
  type ResponseInputItem,
} from "openai/resources/responses/responses";
import { exit } from "process";
import { z } from "zod/v4";

type ToolDef = FunctionTool & {
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
      model: "gpt-4.1-nano",
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
    return await tool.function(input);
  }
}

function getUserMessage() {
  const userMessage = prompt("");
  return userMessage;
}

const readFileParams = z.object({
  path: z
    .string()
    .describe("The relative path of a file in the working directory."),
});

async function readFile(input: string) {
  const inputJSON = JSON.parse(input);
  const { data, success } = readFileParams.safeParse(inputJSON);
  if (!success) {
    throw new Error(`Invalid input: ${JSON.stringify(input)}`);
  }

  const file = Bun.file(data.path);

  return await file.text();
}

const readFileTool: ToolDef = {
  type: "function",
  name: "read_file",
  description:
    "Read the contents of a given relative file path. Use this when you want to see what's inside a file. Do not use this with directory names.",
  strict: true,
  function: readFile,
  parameters: z.toJSONSchema(readFileParams),
};

async function main() {
  const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_API_KEY,
  });
  const agent = new Agent(openai, getUserMessage, [readFileTool]);
  agent.run(null);
}

main();
