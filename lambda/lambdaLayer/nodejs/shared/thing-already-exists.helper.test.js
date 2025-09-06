import { describe,
         test,
         expect,
         jest,
         beforeEach } from '@jest/globals';

import { mockClient } from 'aws-sdk-client-mock';
import { IoTClient,
         DescribeThingCommand } from '@aws-sdk/client-iot';

import { thingAlreadyExists } from './thing-already-exists.helper.js';


const iotMock = mockClient(IoTClient);

describe('thingAlreadyExists', () => {

  beforeEach(() => {
    iotMock.reset();
    jest.clearAllMocks();
  });

  test('should return exists: true and sameCompany: true when thing exists with same company', async () => {

    const mockResponse = {
      attributes: {
        Company: 'test-company'
      }
    };
    
    iotMock.on(DescribeThingCommand).resolves(mockResponse);
    
    const result = await thingAlreadyExists('us-east-1', 'test-thing', 'test-company');
    
    expect(result).toEqual({
      exists: true,
      sameCompany: true
    });

  });

  test('should return exists: true and sameCompany: false when thing exists with different company', async () => {

    const mockResponse = {
      attributes: {
        Company: 'different-company'
      }
    };
    
    iotMock.on(DescribeThingCommand).resolves(mockResponse);
    
    const result = await thingAlreadyExists('us-east-1', 'test-thing', 'test-company');
    
    expect(result).toEqual({
      exists: true,
      sameCompany: false
    });

  });

  test('should return exists: false when thing does not exist', async () => {

    const error = new Error('Thing not found');
    error.name = 'ResourceNotFoundException';
    
    iotMock.on(DescribeThingCommand).rejects(error);
    
    const result = await thingAlreadyExists('us-east-1', 'test-thing', 'test-company');
    
    expect(result).toEqual({
      exists: false,
      sameCompany: false
    });

  });

  test('should return null when other errors occur', async () => {

    const error = new Error('Some other error');
    error.name = 'SomeOtherException';
    
    iotMock.on(DescribeThingCommand).rejects(error);
    
    const result = await thingAlreadyExists('us-east-1', 'test-thing', 'test-company');
    
    expect(result).toBeNull();

  });

  test('should call DescribeThingCommand with correct parameters', async () => {

    const mockResponse = {
      attributes: {
        Company: 'test-company'
      }
    };
    
    iotMock.on(DescribeThingCommand).resolves(mockResponse);
    
    await thingAlreadyExists('us-east-1', 'test-thing-name', 'test-company');
    
    expect(iotMock.call(0).args[0].input).toEqual({
      thingName: 'test-thing-name'
    });

  });
  
});
