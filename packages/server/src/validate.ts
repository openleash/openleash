import type { FastifyReply } from "fastify";
import type { z } from "zod";

/**
 * Parse and validate a request body against a zod schema.
 * On success, returns the parsed (and transformed) data.
 * On failure, sends a 400 response with structured field errors and returns null.
 */
export function validateBody<T extends z.ZodType>(
    body: unknown,
    schema: T,
    reply: FastifyReply,
): z.infer<T> | null {
    const result = schema.safeParse(body);
    if (result.success) {
        return result.data;
    }

    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) {
            fieldErrors[path] = issue.message;
        }
    }

    reply.code(400).send({
        error: {
            code: "VALIDATION_ERROR",
            message: Object.values(fieldErrors)[0] ?? "Invalid request",
            field_errors: fieldErrors,
        },
    });

    return null;
}
