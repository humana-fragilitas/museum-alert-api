import { describe,
         test,
         expect,
         jest,
         beforeEach } from '@jest/globals';

import { mockClient } from 'aws-sdk-client-mock';
import { IoTClient,
         CreateProvisioningClaimCommand } from '@aws-sdk/client-iot';

import { handler } from './index.mjs';


const iotMock = mockClient(IoTClient);

jest.mock('/opt/nodejs/shared/index.js', () => ({
  errorApiResponse: jest.fn(),
  successApiResponse: jest.fn(),
  validateEnvironmentVariables: jest.fn()
}));

import {
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js';


describe('createProvisioningClaimLambda', () => {

  beforeEach(() => {

    iotMock.reset();
    jest.clearAllMocks();
    
    process.env.AWS_REGION = 'us-east-1';
    process.env.TEMPLATE_NAME = 'test-provisioning-template';
    
    errorApiResponse.mockImplementation((message, statusCode, details) => ({
      statusCode,
      body: JSON.stringify({ error: { message, details } })
    }));
    
    successApiResponse.mockImplementation((data) => ({
      statusCode: 200,
      body: JSON.stringify({ data })
    }));

  });

  test('should successfully create provisioning claim', async () => {

    const mockEvent = {};

    const mockProvisioningClaim = {
      certificateId: 'cert-123',
      certificatePem: '-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----',
      keyPair: {
        PrivateKey: 'mock-private-key',
        PublicKey: 'mock-public-key'
      },
      expiration: '2024-01-01T00:00:00Z'
    };

    iotMock.on(CreateProvisioningClaimCommand).resolves(mockProvisioningClaim);

    const result = await handler(mockEvent);

    expect(validateEnvironmentVariables).toHaveBeenCalledWith([
      'AWS_REGION',
      'TEMPLATE_NAME'
    ]);

    expect(iotMock.call(0).args[0].input).toEqual({
      templateName: 'test-provisioning-template'
    });

    expect(successApiResponse).toHaveBeenCalledWith({
      message: 'Successfully created provisioning claim',
      certificateId: 'cert-123',
      certificatePem: '-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----',
      keyPair: mockProvisioningClaim.keyPair,
      expiration: '2024-01-01T00:00:00Z'
    });

  });

  test('should handle InternalFailureException', async () => {

    const mockEvent = {};

    const error = new Error('Internal failure');
    error.name = 'InternalFailureException';
    iotMock.on(CreateProvisioningClaimCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'An internal failure prevented the provisioning claim from being created',
      500,
      'Internal failure'
    );

  });

  test('should handle InvalidRequestException', async () => {

    const mockEvent = {};

    const error = new Error('Invalid request');
    error.name = 'InvalidRequestException';
    iotMock.on(CreateProvisioningClaimCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'An invalid request prevented the provisioning claim from being created',
      400,
      'Invalid request'
    );

  });

  test('should handle ResourceNotFoundException', async () => {

    const mockEvent = {};

    const error = new Error('Template not found');
    error.name = 'ResourceNotFoundException';
    iotMock.on(CreateProvisioningClaimCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'A non existing required resource prevented the provisioning claim from being created',
      404,
      'Template not found'
    );

  });

  test('should handle ThrottlingException', async () => {

    const mockEvent = {};

    const error = new Error('Too many requests');
    error.name = 'ThrottlingException';
    iotMock.on(CreateProvisioningClaimCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Service throttling prevented the provisioning claim from being created',
      429,
      'Too many requests'
    );

  });

  test('should handle UnauthorizedException', async () => {

    const mockEvent = {};

    const error = new Error('Unauthorized');
    error.name = 'UnauthorizedException';
    iotMock.on(CreateProvisioningClaimCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Unauthorized access prevented the provisioning claim from being created',
      403,
      'Unauthorized'
    );

  });

  test('should handle generic errors', async () => {

    const mockEvent = {};

    const error = new Error('Unknown error');
    error.name = 'UnknownException';
    iotMock.on(CreateProvisioningClaimCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'An unexpected error prevented the provisioning claim from being created',
      500,
      'Unknown error'
    );

  });

  test('should use correct template name from environment', async () => {

    process.env.TEMPLATE_NAME = 'custom-template-name';
    
    const mockEvent = {};
    const mockProvisioningClaim = {
      certificateId: 'cert-123',
      certificatePem: 'cert-pem',
      keyPair: { PrivateKey: 'key', PublicKey: 'pub' },
      expiration: '2024-01-01T00:00:00Z'
    };

    iotMock.on(CreateProvisioningClaimCommand).resolves(mockProvisioningClaim);

    await handler(mockEvent);

    expect(iotMock.call(0).args[0].input).toEqual({
      templateName: 'custom-template-name'
    });

  });
  
});
