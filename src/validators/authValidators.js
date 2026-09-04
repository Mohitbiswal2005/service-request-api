const { z } = require('zod');

const signupSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name cannot exceed 50 characters'),
  email: z.string({ error: 'Email is required' }).trim().toLowerCase()
    .email('Please provide a valid email address'),
  password: z.string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
}).strict();

const loginSchema = z.object({
  email: z.string({ error: 'Email is required' }).trim().toLowerCase()
    .email('Please provide a valid email address'),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
}).strict();

const refreshSchema = z.object({
  refreshToken: z.string({ error: 'Refresh token is required' }).min(20, 'Invalid refresh token'),
}).strict();

const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
  allDevices: z.boolean().optional().default(false),
}).strict().refine((d) => d.refreshToken || d.allDevices, {
  message: 'Provide a refreshToken, or set allDevices to true',
});

module.exports = { signupSchema, loginSchema, refreshSchema, logoutSchema };
