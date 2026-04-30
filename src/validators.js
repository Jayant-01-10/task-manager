const { z } = require("zod");

const email = z.string().trim().email().max(160).toLowerCase();
const password = z.string().min(8).max(128);
const text = (min, max) => z.string().trim().min(min).max(max);
const optionalText = (max) => z.string().trim().max(max).optional().default("");
const id = z.coerce.number().int().positive();
const projectParamSchema = z.object({ projectId: id });

const signupSchema = z.object({
  name: text(2, 80),
  email,
  password
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128)
});

const projectSchema = z.object({
  name: text(2, 120),
  description: optionalText(1200)
});

const memberSchema = z.object({
  userId: id
});

const roleSchema = z.object({
  role: z.enum(["admin", "member"])
});

const taskCreateSchema = z.object({
  projectId: id,
  title: text(2, 160),
  description: optionalText(2000),
  assigneeId: id.nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional().default("todo"),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

const taskUpdateSchema = taskCreateSchema
  .omit({ projectId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.errors.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }
    req.validated = result.data;
    next();
  };
}

module.exports = {
  id,
  projectParamSchema,
  signupSchema,
  loginSchema,
  projectSchema,
  memberSchema,
  roleSchema,
  taskCreateSchema,
  taskUpdateSchema,
  validate
};
