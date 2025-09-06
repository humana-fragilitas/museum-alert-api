import { describe,
         test,
         expect,
         jest,
         beforeEach,
         afterEach } from '@jest/globals';

import { validateEnvironmentVariables } from './validate-environment-vars.helper.js';


describe('validateEnvironmentVariables', () => {

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should not throw when all required variables are present', () => {
    process.env.TEST_VAR1 = 'value1';
    process.env.TEST_VAR2 = 'value2';
    
    expect(() => {
      validateEnvironmentVariables(['TEST_VAR1', 'TEST_VAR2']);
    }).not.toThrow();
  });

  test('should throw error when required variables are missing', () => {
    delete process.env.MISSING_VAR;
    
    expect(() => {
      validateEnvironmentVariables(['MISSING_VAR']);
    }).toThrow('[LAMBDA LAYER: validateEnvironmentVariables]: missing required environment variables: MISSING_VAR');
  });

  test('should throw error with multiple missing variables', () => {
    delete process.env.MISSING_VAR1;
    delete process.env.MISSING_VAR2;
    
    expect(() => {
      validateEnvironmentVariables(['MISSING_VAR1', 'MISSING_VAR2']);
    }).toThrow('[LAMBDA LAYER: validateEnvironmentVariables]: missing required environment variables: MISSING_VAR1, MISSING_VAR2');
  });

  test('should handle empty array gracefully', () => {
    expect(() => {
      validateEnvironmentVariables([]);
    }).not.toThrow();
  });

  test('should handle undefined input gracefully', () => {
    expect(() => {
      validateEnvironmentVariables();
    }).not.toThrow();
  });

  test('should handle null input gracefully', () => {
    expect(() => {
      validateEnvironmentVariables(null);
    }).not.toThrow();
  });

  test('should throw only for missing variables in mixed scenario', () => {
    process.env.PRESENT_VAR = 'value';
    delete process.env.MISSING_VAR;
    
    expect(() => {
      validateEnvironmentVariables(['PRESENT_VAR', 'MISSING_VAR']);
    }).toThrow('[LAMBDA LAYER: validateEnvironmentVariables]: missing required environment variables: MISSING_VAR');
  });
  
});
