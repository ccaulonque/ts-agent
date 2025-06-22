import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { z } from "zod/v4";
import { ToolDef } from "..";

const listFilesParams = z.object({
  path: z
    .string()
    .default("")
    .describe(
      "Optional relative path to list files from. Defaults to current directory if not provided.",
    ),
});

async function listFiles(input: string) {
  const inputJSON = JSON.parse(input);
  const { data, success } = listFilesParams.safeParse(inputJSON);
  if (!success) {
    throw new Error(`Invalid input: ${JSON.stringify(input)}`);
  }

  const rootDir = data.path && data.path !== "" ? data.path : ".";
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(rootDir, fullPath);

      if (relPath === "") continue;

      if (entry.isDirectory()) {
        files.push(relPath + "/");
        await walk(fullPath);
      } else {
        files.push(relPath);
      }
    }
  }

  await walk(rootDir);

  return JSON.stringify(files);
}

export const listFilesTool: ToolDef = {
  type: "function",
  name: "list_files",
  description:
    "List files and directories at a given path. If no path is provided, lists files in the current directory.",
  strict: true,
  function: listFiles,
  parameters: z.toJSONSchema(listFilesParams),
};
