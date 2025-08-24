import {
  DescribeThingCommand,
  DescribeEndpointCommand,
  IoTClient
} from '@aws-sdk/client-iot';
import {
  IoTDataPlaneClient,
  PublishCommand
} from '@aws-sdk/client-iot-data-plane';


const iotClient = new IoTClient();
let iotDataClient;


/**
 * Lambda function handler for republishing device connection status
 */
export const handler = async (event) => {

  try {

    if (!iotDataClient) {
      const endpointCommand = new DescribeEndpointCommand({
        endpointType: 'iot:Data-ATS',
      });

      const endpointResponse = await iotClient.send(endpointCommand);
      const endpointAddress = endpointResponse.endpointAddress;

      iotDataClient = new IoTDataPlaneClient({
        endpoint: `https://${endpointAddress}`,
      });

      console.log(`Initialized IoT Data client with endpoint: ${endpointAddress}`);
    }

    const thingName = event.clientId;
    if (!thingName) {
      throw new Error('Missing client id in event');
    }

    const connected = event.eventType === 'connected';

    const describeThingCommand = new DescribeThingCommand({ thingName });
    const thingData = await iotClient.send(describeThingCommand);
    console.log('Thing data:', JSON.stringify(thingData));

    const company = thingData.attributes?.Company;
    if (!company) {
      console.warn(`No Company attribute found for thing: ${thingName}`);
      return {
        statusCode: 400,
        body: `No Company attribute found for thing: ${thingName}`,
      };
    }

    const message = {
      type: 1,
      timestamp: event.timestamp,
      sn: thingName,
      data: { connected },
    };

    const topicName = `companies/${company}/events`;
    const publishCommand = new PublishCommand({
      topic: topicName,
      payload: Buffer.from(JSON.stringify(message)),
      qos: 0,
    });

    await iotDataClient.send(publishCommand);
    console.log(`Published to topic: ${topicName}`);

    return {
      statusCode: 200,
      body: `Processed event for thing: ${thingName} and company: ${company}`,
    };

  } catch (error) {

    console.error('Error processing event:', error);
    return {
      statusCode: 500,
      body: `Error: ${error.message}`,
    };
    
  }

};
