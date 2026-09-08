import type { CreatedHooks } from "../create-hooks"

export function createToolDefinitionHandler(args: {
  hooks: CreatedHooks
}): (
  input: { toolID: string },
  output: { description: string; parameters: unknown },
) => Promise<void> {
  const { hooks } = args

  return async (
    _input: { toolID: string },
    _output: { description: string; parameters: unknown },
  ): Promise<void> => {
  }
}
