// Global test setup
process.env.AWS_REGION = 'us-east-1';
process.env.COMPANIES_TABLE = 'test-companies-table';
process.env.THINGS_TABLE = 'test-things-table';
process.env.IOT_POLICY_NAME = 'test-policy';
process.env.THING_GROUP_NAME = 'test-thing-group';
process.env.PROVISIONING_TEMPLATE_NAME = 'test-provisioning-template';

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
};
