// The JSON Schema subset recipe.json is checked against, and the errors it
// reports (#1276: split out of validate.ts).


// ─── A small JSON Schema (draft-07 subset) ──────────────────────────────────

type JsonType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  title?: string;
  description?: string;
  type?: JsonType | JsonType[];
  enum?: readonly (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema | JsonSchema[];
  additionalItems?: boolean | JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
  anyOf?: JsonSchema[];
  definitions?: Record<string, JsonSchema>;
}

interface SchemaError {
  path: string;
  message: string;
}

function typeOf(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value as JsonType;
}

function typeMatches(value: unknown, type: JsonType): boolean {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

function joinPath(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

export function quoteList(values: readonly unknown[]): string {
  return values.map((v) => JSON.stringify(v)).join(", ");
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  const name = ref.replace(/^#\/definitions\//, "");
  const target = root.definitions?.[name];
  if (!target) throw new Error(`JSON Schema: unresolved $ref ${ref}`);
  return target;
}

/** Errors of `value` against `schema` (the draft-07 subset used here). */
export function schemaErrors(value: unknown, schema: JsonSchema, root: JsonSchema = schema, path = ""): SchemaError[] {
  if (schema.$ref) return schemaErrors(value, resolveRef(schema.$ref, root), root, path);
  const errors: SchemaError[] = [];
  const at = path || "(root)";
  if (schema.anyOf) {
    const branches = schema.anyOf.map((branch) => schemaErrors(value, branch, root, path));
    if (branches.every((branch) => branch.length > 0)) {
      // Report the branch whose type fits, else a summary.
      const fitting = branches.find((branch) => branch.every((e) => !e.message.startsWith("must be of type")));
      errors.push(...(fitting ?? [{ path: at, message: "does not match any allowed form" }]));
    }
    return errors;
  }
  if (schema.type) {
    const types = [schema.type].flat();
    if (!types.some((type) => typeMatches(value, type))) {
      return [{ path: at, message: `must be of type ${types.join(" or ")}` }];
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push({ path: at, message: `must be ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.includes(value as string)) {
    errors.push({ path: at, message: `must be one of ${quoteList(schema.enum)} (got ${JSON.stringify(value)})` });
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: at, message: schema.minLength === 1 ? "must not be empty" : `must have at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path: at, message: `must have at most ${schema.maxLength} characters` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path: at, message: `must match ${schema.pattern} (got ${JSON.stringify(value)})` });
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path: at, message: `must be ≥ ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path: at, message: `must be ≤ ${schema.maximum}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: at, message: `must have at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path: at, message: `must have at most ${schema.maxItems} item${schema.maxItems === 1 ? "" : "s"}` });
    }
    if (schema.uniqueItems) {
      const seen = new Set<string>();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push({ path: at, message: `has a duplicate item ${key}` });
        seen.add(key);
      }
    }
    if (Array.isArray(schema.items)) {
      schema.items.forEach((itemSchema, i) => {
        if (i < value.length) errors.push(...schemaErrors(value[i], itemSchema, root, joinPath(path, i)));
      });
      if (schema.additionalItems === false && value.length > schema.items.length) {
        errors.push({ path: at, message: `must have at most ${schema.items.length} items` });
      }
    } else if (schema.items) {
      const itemSchema = schema.items;
      value.forEach((item, i) => errors.push(...schemaErrors(item, itemSchema, root, joinPath(path, i))));
    }
  }
  if (typeOf(value) === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined) errors.push({ path: joinPath(path, key), message: "is required" });
    }
    for (const [key, item] of Object.entries(obj)) {
      if (schema.propertyNames) errors.push(...schemaErrors(key, schema.propertyNames, root, joinPath(path, key)));
      const propSchema = schema.properties?.[key];
      if (propSchema) errors.push(...schemaErrors(item, propSchema, root, joinPath(path, key)));
      else if (schema.additionalProperties === false) {
        errors.push({ path: joinPath(path, key), message: "is not a known property" });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(...schemaErrors(item, schema.additionalProperties, root, joinPath(path, key)));
      }
    }
  }
  return errors;
}
