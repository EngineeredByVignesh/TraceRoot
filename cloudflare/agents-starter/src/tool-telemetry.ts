type ToolTelemetryFields = Record<string, unknown>;

function errorFields(error: unknown) {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message
    };
  }

  return {
    errorName: "UnknownError",
    errorMessage: String(error)
  };
}

export async function observeToolCall<T>(
  toolName: string,
  category: string,
  fields: ToolTelemetryFields,
  call: () => Promise<T>
) {
  const startedAt = Date.now();

  console.log(
    JSON.stringify({
      event: "agent.tool.start",
      toolName,
      category,
      ...fields
    })
  );

  try {
    const result = await call();
    console.log(
      JSON.stringify({
        event: "agent.tool.success",
        toolName,
        category,
        durationMs: Date.now() - startedAt,
        ...fields
      })
    );
    return result;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "agent.tool.failure",
        toolName,
        category,
        durationMs: Date.now() - startedAt,
        ...fields,
        ...errorFields(error)
      })
    );
    throw error;
  }
}
