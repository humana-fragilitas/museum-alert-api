import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { getUserInfo } from './get-user-info.js';

describe('getUserInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return user info from event claims', () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            email: 'test@example.com',
            'custom:Company': 'test-company',
            'cognito:username': 'testuser'
          }
        }
      }
    };
    
    const result = getUserInfo(mockEvent);
    
    expect(result).toEqual({
      sub: 'user-123',
      email: 'test@example.com',
      'custom:Company': 'test-company',
      'cognito:username': 'testuser'
    });
  });

  test('should return null when requestContext is missing', () => {
    const mockEvent = {};
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const result = getUserInfo(mockEvent);
    
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('Claims not found!');
    
    consoleSpy.mockRestore();
  });

  test('should return null when authorizer is missing', () => {
    const mockEvent = {
      requestContext: {}
    };
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const result = getUserInfo(mockEvent);
    
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('Claims not found!');
    
    consoleSpy.mockRestore();
  });

  test('should return null when claims are missing', () => {
    const mockEvent = {
      requestContext: {
        authorizer: {}
      }
    };
    
    const result = getUserInfo(mockEvent);
    
    expect(result).toEqual({});
  });

  test('should handle empty claims object', () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {}
        }
      }
    };
    
    const result = getUserInfo(mockEvent);
    
    expect(result).toEqual({});
  });

  test('should handle malformed event structure and call console.error', () => {
    const mockEvent = {
      requestContext: null // This will cause an exception
    };
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const result = getUserInfo(mockEvent);
    
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('Claims not found!');
    
    consoleSpy.mockRestore();
  });
});
