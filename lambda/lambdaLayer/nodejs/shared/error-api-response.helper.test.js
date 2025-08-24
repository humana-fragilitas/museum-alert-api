import {
  describe,
  test,
  expect,
  jest,
  beforeEach
} from '@jest/globals';

import { errorApiResponse } from './error-api-response.helper.js';


describe('errorApiResponse', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return error response with message and status code', () => {

    const message = 'Test error message';
    const statusCode = 400;
    
    const result = errorApiResponse(message, statusCode);
    
    expect(result.statusCode).toBe(400);
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    
    const body = JSON.parse(result.body);
    expect(body.error.message).toBe(message);
    expect(body.error.timestamp).toBeDefined();
    expect(body.error.details).toBeUndefined();

  });

  test('should include details when provided', () => {

    const message = 'Test error message';
    const statusCode = 500;
    const details = { field: 'invalid value' };
    
    const result = errorApiResponse(message, statusCode, details);
    
    const body = JSON.parse(result.body);
    expect(body.error.details).toEqual(details);

  });

  test('should handle null details gracefully', () => {

    const message = 'Test error message';
    const statusCode = 404;
    
    const result = errorApiResponse(message, statusCode, null);
    
    const body = JSON.parse(result.body);
    expect(body.error.details).toBeUndefined();

  });

  test('should include timestamp in ISO format', () => {

    const result = errorApiResponse('Test', 400);
    const body = JSON.parse(result.body);
    
    expect(body.error.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

  });
  
});
