import { z } from "zod/v4";
import { ToolDef } from "..";

const editFileParams = z.object({
  path: z.string().describe("The path to the file"),
  oldStr: z
    .string()
    .describe(
      "Text to search for - must match exactly and must only have one match exactly",
    ),
  newStr: z.string().describe("Text to replace old_str with"),
});

async function editFile(input: string) {
  const inputJSON = JSON.parse(input);
  const { data, success } = editFileParams.safeParse(inputJSON);
  if (!success) {
    throw new Error(`Invalid input: ${JSON.stringify(input)}`);
  }

  const file = Bun.file(data.path);
  if (!(await file.exists())) {
    await Bun.write(data.path, data.newStr);
    return "ok";
  }
  const fileContent = await file.text();
  const newContent = fileContent.replace(data.oldStr, data.newStr);

  await file.write(newContent);
  return "ok";
}

export const editFileTool: ToolDef = {
  type: "function",
  name: "edit_file",
  description:
    "Make edits to a text file. Replaces 'oldStr' with 'newStr' in the given file. 'oldStr' and 'newStr' MUST be different from each other. If the file specified with path doesn't exist, it will be created",
  strict: true,
  function: editFile,
  parameters: z.toJSONSchema(editFileParams),
};
