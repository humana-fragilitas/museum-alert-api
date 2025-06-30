import { DescribeThingCommand, IoTClient } from '@aws-sdk/client-iot';
import {
  IoTDataPlaneClient,
  PublishCommand
} from '@aws-sdk/client-iot-data-plane';

import { 
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js'; 


const iotClient = new IoTClient();
const iotDataClient = new IoTDataPlaneClient({
  endpoint: `https://${process.env.IOT_ENDPOINT}`
});

export const handler = async (event) => {

  validateEnvironmentVariables([
    'IOT_ENDPOINT'
  ]);

  try {
    
    const thingName = event.clientId;

    if (!thingName) {
      throw new Error('Missing client id in event');
    }
    
    // Determine connection state based on eventType
    const connected = event.eventType === 'connected';
    
    // Look up the thing to get its attributes
    const describeThingCommand = new DescribeThingCommand({ thingName });
    const thingData = await iotClient.send(describeThingCommand);
    console.log('Thing data:', JSON.stringify(thingData));
    
    // Extract company from thing attributes
    const company = thingData.attributes?.Company;
    if (!company) {
      console.warn(`No Company attribute found for thing: ${thingName}`);
      return {
        statusCode: 400,
        body: `No Company attribute found for thing: ${thingName}`
      };
    }
    
    // Prepare the message to publish
    const message = {
      type: 1,
      timestamp: event.timestamp,
      sn: thingName,
      data: {
        connected: !!connected,
      }
    };
    
    // Publish to company-specific topic
    const topicName = `companies/${company}/events`;
    const publishCommand = new PublishCommand({
      topic: topicName,
      payload: Buffer.from(JSON.stringify(message)),
      qos: 0
    });
    
    await iotDataClient.send(publishCommand);
    console.log(`Successfully published to topic: ${topicName}`);
    
    // TO DO: considering that this lambda is triggered by
    // IoT connection/disconnection events, does still make
    // sense to return a response?

    return {
      statusCode: 200,
      body: `Successfully processed event for thing: ${thingName} ` +
            `and company: ${company}`
    };

  } catch (error) {

    console.error('Error processing event:', error);
    return {
      statusCode: 500,
      body: `Error processing event: ${error.message}`
    };

  }
  
};