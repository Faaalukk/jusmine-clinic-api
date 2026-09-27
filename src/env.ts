function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5180').split(',').map((s) => s.trim()),
  jwtSecret: required('JWT_SECRET'),
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Bangkok',
  accounts: {
    employee: {
      username: process.env.EMPLOYEE_USERNAME ?? 'employee',
      password: required('EMPLOYEE_PASSWORD'),
    },
    manager: {
      username: process.env.MANAGER_USERNAME ?? 'manager',
      password: required('MANAGER_PASSWORD'),
    },
  },
}
