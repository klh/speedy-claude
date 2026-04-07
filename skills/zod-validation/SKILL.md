---
name: zod-validation
description: Zod schema validation patterns. Use when validating API inputs and data.
---

# Zod Validation Skill

This skill covers Zod schema validation for type-safe data validation.

## When to Use

Use this skill when:
- Validating API request bodies
- Parsing environment variables
- Transforming data
- Creating type-safe schemas

## Core Principle

**VALIDATE AT BOUNDARIES** - Validate all external input. Trust internal data. Use Zod for type inference.

## Installation

```bash
npm install zod
```

## Basic Schemas

```typescript
import { z } from 'zod';

// Primitives
const stringSchema = z.string();
const numberSchema = z.number();
const booleanSchema = z.boolean();
const dateSchema = z.date();

// String validations
const emailSchema = z.string().email();
const urlSchema = z.string().url();
const uuidSchema = z.string().uuid();
const minLengthSchema = z.string().min(1).max(100);
const regexSchema = z.string().regex(/^[a-z]+$/);

// Number validations
const positiveSchema = z.number().positive();
const intSchema = z.number().int();
const rangeSchema = z.number().min(0).max(100);

// Optional and nullable
const optionalSchema = z.string().optional(); // string | undefined
const nullableSchema = z.string().nullable(); // string | null
const nullishSchema = z.string().nullish();   // string | null | undefined
```

## Object Schemas

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().positive().optional(),
  role: z.enum(['USER', 'ADMIN', 'MODERATOR']),
  createdAt: z.date(),
});

// Type inference
type User = z.infer<typeof UserSchema>;

// Partial (all fields optional)
const PartialUserSchema = UserSchema.partial();

// Pick specific fields
const UserEmailSchema = UserSchema.pick({ email: true, name: true });

// Omit fields
const UserWithoutIdSchema = UserSchema.omit({ id: true, createdAt: true });

// Extend schema
const UserWithProfileSchema = UserSchema.extend({
  profile: z.object({
    bio: z.string().optional(),
    avatar: z.string().url().optional(),
  }),
});
```

## Array and Union Schemas

```typescript
// Arrays
const StringArraySchema = z.array(z.string());
const NumberArraySchema = z.array(z.number()).min(1).max(10);

// Tuples
const CoordinatesSchema = z.tuple([z.number(), z.number()]);

// Unions
const StringOrNumberSchema = z.union([z.string(), z.number()]);
const ResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), data: z.unknown() }),
  z.object({ status: z.literal('error'), error: z.string() }),
]);

// Enums
const RoleSchema = z.enum(['USER', 'ADMIN', 'MODERATOR']);
type Role = z.infer<typeof RoleSchema>; // 'USER' | 'ADMIN' | 'MODERATOR'
```

## API Request Schemas

```typescript
// Create user request
const CreateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[0-9]/, 'Password must contain number'),
  name: z.string().min(1, 'Name is required').max(100),
});

// Update user request (all fields optional)
const UpdateUserSchema = CreateUserSchema.partial();

// Query parameters
const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

// Path parameters
const IdParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});
```

## Transformations

```typescript
// Transform during parse
const TrimmedStringSchema = z.string().trim();
const LowercaseEmailSchema = z.string().email().toLowerCase();

// Transform to different type
const DateStringSchema = z.string().transform((str) => new Date(str));

// Coerce types
const CoercedNumberSchema = z.coerce.number(); // "42" -> 42
const CoercedDateSchema = z.coerce.date();     // "2024-01-01" -> Date

// Complex transformation
const UserInputSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().trim(),
  tags: z.string().transform((str) => str.split(',').map((t) => t.trim())),
});
```

## Custom Validations

```typescript
// Custom refinement
const PasswordSchema = z.string()
  .min(8)
  .refine(
    (password) => /[A-Z]/.test(password),
    { message: 'Password must contain uppercase letter' }
  )
  .refine(
    (password) => /[0-9]/.test(password),
    { message: 'Password must contain number' }
  );

// Cross-field validation
const PasswordConfirmSchema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);

// Async validation
const UniqueEmailSchema = z.string().email().refine(
  async (email) => {
    const exists = await checkEmailExists(email);
    return !exists;
  },
  { message: 'Email already registered' }
);
```

## Fastify Integration

```typescript
// src/routes/users.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

type CreateUserInput = z.infer<typeof CreateUserSchema>;
type UserResponse = z.infer<typeof UserResponseSchema>;

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // Manual validation
  fastify.post<{ Body: CreateUserInput }>('/', async (request, reply) => {
    const result = CreateUserSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }

    const user = await createUser(result.data);
    return reply.status(201).send(user);
  });

  // With JSON Schema (Fastify validates)
  fastify.post<{ Body: CreateUserInput; Reply: UserResponse }>('/v2', {
    schema: {
      body: zodToJsonSchema(CreateUserSchema),
      response: {
        201: zodToJsonSchema(UserResponseSchema),
      },
    },
  }, async (request, reply) => {
    const user = await createUser(request.body);
    return reply.status(201).send(user);
  });
};
```

## Environment Validation

```typescript
// src/config/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
```

## Error Handling

```typescript
import { z, ZodError } from 'zod';

function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

function parseOrNull<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

// Flatten errors for API response
function formatZodError(error: ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

// Usage
try {
  const user = parseOrThrow(UserSchema, requestBody);
} catch (error) {
  if (error instanceof ZodError) {
    return { errors: formatZodError(error) };
  }
  throw error;
}
```

## Composing Schemas

```typescript
// Base schemas
const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  country: z.string(),
  postalCode: z.string(),
});

const ContactSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
});

// Composed schema
const CustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  contact: ContactSchema,
  billingAddress: AddressSchema,
  shippingAddress: AddressSchema.optional(),
});
```

## Best Practices

1. **Validate early** - At API boundaries
2. **Use inference** - `z.infer<typeof Schema>`
3. **Custom messages** - User-friendly error messages
4. **Coerce types** - For query params
5. **Safe parse** - Use `safeParse` for graceful errors
6. **Compose schemas** - Build complex from simple

## Notes

- Zod is synchronous by default
- Use `refine` for async validations
- `zodToJsonSchema` for OpenAPI/Swagger
- Schemas are immutable - methods return new schemas
