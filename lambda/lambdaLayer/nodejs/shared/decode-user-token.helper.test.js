import {
  describe,
  test,
  expect,
  jest,
  beforeEach
} from '@jest/globals';

jest.mock('jose');

import {
  createRemoteJWKSet,
  jwtVerify
} from 'jose';

import { getDecodedUserToken } from './decode-user-token.helper.js';


const mockCreateRemoteJWKSet = createRemoteJWKSet;
const mockJwtVerify = jwtVerify;

describe('getDecodedUserToken', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return decoded payload when token is valid', async () => {

    const mockPayload = {
      sub: 'user-123',
      email: 'test@example.com',
      'custom:Company': 'test-company'
    };
    
    const mockJwks = {};
    mockCreateRemoteJWKSet.mockReturnValue(mockJwks);
    mockJwtVerify.mockResolvedValue({ payload: mockPayload });
    
    const result = await getDecodedUserToken('us-east-1', 'user-pool-id', 'valid-token');
    
    expect(result).toEqual(mockPayload);
    expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
      new URL('https://cognito-idp.us-east-1.amazonaws.com/user-pool-id/.well-known/jwks.json')
    );
    expect(mockJwtVerify).toHaveBeenCalledWith('valid-token', mockJwks, {
      algorithms: ['RS256']
    });

  });

  test('should return null when token verification fails', async () => {

    const mockJwks = {};
    mockCreateRemoteJWKSet.mockReturnValue(mockJwks);
    mockJwtVerify.mockRejectedValue(new Error('Invalid token'));
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const result = await getDecodedUserToken('us-east-1', 'user-pool-id', 'invalid-token');
    
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[LAMBDA LAYER: getDecodedUserToken]: JWT token decoding failed:',
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();

  });

  test('should construct correct JWKS URI', async () => {

    const mockPayload = { sub: 'user-123' };
    const mockJwks = {};
    
    mockCreateRemoteJWKSet.mockReturnValue(mockJwks);
    mockJwtVerify.mockResolvedValue({ payload: mockPayload });
    
    await getDecodedUserToken('eu-west-1', 'different-pool-id', 'token');
    
    expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
      new URL('https://cognito-idp.eu-west-1.amazonaws.com/different-pool-id/.well-known/jwks.json')
    );

  });

  test('should log decoding message', async () => {

    const mockPayload = { sub: 'user-123' };
    const mockJwks = {};
    
    mockCreateRemoteJWKSet.mockReturnValue(mockJwks);
    mockJwtVerify.mockResolvedValue({ payload: mockPayload });
    
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    await getDecodedUserToken('us-east-1', 'user-pool-id', 'token');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      '[LAMBDA LAYER: getDecodedUserToken]: decoding user JWT token...'
    );
    
    consoleSpy.mockRestore();

  });
  
});
