/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        jsx: 'react-jsx',
        target: 'ES2020',
        paths: { '@/*': ['./*'] },
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'middleware.ts',
    'next.config.ts',
    'lib/cost-tracker.ts',
    'lib/activity-logger.ts',
    'lib/api.ts',
    'lib/report-html.ts',
    'types/api.ts',
    'app/api/health/route.ts',
    'app/api/cost/route.ts',
    'app/api/admin/logs/route.ts',
    'app/api/diagnose/route.ts',
    'app/api/chat/route.ts',
    'app/api/report/route.ts',
  ],
};
