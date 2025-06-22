import { z } from "zod/v4";
import { ToolDef } from "..";

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

export const readFileTool: ToolDef = {
  type: "function",
  name: "read_file",
  description:
    "Read the contents of a given relative file path. Use this when you want to see what's inside a file. Do not use this with directory names.",
  strict: true,
  function: readFile,
  parameters: z.toJSONSchema(readFileParams),
};
