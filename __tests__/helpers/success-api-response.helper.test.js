import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { successApiResponse } from '../../lambda/lambdaLayer/nodejs/shared/success-api-response.helper.js';

describe('successApiResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return success response with data and default status code', () => {
    const data = { id: 1, name: 'Test' };
    
    const result = successApiResponse(data);
    
    expect(result.statusCode).toBe(200);
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    
    const body = JSON.parse(result.body);
    expect(body.data).toEqual(data);
    expect(body.timestamp).toBeDefined();
  });

  test('should return success response with custom status code', () => {
    const data = { message: 'Created successfully' };
    const statusCode = 201;
    
    const result = successApiResponse(data, statusCode);
    
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.data).toEqual(data);
  });

  test('should handle null data gracefully', () => {
    const result = successApiResponse(null);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toBeNull();
    expect(body.timestamp).toBeDefined();
  });

  test('should handle empty object data', () => {
    const data = {};
    const result = successApiResponse(data);
    
    const body = JSON.parse(result.body);
    expect(body.data).toEqual({});
  });

  test('should include timestamp in ISO format', () => {
    const result = successApiResponse({ test: 'data' });
    const body = JSON.parse(result.body);
    
    expect(body.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });
});
