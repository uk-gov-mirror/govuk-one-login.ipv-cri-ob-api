import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'

const cfnTagNames = [
  'And', 'Base64', 'Cidr', 'Condition', 'Equals', 'FindInMap', 'GetAtt', 'GetAZs',
  'If', 'ImportValue', 'Join', 'Not', 'Or', 'Ref', 'Select', 'Split', 'Sub', 'Transform',
]
const cfnTags = cfnTagNames.flatMap((name) => [
  { collection: 'seq' as const, resolve: (seq: unknown) => seq, tag: `!${name}` },
  { resolve: (str: string) => str, tag: `!${name}` },
])

export const loadTemplate = (relativePath: string): Record<string, unknown> =>
  parse(readFileSync(resolve(__dirname, '../../deploy', relativePath), 'utf-8'), {
    customTags: cfnTags,
  }) as Record<string, unknown>

// Common CloudFormation schemas
export const cfnParameterSchema = z.object({
  AllowedValues: z.array(z.string()).optional(),
  Default: z.union([z.string(), z.number()]).optional(),
  Description: z.string().optional(),
  Type: z.string(),
})

export const cfnOutputSchema = z.object({
  Condition: z.string().optional(),
  Description: z.string().optional(),
  Export: z.object({ Name: z.unknown() }).optional(),
  Value: z.unknown(),
})

export const openApiSchema = z.object({
  info: z.object({
    title: z.string(),
    version: z.string(),
  }),
  openapi: z.string().regex(/^3\.\d+\.\d+$/),
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
})
